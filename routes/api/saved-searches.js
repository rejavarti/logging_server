/**
 * Saved Searches API Routes
 * Handles saved search queries and management
 */

const express = require('express');
const router = express.Router();

// Get saved searches
router.get('/saved-searches', async (req, res) => {
    try {
        if (!req.dal || !req.dal.getSavedSearches) {
            return res.json({ success: true, searches: [] });
        }
        const searches = await req.dal.getSavedSearches(req.user?.id);
        res.json({ success: true, searches: Array.isArray(searches) ? searches : [] });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error getting saved searches:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create saved search
router.post('/saved-searches', async (req, res) => {
    try {
        const { name, query, filters, description } = req.body;
        if (!name || !query) {
            return res.status(400).json({ success: false, error: 'Name and query are required' });
        }
        
        const queryData = JSON.stringify({ query, filters: filters || {} });
        const userId = req.user?.id || 1; // Default to admin user if not authenticated
        
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        const result = await req.dal.run(
            `INSERT INTO saved_searches (name, description, query_data, created_by) VALUES ($1, $2, $3, $4)`,
            [name, description || null, queryData, userId]
        );
        
        const created = await req.dal.get(
            `SELECT * FROM saved_searches WHERE id = $1`,
            [result.lastID]
        );
        
        res.json({ success: true, search: created });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error creating saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update saved search
router.put('/saved-searches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, query, filters, description } = req.body;
        
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Build dynamic update query
        const updates = [];
        const params = [];
        
        if (name !== undefined) {
            updates.push(`name = $${params.length + 1}`);
            params.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${params.length + 1}`);
            params.push(description);
        }
        if (query !== undefined || filters !== undefined) {
            // Get current query_data to merge
            const current = await req.dal.get(`SELECT query_data FROM saved_searches WHERE id = $1`, [id]);
            if (current) {
                const currentData = JSON.parse(current.query_data);
                const newData = {
                    query: query !== undefined ? query : currentData.query,
                    filters: filters !== undefined ? filters : currentData.filters
                };
                updates.push(`query_data = $${params.length + 1}`);
                params.push(JSON.stringify(newData));
            }
        }
        
        if (updates.length === 0) {
            return res.status(400).json({ success: false, error: 'No fields to update' });
        }
        
        updates.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);
        
        const result = await req.dal.run(
            `UPDATE saved_searches SET ${updates.join(', ')} WHERE id = $${params.length}`,
            params
        );
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Saved search not found' });
        }
        
        const updated = await req.dal.get(`SELECT * FROM saved_searches WHERE id = $1`, [id]);
        res.json({ success: true, search: updated });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete saved search
router.delete('/saved-searches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        const result = await req.dal.run(`DELETE FROM saved_searches WHERE id = $1`, [id]);
        
        if (result.changes === 0) {
            return res.status(404).json({ success: false, error: 'Saved search not found' });
        }
        
        res.json({ success: true, message: 'Saved search deleted successfully' });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error deleting saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Use/execute saved search
router.post('/saved-searches/:id/use', async (req, res) => {
    try {
        const { id } = req.params;
        
        if (!req.dal) {
            return res.status(500).json({ success: false, error: 'Database not available' });
        }
        
        // Get the saved search
        const search = await req.dal.get(`SELECT * FROM saved_searches WHERE id = $1`, [id]);
        if (!search) {
            return res.status(404).json({ success: false, error: 'Saved search not found' });
        }
        
        // Parse query data
        const queryData = JSON.parse(search.query_data);
        
        // Build query for logs
        let query = `SELECT * FROM logs WHERE 1=1`;
        const params = [];
        
        if (queryData.query) {
            query += ` AND (message LIKE $${params.length + 1} OR source LIKE $${params.length + 2})`;
            params.push(`%${queryData.query}%`, `%${queryData.query}%`);
        }
        
        if (queryData.filters) {
            if (queryData.filters.level) {
                query += ` AND level = $${params.length + 1}`;
                params.push(queryData.filters.level);
            }
            if (queryData.filters.source) {
                query += ` AND source = $${params.length + 1}`;
                params.push(queryData.filters.source);
            }
            if (queryData.filters.startDate) {
                query += ` AND timestamp >= $${params.length + 1}`;
                params.push(queryData.filters.startDate);
            }
            if (queryData.filters.endDate) {
                query += ` AND timestamp <= $${params.length + 1}`;
                params.push(queryData.filters.endDate);
            }
        }
        
        query += ` ORDER BY timestamp DESC LIMIT 1000`;
        
        const results = await req.dal.all(query, params);
        
        // Update usage stats
        await req.dal.run(
            `UPDATE saved_searches SET use_count = use_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = $1`,
            [id]
        );
        
        res.json({ 
            success: true, 
            search: {
                id: search.id,
                name: search.name,
                query: queryData
            },
            results,
            count: results.length
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error executing saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;