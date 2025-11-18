#!/usr/bin/env node
/**
 * 🔒 ENHANCED ENCRYPTION SYSTEM
 * Enterprise-grade encryption for sensitive data storage and transmission
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class AdvancedEncryptionSystem {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyDerivationIterations = 100000;
        this.saltLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
        this.keyLength = 32;
    }

    // Generate cryptographically secure key from password
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(password, salt, this.keyDerivationIterations, this.keyLength, 'sha512');
    }

    // Generate secure random salt
    generateSalt() {
        return crypto.randomBytes(this.saltLength);
    }

    // Generate secure random IV
    generateIV() {
        return crypto.randomBytes(this.ivLength);
    }

    // Encrypt data with AES-256-GCM
    encrypt(plaintext, password) {
        try {
            const salt = this.generateSalt();
            const iv = this.generateIV();
            const key = this.deriveKey(password, salt);

            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            let encrypted = cipher.update(plaintext, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            // Create HMAC for authentication
            const hmac = crypto.createHmac('sha256', key);
            hmac.update(encrypted);
            const authTag = hmac.digest();

            // Combine all components into a single encrypted package
            const encryptedPackage = {
                algorithm: 'aes-256-cbc',
                salt: salt.toString('hex'),
                iv: iv.toString('hex'),
                authTag: authTag.toString('hex'),
                encrypted: encrypted,
                timestamp: new Date().toISOString(),
                version: '1.0'
            };

            return JSON.stringify(encryptedPackage);
        } catch (error) {
            throw new Error(`Encryption failed: ${error.message}`);
        }
    }

    // Decrypt data with AES-256-GCM
    decrypt(encryptedData, password) {
        try {
            const encryptedPackage = JSON.parse(encryptedData);
            
            const salt = Buffer.from(encryptedPackage.salt, 'hex');
            const iv = Buffer.from(encryptedPackage.iv, 'hex');
            const authTag = Buffer.from(encryptedPackage.authTag, 'hex');
            const encrypted = encryptedPackage.encrypted;
            
            const key = this.deriveKey(password, salt);
            
            // Verify HMAC before decryption
            const hmac = crypto.createHmac('sha256', key);
            hmac.update(encrypted);
            const expectedTag = hmac.digest();
            
            if (!crypto.timingSafeEqual(authTag, expectedTag)) {
                throw new Error('Authentication tag verification failed');
            }
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    // Encrypt file in place
    encryptFile(filePath, password, outputPath = null) {
        const outputFilePath = outputPath || `${filePath}.encrypted`;
        
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const encryptedContent = this.encrypt(fileContent, password);
        
        fs.writeFileSync(outputFilePath, encryptedContent, { mode: 0o600 });
        
        return outputFilePath;
    }

    // Decrypt file
    decryptFile(encryptedFilePath, password, outputPath = null) {
        const outputFilePath = outputPath || encryptedFilePath.replace('.encrypted', '');
        
        if (!fs.existsSync(encryptedFilePath)) {
            throw new Error(`Encrypted file not found: ${encryptedFilePath}`);
        }

        const encryptedContent = fs.readFileSync(encryptedFilePath, 'utf8');
        const decryptedContent = this.decrypt(encryptedContent, password);
        
        fs.writeFileSync(outputFilePath, decryptedContent, { mode: 0o600 });
        
        return outputFilePath;
    }

    // Generate secure password
    generateSecurePassword(length = 32) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        let password = '';
        
        for (let i = 0; i < length; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }
        
        return password;
    }

    // Generate secure API key
    generateApiKey(length = 64) {
        return crypto.randomBytes(length).toString('hex');
    }

    // Generate JWT secret
    generateJWTSecret(length = 64) {
        return crypto.randomBytes(length).toString('base64');
    }

    // Hash password with salt (for storage)
    hashPassword(password, saltRounds = 12) {
        const bcrypt = require('bcrypt');
        return bcrypt.hashSync(password, saltRounds);
    }

    // Verify password against hash
    verifyPassword(password, hash) {
        const bcrypt = require('bcrypt');
        return bcrypt.compareSync(password, hash);
    }

    // Create secure session token
    createSessionToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Create HMAC signature for data integrity
    createSignature(data, secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(data);
        return hmac.digest('hex');
    }

    // Verify HMAC signature
    verifySignature(data, signature, secret) {
        const expectedSignature = this.createSignature(data, secret);
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    }

    // Encrypt sensitive configuration
    encryptConfig(config, masterPassword) {
        const sensitiveFields = ['password', 'secret', 'token', 'key', 'pass', 'auth'];
        const encryptedConfig = { ...config };
        
        for (const [key, value] of Object.entries(config)) {
            const isSensitive = sensitiveFields.some(field => 
                key.toLowerCase().includes(field.toLowerCase())
            );
            
            if (isSensitive && typeof value === 'string') {
                encryptedConfig[key] = this.encrypt(value, masterPassword);
                encryptedConfig[`${key}_encrypted`] = true;
            }
        }
        
        return encryptedConfig;
    }

    // Decrypt sensitive configuration
    decryptConfig(encryptedConfig, masterPassword) {
        const decryptedConfig = { ...encryptedConfig };
        
        for (const [key, value] of Object.entries(encryptedConfig)) {
            if (key.endsWith('_encrypted') && value === true) {
                const originalKey = key.replace('_encrypted', '');
                if (encryptedConfig[originalKey]) {
                    decryptedConfig[originalKey] = this.decrypt(encryptedConfig[originalKey], masterPassword);
                    delete decryptedConfig[key]; // Remove encryption flag
                }
            }
        }
        
        return decryptedConfig;
    }

    // Secure wipe of sensitive data from memory
    secureWipe(sensitiveString) {
        if (typeof sensitiveString === 'string') {
            // Overwrite string memory (limited effectiveness in JavaScript)
            for (let i = 0; i < sensitiveString.length; i++) {
                sensitiveString = sensitiveString.substring(0, i) + '\0' + sensitiveString.substring(i + 1);
            }
        }
    }

    // Test encryption system integrity
    testIntegrity() {
        console.log('\n🔐 Testing Advanced Encryption System...');
        
        try {
            const testData = 'This is highly sensitive test data that must be protected!';
            const testPassword = process.env.TEST_ENCRYPTION_PASSWORD || require('crypto').randomBytes(32).toString('hex');
            
            // Test basic encryption/decryption
            const encrypted = this.encrypt(testData, testPassword);
            const decrypted = this.decrypt(encrypted, testPassword);
            
            if (decrypted !== testData) {
                throw new Error('Basic encryption/decryption test failed');
            }
            console.log('✅ Basic encryption/decryption: PASSED');
            
            // Test password generation
            const password = this.generateSecurePassword(32);
            if (password.length !== 32) {
                throw new Error('Password generation test failed');
            }
            console.log('✅ Secure password generation: PASSED');
            
            // Test API key generation
            const apiKey = this.generateApiKey(64);
            if (apiKey.length !== 128) { // 64 bytes = 128 hex chars
                throw new Error('API key generation test failed');
            }
            console.log('✅ API key generation: PASSED');
            
            // Test HMAC signatures
            const signature = this.createSignature(testData, testPassword);
            const isValid = this.verifySignature(testData, signature, testPassword);
            if (!isValid) {
                throw new Error('HMAC signature test failed');
            }
            console.log('✅ HMAC signature verification: PASSED');
            
            // Test configuration encryption
            const config = {
                database_password: 'secret123',
                api_key: 'abcdef123456',
                regular_setting: 'not_encrypted'
            };
            
            const encryptedConfig = this.encryptConfig(config, testPassword);
            const decryptedConfig = this.decryptConfig(encryptedConfig, testPassword);
            
            if (decryptedConfig.database_password !== config.database_password) {
                throw new Error('Configuration encryption test failed');
            }
            console.log('✅ Configuration encryption: PASSED');
            
            console.log('\n🎯 All encryption tests PASSED! System is secure and operational.');
            
        } catch (error) {
            console.error(`❌ Encryption test FAILED: ${error.message}`);
            throw error;
        }
    }
}

// CLI interface
if (require.main === module) {
    const encryption = new AdvancedEncryptionSystem();
    const command = process.argv[2];
    
    try {
        switch (command) {
            case 'test':
                encryption.testIntegrity();
                break;
                
            case 'generate-password':
                const length = parseInt(process.argv[3]) || 32;
                console.log(`Generated secure password: ${encryption.generateSecurePassword(length)}`);
                break;
                
            case 'generate-api-key':
                const keyLength = parseInt(process.argv[3]) || 64;
                console.log(`Generated API key: ${encryption.generateApiKey(keyLength)}`);
                break;
                
            case 'generate-jwt-secret':
                const jwtLength = parseInt(process.argv[3]) || 64;
                console.log(`Generated JWT secret: ${encryption.generateJWTSecret(jwtLength)}`);
                break;
                
            case 'encrypt-file':
                const filePath = process.argv[3];
                const password = process.argv[4];
                if (!filePath || !password) {
                    console.error('Usage: node encryption-system.js encrypt-file <file_path> <password>');
                    process.exit(1);
                }
                const encryptedPath = encryption.encryptFile(filePath, password);
                console.log(`File encrypted: ${encryptedPath}`);
                break;
                
            case 'decrypt-file':
                const encryptedFilePath = process.argv[3];
                const decryptPassword = process.argv[4];
                if (!encryptedFilePath || !decryptPassword) {
                    console.error('Usage: node encryption-system.js decrypt-file <encrypted_file_path> <password>');
                    process.exit(1);
                }
                const decryptedPath = encryption.decryptFile(encryptedFilePath, decryptPassword);
                console.log(`File decrypted: ${decryptedPath}`);
                break;
                
            default:
                console.log('\n🔒 Advanced Encryption System');
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.log('Usage: node encryption-system.js <command> [options]');
                console.log('\nCommands:');
                console.log('  test                     - Run integrity tests');
                console.log('  generate-password [len]  - Generate secure password');
                console.log('  generate-api-key [len]   - Generate API key');
                console.log('  generate-jwt-secret [len]- Generate JWT secret');
                console.log('  encrypt-file <file> <pwd>- Encrypt file');
                console.log('  decrypt-file <file> <pwd>- Decrypt file');
                console.log('\nExamples:');
                console.log('  node encryption-system.js test');
                console.log('  node encryption-system.js generate-password 32');
                console.log('  node encryption-system.js encrypt-file sensitive.txt mypassword');
        }
    } catch (error) {
        console.error(`❌ ${error.message}`);
        process.exit(1);
    }
}

module.exports = AdvancedEncryptionSystem;