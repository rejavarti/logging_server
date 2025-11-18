const express = require('express');
const router = express.Router();

// GET /api/activity - Get activity logs with filtering
router.get('/', async (req, res) => {
    try {
        const {
            limit = 50,
            offset = 0,
            userId,
            action,
            startDate,
            endDate,
            resourceType
        } = req.query;

        const filters = {
            limit: parseInt(limit),
            offset: parseInt(offset)
        };

        // Map API params to DAL expected params
        if (userId) filters.user_id = userId;
        if (action) filters.action = action;
        if (resourceType) filters.resource_type = resourceType;
        if (startDate) filters.start_date = startDate;
        if (endDate) filters.end_date = endDate;

        const activities = await req.dal.getAllActivity(filters);
        
        res.json({
            activities: activities.activities || activities,
            total: activities.total || activities.length
        });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// GET /api/activity/latest - Get latest activities for real-time updates
router.get('/latest', async (req, res) => {
    try {
        let { since } = req.query;
        
        if (!since) {
            // Default to last 5 minutes if not provided
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
            since = fiveMinutesAgo;
        }
        
        // Validate timestamp format
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
            return res.status(400).json({ 
                error: 'Invalid timestamp format',
                message: 'since parameter must be a valid ISO 8601 timestamp'
            });
        }

        const activities = await req.dal.getActivitiesSince(since);
        res.json({ activities: activities || [] });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API activity latest error:', error);
        res.status(500).json({ error: 'Failed to fetch latest activities' });
    }
});

// GET /api/activity/:id - Get specific activity
router.get('/:id', async (req, res) => {
    try {
        const activity = await req.dal.getActivityById(req.params.id);
        
        if (!activity) {
            return res.status(404).json({ error: 'Activity not found' });
        }
        
        res.json({ activity });
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API activity by ID error:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

// GET /api/activity/export - Export activities
router.get('/export', async (req, res) => {
    try {
        const filters = { ...req.query };
        delete filters.format;

        const activities = await req.dal.exportActivities(filters);
        const format = req.query.format || 'json';

        if (format === 'csv') {
            const csv = activities.map(activity => {
                return `"${activity.created_at}","${activity.username || 'System'}","${activity.action}","${activity.resource || ''}","${activity.details || ''}"`;
            }).join('\n');
            
            const csvContent = 'Timestamp,User,Action,Resource,Details\n' + csv;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=activities.csv');
            res.send(csvContent);
        } else {
            res.json({ activities });
        }
    } catch (error) {
        req.app.locals?.loggers?.api?.error('API activity export error:', error);
        res.status(500).json({ error: 'Failed to export activities' });
    }
});

module.exports = router;