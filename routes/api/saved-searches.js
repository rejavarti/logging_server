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
        if (!req.dal || !req.dal.createSavedSearch) {
            return res.status(501).json({ success: false, error: 'Saved search creation not implemented' });
        }
        const { name, query, filters } = req.body;
        if (!name || !query) {
            return res.status(400).json({ success: false, error: 'Name and query are required' });
        }
        const result = await req.dal.createSavedSearch({
            user_id: req.user?.id || null,
            name,
            query,
            filters: filters || {}
        });
        const created = await req.dal.getSavedSearchById(result.lastID, req.user?.id || null);
        res.json({ success: true, search: created });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error creating saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update saved search
router.put('/saved-searches/:id', async (req, res) => {
    try {
        if (!req.dal || !req.dal.updateSavedSearch) {
            return res.status(501).json({ success: false, error: 'Saved search update not implemented' });
        }
        const { id } = req.params;
        const updates = req.body || {};
        await req.dal.updateSavedSearch(id, req.user?.id || null, updates);
        const updated = await req.dal.getSavedSearchById(id, req.user?.id || null);
        if (!updated) return res.status(404).json({ success: false, error: 'Saved search not found' });
        res.json({ success: true, search: updated });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error updating saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete saved search
router.delete('/saved-searches/:id', async (req, res) => {
    try {
        if (!req.dal || !req.dal.deleteSavedSearch) {
            return res.status(501).json({ success: false, error: 'Saved search deletion not implemented' });
        }
        const { id } = req.params;
        const result = await req.dal.deleteSavedSearch(id, req.user?.id || null);
        if ((result?.changes || 0) === 0) {
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
        
        // Require real implementation - no mock search execution
        if (!req.dal || !req.dal.executeSavedSearch) {
            return res.status(501).json({ 
                success: false, 
                error: 'Saved search execution not implemented - database access layer unavailable' 
            });
        }
        
        const results = await req.dal.executeSavedSearch(id);

        res.json({ success: true, ...results });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('Error executing saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;