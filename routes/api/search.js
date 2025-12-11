const express = require('express');
const router = express.Router();

// POST /api/search/save - Save a search
router.post('/save', async (req, res) => {
    try {
        const searchData = {
            ...req.body,
            user_id: req.user.id,
            created_at: new Date().toISOString()
        };

        const savedSearch = await req.dal.createSavedSearch(searchData);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'search_save',
            `saved_search_${savedSearch.id}`,
            { name: req.body.name },
            req.ip,
            req.get('User-Agent')
        );
        
        res.json({ savedSearch });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API save search error:', error);
        res.status(500).json({ error: 'Failed to save search' });
    }
});

// GET /api/search/saved/:id - Get saved search
router.get('/saved/:id', async (req, res) => {
    try {
        const search = await req.dal.getSavedSearchById(req.params.id, req.user.id);
        
        if (!search) {
            return res.status(404).json({ error: 'Saved search not found' });
        }
        
        res.json({ search });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API get saved search error:', error);
        res.status(500).json({ error: 'Failed to get saved search' });
    }
});

// DELETE /api/search/saved/:id - Delete saved search
router.delete('/saved/:id', async (req, res) => {
    try {
        await req.dal.deleteSavedSearch(req.params.id, req.user.id);
        
        // Log the activity
        await req.dal.logUserActivity(
            req.user.id,
            'search_delete',
            `saved_search_${req.params.id}`,
            null,
            req.ip,
            req.get('User-Agent')
        );
        
        res.json({ success: true });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API delete saved search error:', error);
        res.status(500).json({ error: 'Failed to delete saved search' });
    }
});

// GET /api/search/templates - Get search templates
router.get('/templates', async (req, res) => {
    try {
        const templates = [
            {
                id: 'error_logs',
                name: 'Error Logs',
                description: 'Find all error level logs',
                query: 'level:ERROR'
            },
            {
                id: 'recent_warnings',
                name: 'Recent Warnings',
                description: 'Warning logs from last 24 hours',
                query: 'level:WARN AND timestamp:[now-24h TO now]'
            },
            {
                id: 'authentication_events',
                name: 'Authentication Events',
                description: 'Login and authentication related logs',
                query: 'message:login OR message:auth OR message:authentication'
            },
            {
                id: 'database_errors',
                name: 'Database Errors',
                description: 'Database connection and query errors',
                query: 'message:database OR message:SQL OR message:connection'
            }
        ];
        
        res.json({ templates });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API search templates error:', error);
        res.status(500).json({ error: 'Failed to get search templates' });
    }
});

// POST /api/search/query - Advanced search query
router.post('/query', async (req, res) => {
    const startTime = Date.now();
    try {
        const { query } = req.body;
        
        // Simple implementation - extract basic query parameters
        let sql = 'SELECT * FROM logs WHERE 1=1';
        const params = [];
        
        // Handle basic DSL query structure
        if (query && query.query) {
            const q = query.query;
            
            // Handle bool queries
            if (q.bool && q.bool.must) {
                for (const condition of q.bool.must) {
                    if (condition.term) {
                        const [field, value] = Object.entries(condition.term)[0];
                        sql += ` AND ${field} = ?`;
                        params.push(value);
                    } else if (condition.range) {
                        const [field, range] = Object.entries(condition.range)[0];
                        if (range.gte) {
                            sql += ` AND ${field} >= datetime(?)`;
                            params.push(range.gte.replace('now', 'now'));
                        }
                    } else if (condition.match) {
                        const [field, value] = Object.entries(condition.match)[0];
                        sql += ` AND ${field} LIKE ?`;
                        params.push(`%${value}%`);
                    }
                }
            }
            
            // Handle simple term queries
            if (q.term) {
                const [field, value] = Object.entries(q.term)[0];
                sql += ` AND ${field} = ?`;
                params.push(value);
            }
        }
        
        sql += ' ORDER BY timestamp DESC LIMIT 100';
        
        const rows = await req.dal.all(sql, params);
        
        res.json({
            success: true,
            hits: {
                total: rows.length,
                hits: rows.map(row => ({
                    _id: row.id,
                    _source: row
                }))
            },
            took: Date.now() - startTime
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API search query error:', error);
        res.status(500).json({ success: false, error: 'Failed to execute search: ' + error.message });
    }
});

// POST /api/search/fuzzy - Fuzzy search
router.post('/fuzzy', async (req, res) => {
    const startTime = Date.now();
    try {
        const { text, field = 'message', fuzziness = 1 } = req.body;
        
        if (!text) {
            return res.status(400).json({ success: false, error: 'text parameter is required' });
        }
        
        // Simple fuzzy search using SQLite LIKE with wildcards
        // For higher fuzziness, add more wildcards
        let pattern = text;
        if (fuzziness >= 2) {
            // Insert wildcards between characters for fuzzy matching
            pattern = text.split('').join('%');
        }
        
        const rows = await req.dal.all(
            `SELECT * FROM logs WHERE ${field} LIKE ? ORDER BY timestamp DESC LIMIT 100`,
            [`%${pattern}%`]
        );
        
        res.json({
            success: true,
            hits: {
                total: rows.length,
                hits: rows.map(row => ({
                    _id: row.id,
                    _source: row
                }))
            },
            took: Date.now() - startTime
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API fuzzy search error:', error);
        res.status(500).json({ success: false, error: 'Failed to execute fuzzy search: ' + error.message });
    }
});

// GET /api/search/analytics - Search analytics
router.get('/analytics', async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        
        let searchStats = { total_searches: 0, unique_users: 0, avg_query_length: 0 };
        let popularTerms = [];
        
        // Try to get search statistics from saved_searches table
        try {
            const stats = await req.dal.all(`
                SELECT 
                    COUNT(*) as total_searches,
                    COUNT(DISTINCT user_id) as unique_users,
                    AVG(LENGTH(query)) as avg_query_length
                FROM saved_searches 
                WHERE created_at >= NOW() - INTERVAL '24 hours'
            `);
            
            if (stats && stats[0]) {
                searchStats = stats[0];
            }

            // Get popular search terms
            popularTerms = await req.dal.all(`
                SELECT 
                    query,
                    COUNT(*) as usage_count
                FROM saved_searches 
                WHERE created_at >= datetime('now', '-7 days')
                GROUP BY query
                ORDER BY usage_count DESC
                LIMIT 10
            `);
        } catch (dbErr) {
            // Table might not exist, return basic stats from logs instead
            req.app.locals?.loggers?.api?.warn('saved_searches table not available, using log stats:', dbErr.message);
            
            try {
                const logStats = await req.dal.all(`
                    SELECT COUNT(*) as total_searches FROM logs WHERE timestamp >= datetime('now', '-24 hours')
                `);
                
                if (logStats && logStats[0]) {
                    searchStats.total_searches = logStats[0].total_searches || 0;
                }
            } catch (logErr) {
                req.app.locals?.loggers?.api?.warn('Could not get log stats:', logErr.message);
            }
        }

        res.json({
            success: true,
            period,
            stats: searchStats,
            popularTerms: popularTerms || []
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API search analytics error:', error);
        res.status(500).json({ success: false, error: 'Failed to get search analytics' });
    }
});

module.exports = router;
 
// Additional endpoints restored from monolithic backup
// GET /api/search/simple - simple query by message LIKE
router.get('/simple', async (req, res) => {
    const startTime = Date.now();
    try {
        const { q, size = 100, sort = 'timestamp:desc' } = req.query;
        if (!q) return res.status(400).json({ error: 'q parameter is required' });
        
        // Parse sort parameter
        const [sortField, sortOrder] = sort.split(':');
        const orderClause = sortOrder === 'asc' ? 'ASC' : 'DESC';
        const validSortFields = ['timestamp', 'level', 'source', 'message'];
        const safeField = validSortFields.includes(sortField) ? sortField : 'timestamp';
        
        const rows = await req.dal.all(
            `SELECT * FROM logs WHERE message LIKE ? ORDER BY ${safeField} ${orderClause} LIMIT ?`,
            [ `%${q}%`, parseInt(size) ]
        );
        
        // Return Elasticsearch-style response format
        res.json({ 
            success: true,
            hits: {
                total: rows.length,
                hits: rows.map(row => ({
                    _id: row.id,
                    _source: row
                }))
            },
            took: Date.now() - startTime
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API search simple error:', error);
        res.status(500).json({ success: false, error: 'Failed to execute simple search' });
    }
});

// POST /api/search/aggregations - basic aggregation examples
router.post('/aggregations', async (req, res) => {
    try {
        const { field = 'level' } = req.body || {};
        if (!['level','source','category'].includes(field)) return res.status(400).json({ error: 'unsupported field' });
        const rows = await req.dal.all(`SELECT ${field} as key, COUNT(*) as count FROM logs GROUP BY ${field} ORDER BY count DESC`);
        res.json({ field, buckets: rows });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API search aggregations error:', error);
        res.status(500).json({ error: 'Failed to aggregate' });
    }
});

// GET /api/search/suggest - suggest terms by message
router.get('/suggest', async (req, res) => {
    try {
        const { prefix = '', limit = 10 } = req.query;
        if (!prefix) return res.json({ suggestions: [] });
        const rows = await req.dal.all(
            "SELECT DISTINCT substr(message, 1, 60) as term FROM logs WHERE message LIKE ? LIMIT ?",
            [ `${prefix}%`, parseInt(limit) ]
        );
        res.json({ suggestions: rows.map(r=>r.term) });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API search suggest error:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});