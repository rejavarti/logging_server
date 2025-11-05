#!/usr/bin/env node
/**
 * Environment File Security Manager
 * Provides additional security features for .env file management
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EnvSecurityManager {
    constructor() {
        this.envPath = path.join(__dirname, '.env');
        this.backupPath = path.join(__dirname, 'data', '.env.backup');
        this.encryptedPath = path.join(__dirname, 'data', '.env.encrypted');
    }

    // Create encrypted backup of .env file
    createEncryptedBackup(password) {
        if (!fs.existsSync(this.envPath)) {
            throw new Error('.env file not found');
        }

        const envContent = fs.readFileSync(this.envPath, 'utf8');
        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(16);
        
        // Derive key from password
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        
        // Encrypt content
        const cipher = crypto.createCipherGCM('aes-256-gcm', key, iv);
        let encrypted = cipher.update(envContent, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const tag = cipher.getAuthTag();
        
        // Store encrypted data with metadata
        const encryptedData = {
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            tag: tag.toString('hex'),
            encrypted: encrypted,
            timestamp: new Date().toISOString(),
            version: '1.0'
        };
        
        // Ensure backup directory exists
        const backupDir = path.dirname(this.encryptedPath);
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        fs.writeFileSync(this.encryptedPath, JSON.stringify(encryptedData, null, 2));
        console.log('✅ Encrypted backup created successfully');
    }

    // Restore .env file from encrypted backup
    restoreFromEncryptedBackup(password) {
        if (!fs.existsSync(this.encryptedPath)) {
            throw new Error('Encrypted backup not found');
        }

        const encryptedData = JSON.parse(fs.readFileSync(this.encryptedPath, 'utf8'));
        
        // Reconstruct encryption components
        const salt = Buffer.from(encryptedData.salt, 'hex');
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const tag = Buffer.from(encryptedData.tag, 'hex');
        const encrypted = encryptedData.encrypted;
        
        // Derive key from password
        const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
        
        try {
            // Decrypt content
            const decipher = crypto.createDecipherGCM('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            // Write restored .env file with secure permissions
            fs.writeFileSync(this.envPath, decrypted, { mode: 0o600 });
            console.log('✅ Environment file restored from encrypted backup');
            
        } catch (error) {
            throw new Error('Failed to decrypt backup - incorrect password or corrupted data');
        }
    }

    // Create plaintext backup (less secure but simpler)
    createPlaintextBackup() {
        if (!fs.existsSync(this.envPath)) {
            throw new Error('.env file not found');
        }

        const envContent = fs.readFileSync(this.envPath, 'utf8');
        const backupDir = path.dirname(this.backupPath);
        
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        
        fs.writeFileSync(this.backupPath, envContent, { mode: 0o600 });
        console.log('✅ Plaintext backup created (secure permissions applied)');
    }

    // Verify .env file permissions and security
    checkSecurity() {
        if (!fs.existsSync(this.envPath)) {
            console.log('⚠️  .env file not found');
            return false;
        }

        const stats = fs.statSync(this.envPath);
        const permissions = (stats.mode & parseInt('777', 8)).toString(8);
        
        console.log('\n🔒 Environment File Security Status:');
        console.log(`📁 File: ${this.envPath}`);
        console.log(`🔐 Permissions: ${permissions}`);
        console.log(`📊 Size: ${stats.size} bytes`);
        console.log(`📅 Modified: ${stats.mtime.toISOString()}`);
        
        // Check if permissions are secure
        if (permissions === '600') {
            console.log('✅ File permissions are secure (owner read/write only)');
            return true;
        } else {
            console.log('⚠️  File permissions may be too permissive');
            console.log('🔧 Recommended: chmod 600 .env');
            return false;
        }
    }

    // Secure the .env file permissions
    securePermissions() {
        if (!fs.existsSync(this.envPath)) {
            throw new Error('.env file not found');
        }

        fs.chmodSync(this.envPath, 0o600);
        console.log('✅ Environment file permissions secured (600)');
    }

    // Remove sensitive data from .env file (for sharing/debugging)
    createSanitizedCopy() {
        if (!fs.existsSync(this.envPath)) {
            throw new Error('.env file not found');
        }

        const envContent = fs.readFileSync(this.envPath, 'utf8');
        const sanitizedPath = path.join(__dirname, '.env.sanitized');
        
        // Replace sensitive values
        const sanitized = envContent
            .replace(/AUTH_PASSWORD=.*/g, 'AUTH_PASSWORD=***REDACTED***')
            .replace(/JWT_SECRET=.*/g, 'JWT_SECRET=***REDACTED***')
            .replace(/SESSION_SECRET=.*/g, 'SESSION_SECRET=***REDACTED***')
            .replace(/API_KEY=.*/g, 'API_KEY=***REDACTED***')
            .replace(/TOKEN=.*/g, 'TOKEN=***REDACTED***')
            .replace(/SECRET=.*/g, 'SECRET=***REDACTED***')
            .replace(/PASSWORD=.*/g, 'PASSWORD=***REDACTED***');
        
        fs.writeFileSync(sanitizedPath, sanitized);
        console.log(`✅ Sanitized copy created: ${sanitizedPath}`);
        console.log('⚠️  This copy is safe to share but cannot be used to start the server');
    }
}

// CLI interface
if (require.main === module) {
    const manager = new EnvSecurityManager();
    const command = process.argv[2];
    const password = process.argv[3];

    try {
        switch (command) {
            case 'check':
                manager.checkSecurity();
                break;
            case 'secure':
                manager.securePermissions();
                break;
            case 'backup':
                manager.createPlaintextBackup();
                break;
            case 'backup-encrypted':
                if (!password) {
                    console.error('❌ Password required for encrypted backup');
                    console.log('Usage: node env-security.js backup-encrypted <password>');
                    process.exit(1);
                }
                manager.createEncryptedBackup(password);
                break;
            case 'restore':
                if (!password) {
                    console.error('❌ Password required for restore');
                    console.log('Usage: node env-security.js restore <password>');
                    process.exit(1);
                }
                manager.restoreFromEncryptedBackup(password);
                break;
            case 'sanitize':
                manager.createSanitizedCopy();
                break;
            default:
                console.log('\n🔒 Environment File Security Manager');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('Usage: node env-security.js <command> [password]');
                console.log('\nCommands:');
                console.log('  check              - Check current security status');
                console.log('  secure             - Set secure permissions (600)');
                console.log('  backup             - Create plaintext backup');
                console.log('  backup-encrypted   - Create encrypted backup (requires password)');
                console.log('  restore            - Restore from encrypted backup (requires password)');
                console.log('  sanitize           - Create sanitized copy (safe to share)');
                console.log('\nExamples:');
                console.log('  node env-security.js check');
                console.log('  node env-security.js backup-encrypted MySecurePassword123');
                console.log('  node env-security.js restore MySecurePassword123');
        }
    } catch (error) {
        console.error('❌', error.message);
        process.exit(1);
    }
}

module.exports = EnvSecurityManager;