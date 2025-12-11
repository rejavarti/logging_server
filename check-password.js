const { Pool } = require('pg');
const bcrypt = require('bcrypt');

(async () => {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'logging_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
  });

  try {
    const result = await pool.query('SELECT username, password_hash FROM users WHERE username = $1', ['admin']);

    if (result.rows.length === 0) {
      console.log('Admin user not found');
      process.exit(1);
    }

    const row = result.rows[0];
    console.log('Username:', row.username);
    console.log('Password Hash:', row.password_hash);

    // Test passwords
    const passwords = ['ChangeMe123!', 'admin', 'password', 'Admin123!', 'adminpass'];

    for (const pwd of passwords) {
      const match = await bcrypt.compare(pwd, row.password_hash);
      console.log(`Password "${pwd}": ${match ? '✅ MATCH' : '❌ no match'}`);
    }
  } finally {
    await pool.end();
  }
})();
