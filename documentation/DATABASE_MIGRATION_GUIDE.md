# Database Migration System Guide

## Overview

The Enterprise Logging Platform now includes an **automatic database migration system** that handles schema changes seamlessly. When you add new features that require database changes (new tables, columns, indexes), the system will automatically apply them on server startup.

## How It Works

1. **Version Tracking**: The system maintains a `schema_migrations` table that tracks which migrations have been applied
2. **Automatic Detection**: On server startup, it checks the current schema version against the target version
3. **Sequential Application**: Migrations are applied in order, ensuring consistent database state
4. **Error Handling**: If a migration fails, it logs the error and stops to prevent data corruption
5. **Idempotent**: Migrations can be safely run multiple times - they check if changes are needed first

## Adding New Database Changes

### Step 1: Increment Schema Version

In `server.js`, find this line and increment the number:

```javascript
const SCHEMA_VERSION = 2; // Increment this when adding new tables/columns
```

Change it to:
```javascript
const SCHEMA_VERSION = 3; // New version for your feature
```

### Step 2: Add Migration Definition

Add your migration to the `MIGRATION_DEFINITIONS` object:

```javascript
const MIGRATION_DEFINITIONS = {
    // ... existing versions ...
    
    3: {
        description: 'Add scheduled reports feature',
        migrations: [
            {
                name: 'create_scheduled_reports_table',
                check: (db, callback) => {
                    // Check if migration is needed
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_reports'", 
                        (err, row) => callback(err, !row)); // true if needs migration
                },
                apply: (db, callback) => {
                    // Apply the migration
                    db.run(`
                        CREATE TABLE scheduled_reports (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            name TEXT NOT NULL,
                            report_type TEXT NOT NULL,
                            schedule_cron TEXT NOT NULL,
                            recipients TEXT,
                            format TEXT DEFAULT 'pdf',
                            filters TEXT,
                            created_by INTEGER NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            last_run DATETIME,
                            next_run DATETIME,
                            is_active BOOLEAN DEFAULT 1,
                            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
                        )
                    `, callback);
                }
            },
            {
                name: 'add_report_schedule_index',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_report_next_run'",
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`CREATE INDEX idx_report_next_run ON scheduled_reports(next_run, is_active)`, callback);
                }
            }
        ]
    }
};
```

### Step 3: Restart Server

That's it! When you restart the server:

1. Migration system detects version difference (2 → 3)
2. Runs all migrations for version 3
3. Records completion in `schema_migrations` table
4. Your new feature is ready to use

## Migration Types

### Creating a New Table

```javascript
{
    name: 'create_my_table',
    check: (db, callback) => {
        db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='my_table'", 
            (err, row) => callback(err, !row));
    },
    apply: (db, callback) => {
        db.run(`CREATE TABLE my_table (...)`, callback);
    }
}
```

### Adding a New Column

```javascript
{
    name: 'add_column_to_users',
    check: (db, callback) => {
        db.get("PRAGMA table_info(users)", [], (err, rows) => {
            if (err) return callback(err);
            const hasColumn = rows.some(row => row.name === 'my_new_column');
            callback(null, !hasColumn); // true if needs migration
        });
    },
    apply: (db, callback) => {
        db.run(`ALTER TABLE users ADD COLUMN my_new_column TEXT`, callback);
    }
}
```

### Creating an Index

```javascript
{
    name: 'add_index_for_performance',
    check: (db, callback) => {
        db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_my_index'",
            (err, row) => callback(err, !row));
    },
    apply: (db, callback) => {
        db.run(`CREATE INDEX idx_my_index ON my_table(column_name)`, callback);
    }
}
```

### Modifying Existing Data

```javascript
{
    name: 'update_legacy_data',
    check: (db, callback) => {
        db.get("SELECT COUNT(*) as count FROM my_table WHERE status IS NULL",
            (err, row) => callback(err, row && row.count > 0));
    },
    apply: (db, callback) => {
        db.run(`UPDATE my_table SET status = 'active' WHERE status IS NULL`, callback);
    }
}
```

## Best Practices

### ✅ DO:

- **Increment version number** for every schema change
- **Test migrations** on a copy of your database first
- **Use descriptive names** for migrations (e.g., `add_user_preferences_table`)
- **Keep migrations small** - one logical change per migration
- **Use transactions** for complex multi-step migrations
- **Add indexes** for columns used in WHERE/JOIN clauses
- **Document** what each migration does in the description

### ❌ DON'T:

- **Skip version numbers** - always increment by 1
- **Modify existing migrations** - once deployed, consider them immutable
- **Delete old migrations** - they're part of the upgrade path
- **Mix unrelated changes** - keep each migration focused
- **Forget foreign keys** - maintain referential integrity
- **Assume data exists** - always check before updating

## Example: Adding a Complete Feature

Let's say you want to add a "Scheduled Reports" feature:

```javascript
const SCHEMA_VERSION = 3; // Increment from 2

const MIGRATION_DEFINITIONS = {
    // ... existing versions 1 and 2 ...
    
    3: {
        description: 'Add scheduled reports functionality',
        migrations: [
            // Create main table
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
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            is_active BOOLEAN DEFAULT 1
                        )
                    `, callback);
                }
            },
            
            // Create report history table
            {
                name: 'create_report_history',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='report_history'",
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`
                        CREATE TABLE report_history (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            report_id INTEGER NOT NULL,
                            run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                            status TEXT,
                            error_message TEXT,
                            FOREIGN KEY (report_id) REFERENCES scheduled_reports(id) ON DELETE CASCADE
                        )
                    `, callback);
                }
            },
            
            // Add performance index
            {
                name: 'add_report_schedule_index',
                check: (db, callback) => {
                    db.get("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_report_active'",
                        (err, row) => callback(err, !row));
                },
                apply: (db, callback) => {
                    db.run(`CREATE INDEX idx_report_active ON scheduled_reports(is_active)`, callback);
                }
            }
        ]
    }
};
```

## Monitoring Migrations

### Server Logs

Watch the console output when starting the server:

```
2025-10-24 19:30:00 MDT [info]: Database schema initialized
2025-10-24 19:30:02 MDT [info]: 📊 Current schema version: 2, Target version: 3
2025-10-24 19:30:02 MDT [info]: 🔄 Running migration version 3: Add scheduled reports functionality
2025-10-24 19:30:02 MDT [info]: ✅ Applied migration: create_scheduled_reports
2025-10-24 19:30:02 MDT [info]: ✅ Applied migration: create_report_history
2025-10-24 19:30:02 MDT [info]: ✅ Applied migration: add_report_schedule_index
2025-10-24 19:30:02 MDT [info]: ✅ Migration version 3 completed: Add scheduled reports functionality
2025-10-24 19:30:02 MDT [info]: ✅ All migrations completed successfully
2025-10-24 19:30:02 MDT [info]: ✅ Database migration system ready
```

### Check Migration Status

Query the database directly:

```sql
-- See all applied migrations
SELECT * FROM schema_migrations ORDER BY version;

-- Check current version
SELECT MAX(version) as current_version FROM schema_migrations;
```

## Troubleshooting

### Migration Failed

If a migration fails:

1. Check the error in the server logs
2. Fix the issue in the migration code
3. Manually rollback if needed:
   ```sql
   DELETE FROM schema_migrations WHERE version = X;
   ```
4. Restart the server to retry

### Database Locked

If you get "database is locked" errors:

1. Close all SQLite browser/viewer applications
2. Stop the server
3. Restart and try again

### Starting Fresh

To reset and reapply all migrations:

```sql
-- DANGER: This deletes all data!
DROP TABLE schema_migrations;
-- Then restart server
```

## Benefits

✅ **No Manual Work**: Add feature code, migrations run automatically  
✅ **Version Control**: Track exactly what changed and when  
✅ **Rollback Capable**: Can revert to previous schema versions if needed  
✅ **Team Friendly**: Everyone gets the same database structure  
✅ **Production Safe**: Migrations run idempotently without breaking existing data  

## Future Enhancements

The migration system can be extended to support:

- Down migrations (rollback)
- Data migrations (not just schema)
- Migration dry-run mode
- Export migration SQL for review
- Multiple database support

---

**Version**: 2.2.0-stable-enhanced  
**Last Updated**: October 24, 2025  
**Author**: Enterprise Logging Platform Team
