const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  try {
    // Extract engine references from app locals or request context
    const app = req.app;
    const status = {
      success: true,
      engines: {
        alerting: !!app.locals.alertingEngine?.initialized,
        advancedSearch: !!app.locals.advancedSearchEngine?.initialized,
        multiProtocolIngestion: !!app.locals.multiProtocolIngestionEngine?.initialized,
        fileIngestion: !!app.locals.fileIngestionEngine?.initialized,
        dataRetention: !!app.locals.dataRetentionEngine?.initialized,
        realTimeStreaming: !!app.locals.realTimeStreamingEngine?.initialized,
        anomalyDetection: !!app.locals.anomalyDetectionEngine?.initialized,
        logCorrelation: !!app.locals.logCorrelationEngine?.initialized,
        performanceOptimization: !!app.locals.performanceOptimizationEngine?.initialized,
        advancedDashboardBuilder: !!app.locals.advancedDashboardBuilder?.initialized,
        distributedTracing: !!app.locals.distributedTracingEngine?.initialized
      },
      timestamp: new Date().toISOString()
    };
    res.json(status);
  } catch (error) {
    req.app.locals?.loggers?.api?.error('Engines status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get engines status' });
  }
});

module.exports = router;