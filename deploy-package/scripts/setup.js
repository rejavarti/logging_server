/**
 * Enterprise Setup Script
 * Initialize admin user and configuration
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

function hiddenQuestion(query) {
    return new Promise((resolve) => {
        process.stdout.write(query);
        process.stdin.setRawMode(true);
        process.stdin.resume();
        
        let input = '';
        process.stdin.on('data', (char) => {
            char = char.toString();
            
            if (char === '\r' || char === '\n') {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                console.log();
                resolve(input);
            } else if (char === '\u0003') { // Ctrl+C
                process.exit(1);
            } else if (char === '\u007f') { // Backspace
                if (input.length > 0) {
                    input = input.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            } else {
                input += char;
                process.stdout.write('*');
            }
        });
    });
}

async function setupDatabase() {
    const dbDir = path.join(__dirname, '..', 'data', 'databases');
    const dbPath = path.join(dbDir, 'dsc_logs.db');
    
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) reject(err);
            else resolve(db);
        });
    });
}

async function createAdminUser(db, username, email, password) {
    const hashedPassword = await bcrypt.hash(password, 12);
    
    return new Promise((resolve, reject) => {
        // First create the users table if it doesn't exist
        db.run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                password_changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, (err) => {
            if (err) {
                reject(err);
                return;
            }
            
            // Insert the admin user
            db.run(`
                INSERT INTO users (username, email, password_hash, role, is_active)
                VALUES (?, ?, ?, 'admin', 1)
            `, [username, email, hashedPassword], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve(this.lastID);
                }
            });
        });
    });
}

async function main() {
    try {
        console.log('\n🏢 Enterprise Logging Platform Setup');
        console.log('=====================================\n');
        
        console.log('This setup will create the initial administrator account.\n');
        
        // Get admin details
        const username = await question('Enter admin username: ');
        const email = await question('Enter admin email: ');
        
        let password;
        let confirmPassword;
        
        do {
            password = await hiddenQuestion('Enter admin password (min 12 chars): ');
            confirmPassword = await hiddenQuestion('Confirm password: ');
            
            if (password !== confirmPassword) {
                console.log('❌ Passwords do not match. Please try again.\n');
            } else if (password.length < 12) {
                console.log('❌ Password must be at least 12 characters. Please try again.\n');
            }
        } while (password !== confirmPassword || password.length < 12);
        
        // Setup database
        console.log('\n📀 Setting up database...');
        const db = await setupDatabase();
        
        // Create admin user
        console.log('👤 Creating admin user...');
        await createAdminUser(db, username, email, password);
        
        // Close database
        db.close();
        
        console.log('\n✅ Setup completed successfully!');
        console.log('\nAdmin account created:');
        console.log(`   Username: ${username}`);
        console.log(`   Email: ${email}`);
        console.log(`   Role: Administrator`);
        
        console.log('\n🚀 You can now start the server with: npm start');
        console.log(`   Then visit: http://localhost:10180/login\n`);
        
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            console.log('\n💡 It looks like an admin user already exists.');
            console.log('   If you need to reset the admin password, please contact support.\n');
        }
        
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();