# Quick Reference: Adding Database Changes

## 🚀 3-Step Process

### 1️⃣ Increment Version
```javascript
const SCHEMA_VERSION = 3; // Changed from 2
```

### 2️⃣ Add Migration Definition
```javascript
3: {
    description: 'Your feature description',
    migrations: [
        {
            name: 'your_migration_name',
            check: (db, callback) => {
                // Return true if migration is needed
                db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='your_table'",
                    (err, row) => callback(err, !row));
            },
            apply: (db, callback) => {
                // Apply the change
                db.run(`CREATE TABLE your_table (...)`, callback);
            }
        }
    ]
}
```

### 3️⃣ Restart Server
```bash
# Stop server (Ctrl+C)
node server.js
```

## 📋 Common Migration Templates

### New Table
```javascript
{
    name: 'create_table_name',
    check: (db, callback) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='table_name'",
            (err, row) => callback(err, !row));
    },
    apply: (db, callback) => {
        db.run(`
            CREATE TABLE table_name (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `, callback);
    }
}
```

### New Column
```javascript
{
    name: 'add_column_name',
    check: (db, callback) => {
        db.all("PRAGMA table_info(table_name)", (err, rows) => {
            if (err) return callback(err);
            const exists = rows.some(r => r.name === 'column_name');
            callback(null, !exists);
        });
    },
    apply: (db, callback) => {
        db.run(`ALTER TABLE table_name ADD COLUMN column_name TEXT`, callback);
    }
}
```

### New Index
```javascript
{
    name: 'add_index_name',
    check: (db, callback) => {
        db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_name'",
            (err, row) => callback(err, !row));
    },
    apply: (db, callback) => {
        db.run(`CREATE INDEX idx_name ON table_name(column_name)`, callback);
    }
}
```

## 📊 What You'll See

```
2025-10-24 19:30:20 MDT [info]: 📊 Current schema version: 2, Target version: 3
2025-10-24 19:30:20 MDT [info]: 🔄 Running migration version 3: Your feature description
2025-10-24 19:30:20 MDT [info]: ✅ Applied migration: your_migration_name
2025-10-24 19:30:20 MDT [info]: ✅ Migration version 3 completed
2025-10-24 19:30:20 MDT [info]: ✅ All migrations completed successfully
2025-10-24 19:30:20 MDT [info]: ✅ Database migration system ready
```

## ✅ Benefits

- ✨ **Automatic**: No manual SQL commands needed
- 🔒 **Safe**: Only runs when needed, never breaks existing data
- 📝 **Tracked**: Every change is logged and versioned
- 🔄 **Repeatable**: Can run on any database, any time
- 👥 **Team-Friendly**: Everyone gets the same schema

## 💡 Example: Adding Scheduled Reports

```javascript
const SCHEMA_VERSION = 3;

const MIGRATION_DEFINITIONS = {
    // ... version 1 and 2 ...
    
    3: {
        description: 'Add scheduled reports feature',
        migrations: [
            {
                name: 'create_scheduled_reports',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_reports'",
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`
                        CREATE TABLE scheduled_reports (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            schedule_cron TEXT NOT NULL,
                            recipients TEXT,
                            format TEXT DEFAULT 'pdf',
                            created_by INTEGER NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            is_active BOOLEAN DEFAULT 1,
                            FOREIGN KEY (created_by) REFERENCES users(id)
                        )
                    `, callback);
                }
            }
        ]
    }
};
```

## 🆘 Troubleshooting

**Migration failed?**
1. Check server logs for error details
2. Fix the migration code
3. Delete from schema_migrations: `DELETE FROM schema_migrations WHERE version = X;`
4. Restart server

**Database locked?**
- Close any SQLite browser applications
- Restart the server

---

**That's it!** The system handles everything else automatically. 🎉
