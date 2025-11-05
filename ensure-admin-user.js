#!/usr/bin/env node
/**
 * 🔧 ENSURE ADMIN USER FOR AUTHENTICATION
 * Fix authentication by ensuring admin user is properly configured
 */

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

async function ensureAdminUser() {
    const dbPath = path.join(__dirname, 'enterprise_logs.db');
    
    console.log('🔧 Ensuring admin user is properly configured...\n');
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                console.error('Database connection failed:', err);
                reject(err);
                return;
            }
            
            // Check current admin user
            db.get("SELECT * FROM users WHERE username = ? AND active = 1", ['admin'], async (err, user) => {
                if (err) {
                    console.error('❌ Error checking admin user:', err);
                    db.close();
                    reject(err);
                    return;
                }
                
                if (user) {
                    console.log('✅ Admin user found:');
                    console.log(`   ID: ${user.id}`);
                    console.log(`   Username: ${user.username}`);
                    console.log(`   Active: ${user.active}`);
                    console.log(`   Role: ${user.role}`);
                    
                    // Test password
                    try {
                        const envPassword = process.env.AUTH_PASSWORD;
                        if (!envPassword) {
                            console.error('🚨 AUTH_PASSWORD environment variable not set');
                            process.exit(1);
                        }
                        const passwordMatch = await bcrypt.compare(envPassword, user.password_hash);
                        console.log(`   Password: ${passwordMatch ? '✅ Correct' : '❌ Incorrect'}`);
                        
                        if (passwordMatch) {
                            console.log('\n🎉 Admin user is properly configured for authentication');
                            db.close();
                            resolve(true);
                        } else {
                            console.log('\n🔧 Fixing admin password...');
                            
                            // Fix password
                            const newPasswordHash = await bcrypt.hash(envPassword, 12);
                            
                            db.run(
                                "UPDATE users SET password_hash = ? WHERE username = 'admin'",
                                [newPasswordHash],
                                function(err) {
                                    if (err) {
                                        console.error('❌ Error updating password:', err);
                                        db.close();
                                        reject(err);
                                        return;
                                    }
                                    
                                    console.log('✅ Admin password fixed');
                                    console.log('\n🎉 Admin user is now properly configured');
                                    db.close();
                                    resolve(true);
                                }
                            );
                        }
                    } catch (error) {
                        console.error('❌ Error testing password:', error);
                        db.close();
                        reject(error);
                    }
                } else {
                    console.log('❌ Admin user not found or inactive');
                    console.log('🔧 Creating admin user...');
                    
                    // Create admin user
                    bcrypt.hash('ChangeMe123!', 12).then(passwordHash => {
                        db.run(
                            `INSERT INTO users (username, email, password_hash, role, active, created_at)
                             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                            ['admin', 'admin@enterprise.local', passwordHash, 'admin', 1],
                            function(err) {
                                if (err) {
                                    console.error('❌ Error creating admin user:', err);
                                    db.close();
                                    reject(err);
                                    return;
                                }
                                
                                console.log('✅ Admin user created successfully');
                                console.log('   Username: admin');
                                console.log('   Password: ChangeMe123!');
                                console.log('   Role: admin');
                                console.log('\n🎉 Admin user is now ready for authentication');
                                db.close();
                                resolve(true);
                            }
                        );
                    }).catch(error => {
                        console.error('❌ Error hashing password:', error);
                        db.close();
                        reject(error);
                    });
                }
            });
        });
    });
}

if (require.main === module) {
    ensureAdminUser().then(() => {
        console.log('\n✅ Admin user verification completed');
        process.exit(0);
    }).catch(error => {
        console.error('\n❌ Admin user verification failed:', error);
        process.exit(1);
    });
}

module.exports = { ensureAdminUser };