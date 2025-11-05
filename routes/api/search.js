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
        console.error('API save search error:', error);
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
        console.error('API get saved search error:', error);
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
        console.error('API delete saved search error:', error);
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
        console.error('API search templates error:', error);
        res.status(500).json({ error: 'Failed to get search templates' });
    }
});

// POST /api/search/query - Advanced search query
router.post('/query', async (req, res) => {
    try {
        const searchParams = {
            ...req.body,
            user_id: req.user.id
        };

        const results = await req.dal.advancedSearch(searchParams);
        res.json(results);
    } catch (error) {
        console.error('API search query error:', error);
        res.status(500).json({ error: 'Failed to execute search' });
    }
});

// POST /api/search/fuzzy - Fuzzy search
router.post('/fuzzy', async (req, res) => {
    try {
        const { query, field = 'message', fuzziness = 1 } = req.body;
        
        // Simple fuzzy search implementation
        const searchParams = {
            fuzzyQuery: query,
            field: field,
            fuzziness: parseInt(fuzziness),
            limit: req.body.limit || 100
        };

        const results = await req.dal.advancedSearch(searchParams);
        res.json(results);
    } catch (error) {
        console.error('API fuzzy search error:', error);
        res.status(500).json({ error: 'Failed to execute fuzzy search' });
    }
});

// GET /api/search/analytics - Search analytics
router.get('/analytics', async (req, res) => {
    try {
        const { period = '24h' } = req.query;
        
        // Get search statistics
        const searchStats = await req.dal.all(`
            SELECT 
                COUNT(*) as total_searches,
                COUNT(DISTINCT user_id) as unique_users,
                AVG(LENGTH(query)) as avg_query_length
            FROM saved_searches 
            WHERE created_at >= datetime('now', '-24 hours')
        `);

        // Get popular search terms
        const popularTerms = await req.dal.all(`
            SELECT 
                query,
                COUNT(*) as usage_count
            FROM saved_searches 
            WHERE created_at >= datetime('now', '-7 days')
            GROUP BY query
            ORDER BY usage_count DESC
            LIMIT 10
        `);

        res.json({
            period,
            stats: searchStats[0] || { total_searches: 0, unique_users: 0, avg_query_length: 0 },
            popularTerms
        });
    } catch (error) {
        console.error('API search analytics error:', error);
        res.status(500).json({ error: 'Failed to get search analytics' });
    }
});

module.exports = router;