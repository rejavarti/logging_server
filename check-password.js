const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

(async () => {
  const db = new Database('./test-db.db');

  const row = db.prepare('SELECT username, password_hash FROM users WHERE username = ?').get('admin');

  if (!row) {
    console.log('Admin user not found');
    process.exit(1);
  }

  console.log('Username:', row.username);
  console.log('Password Hash:', row.password_hash);

  // Test passwords
  const passwords = ['ChangeMe123!', 'admin', 'password', 'Admin123!', 'adminpass'];

  for (const pwd of passwords) {
    const match = await bcrypt.compare(pwd, row.password_hash);
    console.log(`Password "${pwd}": ${match ? '✅ MATCH' : '❌ no match'}`);
  }

  db.close();
})();
