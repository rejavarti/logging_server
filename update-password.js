const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function updatePassword() {
    const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔄 Updating admin password to TomAdmin2025!...');
    
    try {
        // Generate new hash from environment variable
        const newPassword = process.env.AUTH_PASSWORD;
        if (!newPassword) {
            console.error('🚨 AUTH_PASSWORD environment variable required');
            process.exit(1);
        }
        const newHash = await bcrypt.hash(newPassword, 12);
        console.log('🆕 New hash generated:', newHash);
        
        // Update the database
        db.run('UPDATE users SET password_hash = ? WHERE username = ?', [newHash, 'admin'], function(err) {
            if (err) {
                console.error('❌ Error updating password:', err);
            } else {
                console.log('✅ Password updated successfully!');
                console.log('🔐 New login credentials:');
                console.log('   Username: admin');
                console.log('   Password: TomAdmin2025!');
                
                // Verify the update
                db.get('SELECT username, password_hash FROM users WHERE username = ?', ['admin'], async (err, user) => {
                    if (user) {
                        const testResult = await bcrypt.compare(newPassword, user.password_hash);
                        console.log('🧪 Verification test:', testResult ? '✅ PASSED' : '❌ FAILED');
                    }
                    db.close();
                });
            }
        });
    } catch (error) {
        console.error('❌ Error:', error);
        db.close();
    }
}

updatePassword();