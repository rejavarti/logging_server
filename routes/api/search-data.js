const express = require('express');
const router = express.Router();

// Perform search and return results (supports both GET and POST)
router.all('/execute', async (req, res) => {
    try {
        const params = req.method === 'POST' ? req.body : req.query;
        
        const query = params.q || '';
        const level = params.level || null;
        const source = params.source || null;
        const startDate = params.start_date || null;
        const endDate = params.end_date || null;
        const regex = params.regex === 'true' || params.regex === true;
        const caseSensitive = params.case_sensitive === 'true' || params.case_sensitive === true;

        // Only search if at least one parameter is provided
        if (!query && !level && !source && !startDate && !endDate) {
            return res.json({
                success: true,
                data: {
                    results: [],
                    total: 0,
                    searchPerformed: false
                }
            });
        }

        const searchParams = {
            query,
            level,
            source,
            startDate,
            endDate,
            regex,
            caseSensitive
        };

        const searchResult = await req.dal.advancedSearch(searchParams);

        res.json({
            success: true,
            data: {
                results: searchResult.results,
                total: searchResult.total,
                searchPerformed: true,
                params: searchParams
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error executing search:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed: ' + error.message
        });
    }
});

// Get search metadata (sources, levels, saved searches)
router.get('/metadata', async (req, res) => {
    try {
        const [sources, savedSearchConfig] = await Promise.all([
            req.dal.getLogSources().catch(() => []),
            req.dal.get(
                `SELECT value FROM settings WHERE key = 'saved_searches'`
            ).catch(() => null)
        ]);

        let savedSearches = [];
        if (savedSearchConfig && savedSearchConfig.value) {
            try {
                savedSearches = JSON.parse(savedSearchConfig.value);
            } catch (err) {
                req.app.locals?.loggers?.system?.warn('Failed to parse saved searches:', err.message);
            }
        }

        res.json({
            success: true,
            data: {
                sources,
                levels: ['debug', 'info', 'warning', 'error'],
                savedSearches
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error loading search metadata:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load search metadata'
        });
    }
});

// Combined endpoint - execute search and get metadata
router.all('/all', async (req, res) => {
    try {
        const params = req.method === 'POST' ? req.body : req.query;
        
        const query = params.q || '';
        const level = params.level || null;
        const source = params.source || null;
        const startDate = params.start_date || null;
        const endDate = params.end_date || null;
        const regex = params.regex === 'true' || params.regex === true;
        const caseSensitive = params.case_sensitive === 'true' || params.case_sensitive === true;

        let searchResult = { results: [], total: 0 };
        let searchPerformed = false;

        // Only search if at least one parameter is provided
        if (query || level || source || startDate || endDate) {
            searchPerformed = true;
            const searchParams = {
                query,
                level,
                source,
                startDate,
                endDate,
                regex,
                caseSensitive
            };
            searchResult = await req.dal.advancedSearch(searchParams);
        }

        // Get metadata in parallel
        const [sources, savedSearchConfig] = await Promise.all([
            req.dal.getLogSources().catch(() => []),
            req.dal.get(
                `SELECT value FROM settings WHERE key = 'saved_searches'`
            ).catch(() => null)
        ]);

        let savedSearches = [];
        if (savedSearchConfig && savedSearchConfig.value) {
            try {
                savedSearches = JSON.parse(savedSearchConfig.value);
            } catch (err) {
                req.app.locals?.loggers?.system?.warn('Failed to parse saved searches:', err.message);
            }
        }

        res.json({
            success: true,
            data: {
                results: searchResult.results,
                total: searchResult.total,
                searchPerformed,
                sources,
                levels: ['debug', 'info', 'warning', 'error'],
                savedSearches
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error executing search:', error);
        res.status(500).json({
            success: false,
            error: 'Search failed: ' + error.message
        });
    }
});

module.exports = router;
