const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

async function testAuth() {
    const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');
    const db = new sqlite3.Database(dbPath);
    
    console.log('🔍 Testing authentication...');
    
    // Get user from database
    db.get('SELECT username, password_hash FROM users WHERE username = ?', ['admin'], async (err, user) => {
        if (err) {
            console.error('❌ Database error:', err);
            return;
        }
        
        if (!user) {
            console.log('❌ User not found');
            return;
        }
        
        console.log('✅ User found:', user.username);
        console.log('🔐 Password hash:', user.password_hash);
        console.log('📏 Hash length:', user.password_hash.length);
        
        // Test password comparison
        const testPassword = process.env.AUTH_PASSWORD;
        if (!testPassword) {
            console.error('🚨 AUTH_PASSWORD environment variable required for testing');
            process.exit(1);
        }
        console.log('🧪 Testing password from environment');
        
        try {
            const isValid = await bcrypt.compare(testPassword, user.password_hash);
            console.log('🔍 Password comparison result:', isValid);
            
            if (!isValid) {
                console.log('❌ Password does not match');
                // Generate a new hash for comparison
                console.log('\n🔄 Generating new hash for comparison...');
                const newHash = await bcrypt.hash(testPassword, 10);
                console.log('🆕 New hash:', newHash);
                
                // Test the new hash
                const newResult = await bcrypt.compare(testPassword, newHash);
                console.log('✅ New hash comparison:', newResult);
            } else {
                console.log('✅ Password matches!');
            }
        } catch (error) {
            console.error('❌ bcrypt error:', error);
        }
        
        db.close();
    });
}

testAuth();