/**
 * SECURE PASSWORD MANAGER
 * 
 * Centralized password security system with:
 * - Strong hashing (bcrypt with salt rounds 12+)
 * - Environment variable enforcement 
 * - Zero hardcoded passwords
 * - Secure random password generation
 * - Password strength validation
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

class SecurePasswordManager {
    constructor() {
        this.SALT_ROUNDS = 12;
        this.MIN_PASSWORD_LENGTH = 12;
        this.REQUIRED_ENV_VARS = ['AUTH_PASSWORD', 'JWT_SECRET'];
    }

    /**
     * Generate a cryptographically secure random password
     */
    generateSecurePassword(length = 16) {
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
        let password = '';
        
        for (let i = 0; i < length; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }
        
        // Ensure password meets complexity requirements
        const hasUpper = /[A-Z]/.test(password);
        const hasLower = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecial = /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password);
        
        if (!(hasUpper && hasLower && hasNumber && hasSpecial)) {
            return this.generateSecurePassword(length); // Regenerate if not complex enough
        }
        
        return password;
    }

    /**
     * Validate password strength
     */
    validatePasswordStrength(password) {
        if (!password || password.length < this.MIN_PASSWORD_LENGTH) {
            return { valid: false, reason: `Password must be at least ${this.MIN_PASSWORD_LENGTH} characters` };
        }
        
        const checks = {
            length: password.length >= this.MIN_PASSWORD_LENGTH,
            uppercase: /[A-Z]/.test(password),
            lowercase: /[a-z]/.test(password),
            number: /\d/.test(password),
            special: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)
        };
        
        const failed = Object.entries(checks).filter(([key, passed]) => !passed).map(([key]) => key);
        
        if (failed.length > 0) {
            return { 
                valid: false, 
                reason: `Password missing: ${failed.join(', ')}`,
                requirements: {
                    'length': 'At least 12 characters',
                    'uppercase': 'At least one uppercase letter',
                    'lowercase': 'At least one lowercase letter', 
                    'number': 'At least one number',
                    'special': 'At least one special character'
                }
            };
        }
        
        return { valid: true };
    }

    /**
     * Securely hash password with bcrypt
     */
    async hashPassword(password) {
        const validation = this.validatePasswordStrength(password);
        if (!validation.valid) {
            throw new Error(`Password validation failed: ${validation.reason}`);
        }
        
        return await bcrypt.hash(password, this.SALT_ROUNDS);
    }

    /**
     * Verify password against hash
     */
    async verifyPassword(password, hash) {
        return await bcrypt.compare(password, hash);
    }

    /**
     * Get password from environment with secure fallback
     */
    getEnvironmentPassword(envVar, context = 'authentication') {
        const password = process.env[envVar];
        
        if (!password) {
            const securePassword = this.generateSecurePassword();
            console.warn(`🔐 WARNING: ${envVar} not set! Generated secure password for ${context}`);
            console.warn(`🔐 Please set ${envVar}=${securePassword} in your environment`);
            console.warn(`🔐 Using temporary secure password for this session only`);
            return securePassword;
        }

        // Validate environment password strength
        const validation = this.validatePasswordStrength(password);
        if (!validation.valid) {
            console.error(`🚨 SECURITY ERROR: ${envVar} does not meet security requirements!`);
            console.error(`🚨 ${validation.reason}`);
            if (validation.requirements) {
                console.error('🚨 Requirements:');
                Object.entries(validation.requirements).forEach(([key, desc]) => {
                    console.error(`   - ${desc}`);
                });
            }
            throw new Error(`Environment password ${envVar} fails security validation`);
        }
        
        return password;
    }

    /**
     * Validate all required environment variables are set
     */
    validateEnvironmentSecurity() {
        const missing = [];
        const weak = [];
        
        for (const envVar of this.REQUIRED_ENV_VARS) {
            const value = process.env[envVar];
            if (!value) {
                missing.push(envVar);
            } else {
                const validation = this.validatePasswordStrength(value);
                if (!validation.valid) {
                    weak.push({ var: envVar, reason: validation.reason });
                }
            }
        }
        
        return {
            valid: missing.length === 0 && weak.length === 0,
            missing,
            weak
        };
    }

    /**
     * Initialize secure session with all required passwords
     */
    initializeSecureSecurity() {
        console.log('🔐 Initializing Secure Password Manager...');
        
        const validation = this.validateEnvironmentSecurity();
        
        if (!validation.valid) {
            console.error('🚨 SECURITY VALIDATION FAILED!');
            
            if (validation.missing.length > 0) {
                console.error('🚨 Missing required environment variables:');
                validation.missing.forEach(env => console.error(`   - ${env}`));
            }
            
            if (validation.weak.length > 0) {
                console.error('🚨 Weak passwords in environment:');
                validation.weak.forEach(({var: envVar, reason}) => console.error(`   - ${envVar}: ${reason}`));
            }
            
            console.error('🚨 Please set strong passwords in your environment before starting');
            return false;
        }
        
        console.log('✅ All passwords meet security requirements');
        return true;
    }
}

module.exports = SecurePasswordManager;