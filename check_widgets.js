const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking dashboard_widgets table...\n');

db.all('SELECT * FROM dashboard_widgets', [], (err, rows) => {
    if (err) {
        console.error('Error:', err);
        db.close();
        return;
    }
    
    console.log(`Found ${rows.length} widgets:\n`);
    rows.forEach(row => {
        console.log(JSON.stringify(row, null, 2));
        console.log('---');
    });
    
    db.close();
});
