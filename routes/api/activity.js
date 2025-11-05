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
            endDate
        } = req.query;

        const filters = {
            limit: parseInt(limit),
            offset: parseInt(offset)
        };

        if (userId) filters.userId = userId;
        if (action) filters.action = action;
        if (startDate) filters.startDate = startDate;
        if (endDate) filters.endDate = endDate;

        const activities = await req.dal.getAllActivity(filters);
        
        res.json({
            activities: activities.activities || activities,
            total: activities.total || activities.length
        });
    } catch (error) {
        console.error('API activity error:', error);
        res.status(500).json({ error: 'Failed to fetch activities' });
    }
});

// GET /api/activity/latest - Get latest activities for real-time updates
router.get('/latest', async (req, res) => {
    try {
        const { since } = req.query;
        
        if (!since) {
            return res.status(400).json({ error: 'since parameter required' });
        }

        const activities = await req.dal.getActivitiesSince(since);
        res.json({ activities });
    } catch (error) {
        console.error('API activity latest error:', error);
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
        console.error('API activity by ID error:', error);
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
        console.error('API activity export error:', error);
        res.status(500).json({ error: 'Failed to export activities' });
    }
});

module.exports = router;