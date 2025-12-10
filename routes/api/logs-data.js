const express = require('express');
const router = express.Router();

// Get all log data in one request
router.get('/all', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.page_size) || 50;
        const offset = (page - 1) * pageSize;

        const [logs, totalCount, sources] = await Promise.all([
            req.dal.getLogEntries({
                limit: pageSize,
                offset: offset,
                level: req.query.level,
                source: req.query.source,
                start_date: req.query.start_date,
                end_date: req.query.end_date,
                search: req.query.search
            }),
            req.dal.getLogCount({
                level: req.query.level,
                source: req.query.source,
                start_date: req.query.start_date,
                end_date: req.query.end_date,
                search: req.query.search
            }),
            req.dal.getLogSources()
        ]);

        res.json({
            success: true,
            data: {
                logs,
                pagination: {
                    page,
                    pageSize,
                    totalCount,
                    totalPages: Math.ceil(totalCount / pageSize),
                    hasNext: page < Math.ceil(totalCount / pageSize),
                    hasPrev: page > 1
                },
                sources,
                levels: ['debug', 'info', 'warning', 'error']
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error loading log data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load log data'
        });
    }
});

// Individual endpoints
router.get('/entries', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.page_size) || 50;
        const offset = (page - 1) * pageSize;

        const logs = await req.dal.getLogEntries({
            limit: pageSize,
            offset: offset,
            level: req.query.level,
            source: req.query.source,
            start_date: req.query.start_date,
            end_date: req.query.end_date,
            search: req.query.search
        });

        res.json({ success: true, data: logs });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/count', async (req, res) => {
    try {
        const count = await req.dal.getLogCount({
            level: req.query.level,
            source: req.query.source,
            start_date: req.query.start_date,
            end_date: req.query.end_date,
            search: req.query.search
        });
        res.json({ success: true, data: count });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/sources', async (req, res) => {
    try {
        const sources = await req.dal.getLogSources();
        res.json({ success: true, data: sources });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
