/**
 * Request Metrics Tracking Middleware
 * Tracks all API requests (response time, status codes, endpoints) to request_metrics table
 */

const metricsMiddleware = (dal) => {
    // Optionally allow synchronous metric storage for test coverage
    return (req, res, next) => {
        // Only track API routes
        if (!req.path.startsWith('/api')) {
            return next();
        }

        // Record start time
        const startTime = Date.now();

        // Capture original end function
        const originalEnd = res.end;

        // Override res.end to capture response
        res.end = function(...args) {
            // Calculate response time
            const responseTime = Date.now() - startTime;

            // Restore original end and call it
            res.end = originalEnd;
            res.end.apply(res, args);

            // Store metrics
            const isTestSync = process.env.METRICS_SYNC === 'true';
            // Resolve DAL dynamically to support tests that mutate app.dal (highest priority) or use req.dal
            const activeDal = (req.app && req.app.dal) || req.dal || dal;
            if (isTestSync) {
                // Synchronous for test coverage
                try {
                    if (activeDal && typeof activeDal.run === 'function') {
                        const maybePromise = activeDal.run(
                            `INSERT INTO request_metrics 
                             (endpoint, method, status_code, response_time_ms, user_id, ip_address, user_agent, timestamp)
                             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
                            [
                                req.path,
                                req.method,
                                res.statusCode,
                                responseTime,
                                req.user?.id || null,
                                req.ip || req.connection?.remoteAddress || 'unknown',
                                req.headers['user-agent'] || 'unknown'
                            ]
                        );
                        if (maybePromise && typeof maybePromise.then === 'function') {
                            maybePromise.catch(err => console.warn('Failed to store request metrics:', err.message));
                        }
                    } else if (activeDal && typeof activeDal.run !== 'function') {
                        console.warn('DAL provided but dal.run is not a function. Metrics not stored.');
                    }
                } catch (err) {
                    console.warn('Failed to store request metrics:', err.message);
                }
            } else {
                setImmediate(async () => {
                    try {
                        if (activeDal && typeof activeDal.run === 'function') {
                            await activeDal.run(
                                `INSERT INTO request_metrics 
                                 (endpoint, method, status_code, response_time_ms, user_id, ip_address, user_agent, timestamp)
                                 VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
                                [
                                    req.path,
                                    req.method,
                                    res.statusCode,
                                    responseTime,
                                    req.user?.id || null,
                                    req.ip || req.connection?.remoteAddress || 'unknown',
                                    req.headers['user-agent'] || 'unknown'
                                ]
                            );
                        } else if (activeDal && typeof activeDal.run !== 'function') {
                            console.warn('DAL provided but dal.run is not a function. Metrics not stored.');
                        }
                    } catch (err) {
                        console.warn('Failed to store request metrics:', err.message);
                    }
                });
            }
        };

        next();
    };
};

module.exports = metricsMiddleware;
