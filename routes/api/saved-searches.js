/**
 * Saved Searches API Routes
 * Handles saved search queries and management
 */

const express = require('express');
const router = express.Router();

// Get saved searches
router.get('/saved-searches', async (req, res) => {
    try {
        const savedSearches = [
            {
                id: '1',
                name: 'Error Logs Last 24h',
                query: 'level:error',
                filters: {
                    timeRange: '24h',
                    level: ['error'],
                    source: []
                },
                created: '2024-10-30T14:20:00Z',
                lastUsed: '2024-11-02T06:15:00Z',
                useCount: 23,
                createdBy: 'admin'
            },
            {
                id: '2',
                name: 'ESP32 Device Logs',
                query: 'source:esp32',
                filters: {
                    timeRange: '7d',
                    level: [],
                    source: ['esp32']
                },
                created: '2024-10-25T09:15:00Z',
                lastUsed: '2024-11-01T18:30:00Z',
                useCount: 45,
                createdBy: 'admin'
            }
        ];

        res.json({ success: true, searches: savedSearches });
    } catch (error) {
        console.error('Error getting saved searches:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create saved search
router.post('/saved-searches', async (req, res) => {
    try {
        const { name, query, filters } = req.body;
        
        const savedSearch = {
            id: Date.now().toString(),
            name,
            query,
            filters,
            created: new Date().toISOString(),
            lastUsed: null,
            useCount: 0,
            createdBy: req.user ? req.user.username : 'system'
        };

        res.json({ success: true, search: savedSearch });
    } catch (error) {
        console.error('Error creating saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update saved search
router.put('/saved-searches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        res.json({
            success: true,
            search: {
                id,
                ...updates,
                updated: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Error updating saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete saved search
router.delete('/saved-searches/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        res.json({
            success: true,
            message: 'Saved search deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Use/execute saved search
router.post('/saved-searches/:id/use', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Mock search execution
        const results = {
            searchId: id,
            query: 'level:error',
            totalResults: 156,
            results: [
                {
                    id: '1',
                    timestamp: '2024-11-02T06:15:00Z',
                    level: 'error',
                    message: 'Database connection failed',
                    source: 'api-server'
                }
            ],
            executedAt: new Date().toISOString(),
            executionTime: '125ms'
        };

        res.json({ success: true, ...results });
    } catch (error) {
        console.error('Error executing saved search:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;