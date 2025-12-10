const express = require('express');
const router = express.Router();

// Get all activity data in one request
router.get('/all', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = 50;
        const offset = (page - 1) * pageSize;

        const [activities, allUsers, totalCount] = await Promise.all([
            req.dal.getActivityLog({
                limit: pageSize,
                offset: offset,
                action_type: req.query.action_type,
                user_id: req.query.user_id,
                start_date: req.query.start_date,
                end_date: req.query.end_date
            }),
            req.dal.getAllUsers(),
            req.dal.get(
                `SELECT COUNT(*) as count FROM activity_log`
            ).then(result => result.count)
        ]);

        // Calculate statistics
        const actionTypes = [...new Set(activities.map(a => a.action_type))];
        const userTypes = [...new Set(allUsers.map(u => u.role))];

        // Get activity counts by type
        const activityByType = await req.dal.all(
            `SELECT action_type, COUNT(*) as count 
             FROM activity_log 
             WHERE created_at > datetime('now', '-24 hours')
             GROUP BY action_type 
             ORDER BY count DESC`
        ).catch(() => []);

        res.json({
            success: true,
            data: {
                activities,
                users: allUsers,
                pagination: {
                    page,
                    pageSize,
                    totalCount,
                    totalPages: Math.ceil(totalCount / pageSize)
                },
                filters: {
                    actionTypes,
                    userTypes
                },
                stats: {
                    total24h: activityByType.reduce((sum, row) => sum + row.count, 0),
                    byType: activityByType
                }
            }
        });
    } catch (error) {
        req.app.locals?.loggers?.system?.error('Error loading activity data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to load activity data'
        });
    }
});

// Individual endpoints
router.get('/activities', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = 50;
        const offset = (page - 1) * pageSize;

        const activities = await req.dal.getActivityLog({
            limit: pageSize,
            offset: offset,
            action_type: req.query.action_type,
            user_id: req.query.user_id,
            start_date: req.query.start_date,
            end_date: req.query.end_date
        });

        res.json({ success: true, data: activities });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/users', async (req, res) => {
    try {
        const users = await req.dal.getAllUsers();
        res.json({ success: true, data: users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const [totalCount, activityByType] = await Promise.all([
            req.dal.get(`SELECT COUNT(*) as count FROM activity_log`).then(r => r.count),
            req.dal.all(
                `SELECT action_type, COUNT(*) as count 
                 FROM activity_log 
                 WHERE created_at > datetime('now', '-24 hours')
                 GROUP BY action_type 
                 ORDER BY count DESC`
            )
        ]);

        res.json({
            success: true,
            data: {
                totalCount,
                total24h: activityByType.reduce((sum, row) => sum + row.count, 0),
                byType: activityByType
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
