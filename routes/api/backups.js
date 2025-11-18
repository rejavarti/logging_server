/**
 * Backups API Routes
 * Handles backup creation, download, restore, and management
 */

const express = require('express');
const router = express.Router();

// Get list of backups
router.get('/backups', async (req, res) => {
    try {
        const fs = require('fs').promises;
        const path = require('path');
        
        // Define backup directory
        const backupDir = path.join(__dirname, '../../backups');
        
        let backups = [];
        
        // Try to read actual backup files
        try {
            await fs.mkdir(backupDir, { recursive: true });
            const files = await fs.readdir(backupDir);
            
            // Get stats for each backup file
            for (const file of files) {
                if (file.endsWith('.zip') || file.endsWith('.db')) {
                    const filePath = path.join(backupDir, file);
                    const stats = await fs.stat(filePath);
                    
                    // Format file size
                    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
                    const sizeStr = sizeInMB < 1 
                        ? `${(stats.size / 1024).toFixed(2)} KB`
                        : `${sizeInMB} MB`;
                    
                    // Use mtimeMs or birthtimeMs (ms since epoch), fallback to current time if invalid
                    const createdMs = stats.birthtimeMs && stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs;
                    const modifiedMs = stats.mtimeMs;
                    
                    backups.push({
                        filename: file,
                        size: sizeStr,
                        size_bytes: stats.size,
                        created: new Date(createdMs).toISOString(),
                        modified: new Date(modifiedMs).toISOString(),
                        type: file.includes('manual') ? 'manual' : 'automatic',
                        includes: ['database', 'settings', 'logs', 'dashboards']
                    });
                }
            }
            
            // Sort by creation date, newest first
            backups.sort((a, b) => new Date(b.created) - new Date(a.created));
            
        } catch (fsError) {
            req.app.locals?.loggers?.api?.error('Could not read backup directory:', fsError.message);
            // Return empty array instead of mock data
            backups = [];
        }
        
        // Add log count metadata if DAL available
        if (req.dal && req.dal.getSystemStats) {
            try {
                const stats = await req.dal.getSystemStats();
                backups = backups.map(backup => ({
                    ...backup,
                    log_count: stats.totalLogs || 0
                }));
            } catch (statsErr) {
                req.app.locals?.loggers?.api?.warn('Could not get log count stats:', statsErr.message);
            }
        }

        res.json({ success: true, backups });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting backups:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create new backup
router.post('/backups/create', async (req, res) => {
    try {
        const { type = 'manual', includes = ['database', 'settings', 'logs'] } = req.body;
        
        const fs = require('fs').promises;
        const fsSync = require('fs');
        const path = require('path');
        const archiver = require('archiver');
        
        const backupDir = path.join(__dirname, '../../backups');
        await fs.mkdir(backupDir, { recursive: true });
        
        const backupName = `backup-${new Date().toISOString().split('T')[0]}-${Date.now()}.zip`;
        const backupPath = path.join(backupDir, backupName);
        
        // Create write stream for the backup file
        const output = fsSync.createWriteStream(backupPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        // Listen for archive events
        let archiveSize = 0;
        output.on('close', () => {
            archiveSize = archive.pointer();
        });
        
        archive.on('error', (err) => {
            throw err;
        });
        
        // Pipe archive data to the file
        archive.pipe(output);
        
        // Add database file if included
        if (includes.includes('database')) {
            const dbPath = path.join(__dirname, '../../data/logs.db');
            try {
                await fs.access(dbPath);
                archive.file(dbPath, { name: 'logs.db' });
            } catch (err) {
                req.app.locals?.loggers?.api?.warn('Database file not found for backup');
            }
            
            // Also backup enterprise_logs.db
            const enterpriseDbPath = path.join(__dirname, '../../data/enterprise_logs.db');
            try {
                await fs.access(enterpriseDbPath);
                archive.file(enterpriseDbPath, { name: 'enterprise_logs.db' });
            } catch (err) {
                req.app.locals?.loggers?.api?.warn('Enterprise database file not found for backup');
            }
        }
        
        // Add settings if included
        if (includes.includes('settings')) {
            const settingsPath = path.join(__dirname, '../../data/settings.json');
            try {
                await fs.access(settingsPath);
                archive.file(settingsPath, { name: 'settings.json' });
            } catch (err) {
                // Settings file does not exist; skip without adding a placeholder
            }
        }
        
        // Finalize the archive
        await archive.finalize();
        
        // Wait for output stream to close
        await new Promise((resolve) => output.on('close', resolve));
        
        // Get actual file stats
        const stats = await fs.stat(backupPath);
        const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
        const sizeStr = sizeInMB < 1 
            ? `${(stats.size / 1024).toFixed(2)}KB`
            : `${sizeInMB}MB`;
        
        const backup = {
            filename: backupName,
            size: sizeStr,
            size_bytes: stats.size,
            created: new Date().toISOString(),
            type,
            includes,
            createdBy: req.user ? req.user.username : 'system',
            status: 'completed'
        };

        // Store backup metadata in database
        if (req.dal) {
            try {
                await req.dal.run(
                    `INSERT INTO backups (filename, filepath, size_bytes, backup_type, status, tables_included, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [backupName, backupPath, stats.size, type, 'completed', JSON.stringify(includes), req.user?.id || null]
                );
            } catch (dbErr) {
                req.app.locals?.loggers?.api?.warn('Failed to store backup metadata in database:', dbErr.message);
            }
        }

        // Log backup creation activity
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'create_backup',
                    resource_type: 'backup',
                    resource_id: backupName,
                    details: JSON.stringify({ 
                        filename: backupName,
                        type,
                        includes,
                        size: sizeStr
                    }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log backup creation activity:', auditErr.message);
            }
        }
        
        req.app.locals?.loggers?.api?.info(`Backup created: ${backupName} by ${req.user ? req.user.username : 'system'}`);
        
        res.json({ success: true, backup });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error creating backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download backup file
router.get('/backups/:filename/download', async (req, res) => {
    try {
        const { filename } = req.params;
        const path = require('path');
        const fs = require('fs');
        
        // Validate filename to prevent directory traversal
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        
        const backupDir = path.join(__dirname, '../../backups');
        const filePath = path.join(backupDir, filename);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: 'Backup file not found' });
        }
        
        req.app.locals?.loggers?.api?.info(`Backup download requested: ${filename} by ${req.user ? req.user.username : 'system'}`);
        
        // Log backup download activity
        if (req.dal && req.dal.logActivity && req.user) {
            try {
                await req.dal.logActivity({
                    user_id: req.user.id,
                    action: 'download_backup',
                    resource_type: 'backup',
                    resource_id: filename,
                    details: JSON.stringify({ filename }),
                    ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                    user_agent: req.headers['user-agent'] || 'unknown'
                });
            } catch (auditErr) {
                req.app.locals?.loggers?.api?.warn('Failed to log backup download activity:', auditErr.message);
            }
        }
        
        // Use res.download() to trigger browser download
        res.download(filePath, filename, (err) => {
            if (err) {
                req.app.locals?.loggers?.api?.error('Download error:', err);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: 'Failed to download backup' });
                }
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error downloading backup:', error);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// Restore from backup
router.post('/backups/:filename/restore', async (req, res) => {
    try {
        const { filename } = req.params;
        const { components = ['database', 'settings'] } = req.body;
        
        // Require real implementation - no simulation
        if (!req.dal || !req.dal.restoreBackup) {
            return res.status(501).json({ 
                success: false, 
                error: 'Backup restore not implemented - database access layer unavailable' 
            });
        }
        
        const result = await req.dal.restoreBackup(filename, components);
        
        req.app.locals?.loggers?.api?.info(`Backup restore initiated: ${filename} by ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'Backup restore completed successfully',
            filename,
            components,
            restoredBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString(),
            requiresRestart: result.requiresRestart || true
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error restoring backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete backup
router.delete('/backups/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        
            const fs = require('fs').promises;
            const path = require('path');
        
            // Validate filename to prevent directory traversal
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return res.status(400).json({ success: false, error: 'Invalid filename' });
            }
        
            const backupDir = path.join(__dirname, '../../backups');
            const filePath = path.join(backupDir, filename);
        
            // Check if file exists
            try {
                await fs.access(filePath);
            } catch (err) {
                return res.status(404).json({ success: false, error: 'Backup file not found' });
            }
        
            // Delete the file
            await fs.unlink(filePath);
        
            // Log backup deletion activity
            if (req.dal && req.dal.logActivity && req.user) {
                try {
                    await req.dal.logActivity({
                        user_id: req.user.id,
                        action: 'delete_backup',
                        resource_type: 'backup',
                        resource_id: filename,
                        details: JSON.stringify({ 
                            filename,
                            deleted_by: req.user.username
                        }),
                        ip_address: req.ip || req.connection.remoteAddress || 'unknown',
                        user_agent: req.headers['user-agent'] || 'unknown'
                    });
                } catch (auditErr) {
                    req.app.locals?.loggers?.api?.warn('Failed to log backup deletion activity:', auditErr.message);
                }
            }
        
        req.app.locals?.loggers?.api?.info(`Backup deleted: ${filename} by ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'Backup deleted successfully',
            filename,
            deletedBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting backup:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;