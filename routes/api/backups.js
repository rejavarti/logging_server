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
                        includes: ['database', 'sessions', 'settings', 'logs', 'config']
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
        const { type = 'manual', includes = ['database', 'sessions', 'settings', 'logs', 'config'] } = req.body;
        
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
            const dbPath = path.join(__dirname, '../../data/databases/logs.db');
            try {
                await fs.access(dbPath);
                archive.file(dbPath, { name: 'databases/logs.db' });
            } catch (err) {
                req.app.locals?.loggers?.api?.warn('Database file not found for backup (checked /data/databases/logs.db)');
            }
            
            // Also backup enterprise_logs.db (REAL database with actual data)
            const enterpriseDbPath = path.join(__dirname, '../../data/databases/enterprise_logs.db');
            try {
                await fs.access(enterpriseDbPath);
                archive.file(enterpriseDbPath, { name: 'databases/enterprise_logs.db' });
            } catch (err) {
                req.app.locals?.loggers?.api?.warn('Enterprise database file not found for backup (checked /data/databases/enterprise_logs.db)');
            }
            
            // Backup sessions database
            const sessionsDbPath = path.join(__dirname, '../../data/sessions/sessions.db');
            try {
                await fs.access(sessionsDbPath);
                archive.file(sessionsDbPath, { name: 'sessions/sessions.db' });
            } catch (err) {
                req.app.locals?.loggers?.api?.warn('Sessions database not found for backup');
            }
        }
        
        // Add settings if included
        if (includes.includes('settings')) {
            const settingsPath = path.join(__dirname, '../../data/settings.json');
            try {
                await fs.access(settingsPath);
                archive.file(settingsPath, { name: 'settings.json' });
            } catch (err) {
                // Settings file does not exist; skip gracefully (no settings.json yet)
            }
        }
        
        // Add application logs if included
        if (includes.includes('logs')) {
            const logsDir = path.join(__dirname, '../../data/logs');
            try {
                await fs.access(logsDir);
                const logFiles = await fs.readdir(logsDir);
                
                for (const logFile of logFiles) {
                    if (logFile.endsWith('.log')) {
                        const logPath = path.join(logsDir, logFile);
                        try {
                            await fs.access(logPath);
                            archive.file(logPath, { name: `logs/${logFile}` });
                        } catch (err) {
                            // Skip if log file not accessible
                        }
                    }
                }
            } catch (err) {
                req.app.locals?.loggers?.api?.warn('Logs directory not found for backup');
            }
        }
        
        // Add config files if included
        if (includes.includes('config')) {
            const configDir = path.join(__dirname, '../../data/config');
            try {
                await fs.access(configDir);
                const configFiles = await fs.readdir(configDir);
                
                for (const configFile of configFiles) {
                    const configPath = path.join(configDir, configFile);
                    const stat = await fs.stat(configPath);
                    
                    if (stat.isFile()) {
                        archive.file(configPath, { name: `config/${configFile}` });
                    }
                }
            } catch (err) {
                // Config directory empty or not accessible, skip gracefully
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
                     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
        const fs = require('fs').promises;
        const path = require('path');
        const AdmZip = require('adm-zip');
        
        // Validate filename
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        
        const backupDir = path.join(__dirname, '../../data/backups');
        const backupPath = path.join(backupDir, filename);
        
        // Check if backup exists
        try {
            await fs.access(backupPath);
        } catch {
            return res.status(404).json({ success: false, error: 'Backup file not found' });
        }
        
        // Extract and restore
        const zip = new AdmZip(backupPath);
        const zipEntries = zip.getEntries();
        
        const restoredComponents = [];
        
        // Restore database
        if (components.includes('database')) {
            const dbEntry = zipEntries.find(e => e.entryName === 'logs.db');
            if (dbEntry) {
                const dbPath = path.join(__dirname, '../../data/databases/logs.db');
                const backupDbPath = dbPath + '.backup-' + Date.now();
                
                // Backup current database
                try {
                    await fs.copyFile(dbPath, backupDbPath);
                } catch (err) {
                    req.app.locals?.loggers?.api?.warn('Could not backup current database:', err);
                }
                
                // Restore from backup
                zip.extractEntryTo(dbEntry, path.dirname(dbPath), false, true);
                restoredComponents.push('database');
            }
        }
        
        // Restore settings
        if (components.includes('settings')) {
            const settingsEntry = zipEntries.find(e => e.entryName === 'settings.json');
            if (settingsEntry) {
                const settingsPath = path.join(__dirname, '../../data/config/settings.json');
                const settingsDir = path.dirname(settingsPath);
                
                await fs.mkdir(settingsDir, { recursive: true });
                zip.extractEntryTo(settingsEntry, settingsDir, false, true);
                restoredComponents.push('settings');
            }
        }
        
        req.app.locals?.loggers?.api?.info(`Backup restored: ${filename} (${restoredComponents.join(', ')}) by ${req.user ? req.user.username : 'system'}`);
        
        res.json({
            success: true,
            message: 'Backup restored successfully',
            filename,
            components: restoredComponents,
            restoredBy: req.user ? req.user.username : 'system',
            timestamp: new Date().toISOString(),
            requiresRestart: true
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