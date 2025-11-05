/**
 * LOG ANALYZER ROUTES - Web Interface
 * Routes for serving the log analyzer HTML interface
 */

const express = require('express');
const path = require('path');

const router = express.Router();

/**
 * Serve the log analyzer interface
 */
router.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, '../templates/log-analyzer/index.html'));
    } catch (error) {
        req.app.locals.loggers?.system?.error('Failed to serve log analyzer interface:', error);
        res.status(500).json({ error: 'Failed to load log analyzer interface' });
    }
});

/**
 * Serve log analyzer assets
 */
router.use('/assets', express.static(path.join(__dirname, '../templates/log-analyzer/assets')));

module.exports = router;