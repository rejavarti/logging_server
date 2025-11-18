#!/usr/bin/env node
/**
 * 🔐 FIX SERVER DATABASE ADMIN PASSWORD
 * Ensure the server database has the correct admin password
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

async function fixServerAdminPassword() {
    const serverDbPath = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');
    
    console.log('🔐 Fixing server database admin password...\n');
    
    return new Promise(async (resolve, reject) => {
        const db = new sqlite3.Database(serverDbPath, async (err) => {
            if (err) {
                console.error('❌ Database connection failed:', err);
                reject(err);
                return;
            }
            
            try {
                // Generate correct password hash
                const envPassword = process.env.AUTH_PASSWORD;
                if (!envPassword) {
                    console.error('🚨 AUTH_PASSWORD environment variable required');
                    process.exit(1);
                }
                const correctPasswordHash = await bcrypt.hash(envPassword, 12);
                
                console.log('🔧 Updating admin password in server database...');
                
                db.run(
                    "UPDATE users SET password_hash = ? WHERE username = 'admin'",
                    [correctPasswordHash],
                    function(err) {
                        if (err) {
                            console.error('❌ Error updating password:', err);
                            db.close();
                            reject(err);
                            return;
                        }
                        
                        console.log(`✅ Admin password updated (${this.changes} rows affected)`);
                        
                        // Test the password
                        db.get("SELECT * FROM users WHERE username = 'admin'", async (err, user) => {
                            if (err) {
                                console.error('❌ Error verifying user:', err);
                                db.close();
                                reject(err);
                                return;
                            }
                            
                            try {
                                const passwordMatch = await bcrypt.compare(envPassword, user.password_hash);
                                console.log(`🧪 Password verification: ${passwordMatch ? '✅ SUCCESS' : '❌ FAILED'}`);
                                
                                db.close();
                                resolve(passwordMatch);
                            } catch (error) {
                                console.error('❌ Password verification error:', error);
                                db.close();
                                reject(error);
                            }
                        });
                    }
                );
            } catch (error) {
                console.error('❌ Password hashing error:', error);
                db.close();
                reject(error);
            }
        });
    });
}

if (require.main === module) {
    fixServerAdminPassword().then(success => {
        if (success) {
            console.log('\n🎉 Server database admin password fixed successfully!');
            process.exit(0);
        } else {
            console.log('\n❌ Failed to fix server database admin password');
            process.exit(1);
        }
    }).catch(error => {
        console.error('\n💥 Password fix failed:', error);
        process.exit(1);
    });
}

module.exports = { fixServerAdminPassword };