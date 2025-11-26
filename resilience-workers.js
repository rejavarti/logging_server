// Resilience Workers: automatic retry & health monitoring
const fs = require('fs');
const path = require('path');

// Store interval references for cleanup
const activeIntervals = [];

function setupResilienceWorkers({ app, dal, loggers }) {
    if (!dal) {
        loggers.system.warn('Resilience workers skipped: DAL unavailable');
        return { cleanup: () => {} };
    }

    // Failed operations retry worker (every minute)
    const retryInterval = setInterval(async () => {
        try {
            const pending = await dal.fetchRetryableFailedOperations(50);
            if (!pending.length) return;
            loggers.system.info(`🔄 Retrying ${pending.length} failed operations...`);
            for (const op of pending) {
                try {
                    // Simple handler for log_insert operations (extendable)
                    if (op.operation_type === 'log_insert') {
                        const payload = JSON.parse(op.payload);
                        await dal.insertLogEntry(payload);
                        await dal.markFailedOperation(op.id, { status: 'succeeded', resolved_at: new Date().toISOString() });
                        loggers.system.info(`✅ Replayed failed log_insert operation #${op.id}`);
                    } else {
                        // Unsupported operation types requeue with backoff
                        const next = new Date(Date.now() + 120000).toISOString();
                        await dal.markFailedOperation(op.id, { retry_count: op.retry_count + 1, next_retry_at: next });
                    }
                } catch (retryErr) {
                    const next = new Date(Date.now() + (Math.pow(2, op.retry_count + 1) * 60000)).toISOString();
                    const newCount = op.retry_count + 1;
                    const status = newCount >= op.max_retries ? 'abandoned' : 'queued';
                    await dal.markFailedOperation(op.id, { retry_count: newCount, next_retry_at: next, status });
                    loggers.system.warn(`⚠️ Retry failed for operation #${op.id} (${newCount}/${op.max_retries})`);
                }
            }
        } catch (err) {
            loggers.system.error('Failed operations retry worker error:', err);
            try {
                await dal.logSystemError({
                    error_category: 'resilience',
                    error_code: 'FAILED_OP_WORKER',
                    error_message: err.message,
                    stack_trace: err.stack,
                    affected_component: 'resilience-workers',
                    affected_function: 'failedOperationsRetry'
                });
            } catch (logErr) {
                loggers.system.error('Failed to log system error:', logErr.message);
            }
        }
    }, 60_000);
    activeIntervals.push(retryInterval);

    // Daily database health snapshot (24h)
    const healthInterval = setInterval(async () => {
        try {
            const dbFile = path.join(__dirname, 'data', 'databases', 'enterprise_logs.db');
            let database_size_mb = null;
            if (fs.existsSync(dbFile)) {
                const stats = fs.statSync(dbFile);
                database_size_mb = +(stats.size / (1024 * 1024)).toFixed(2);
            }
            const tables = await dal.all("SELECT name FROM sqlite_master WHERE type='table'") || [];
            let total_records = 0;
            let logs_table_records = 0;
            for (const t of tables) {
                try {
                    const r = await dal.get(`SELECT COUNT(*) AS c FROM ${t.name}`);
                    total_records += (r?.c || 0);
                    if (t.name === 'logs') logs_table_records = r?.c || 0;
                } catch { /* ignore */ }
            }
            // Integrity check (sqlite3 only) - attempt lightweight pragma
            let integrity_check_passed = 1;
            try {
                const result = await dal.get('PRAGMA quick_check');
                if (result && Object.values(result)[0] !== 'ok') integrity_check_passed = 0;
            } catch { /* ignore */ }
            await dal.logDatabaseHealthSnapshot({
                database_size_mb,
                table_count: tables.length,
                total_records,
                logs_table_records,
                integrity_check_passed,
                checks_performed: { quick_check: integrity_check_passed === 1 }
            });
            loggers.system.info('🩺 Database health snapshot recorded');
        } catch (err) {
            loggers.system.error('Database health snapshot error:', err);
            try {
                await dal.logSystemError({
                    error_category: 'resilience',
                    error_code: 'HEALTH_SNAPSHOT',
                    error_message: err.message,
                    stack_trace: err.stack,
                    affected_component: 'resilience-workers',
                    affected_function: 'dailyDatabaseHealthCheck'
                });
            } catch (logErr) {
                loggers.system.error('Failed to log system error:', logErr.message);
            }
        }
    }, 24 * 60 * 60 * 1000);
    activeIntervals.push(healthInterval);

    // Return cleanup function for graceful shutdown
    return {
        cleanup: () => {
            loggers.system.info('🛡️ Cleaning up resilience workers...');
            activeIntervals.forEach(interval => clearInterval(interval));
            activeIntervals.length = 0;
        }
    };
}

// Cleanup function for external use
function cleanupResilienceWorkers() {
    activeIntervals.forEach(interval => clearInterval(interval));
    activeIntervals.length = 0;
}

module.exports = { setupResilienceWorkers, cleanupResilienceWorkers };
