/**
 * Enhanced Universal Logging Server - Modular Architecture
 * Main entry point with clean separation of concerns
 * 
 * Tom Nelson - 2025
 * Features: Multi-user authentication, enterprise dashboard, all integrations
 */

const express = require('express');
const path = require('path');

// Import configuration
const config = require('./config');
const { loggers } = require('./config/logging');

// Import Database Access Layer
const DatabaseAccessLayer = require('./database-access-layer');

// Import Engines
const AlertingEngine = require('./engines/alerting');
const AdvancedSearchEngine = require('./engines/search');
const MultiProtocolIngestionEngine = require('./engines/ingestion');
const DataRetentionEngine = require('./engines/retention');

// Import Managers  
const IntegrationManager = require('./managers/integration');
const MetricsManager = require('./managers/metrics');
const UserManager = require('./managers/user');

// Import Middleware
const authMiddleware = require('./middleware/auth');
const rateLimitMiddleware = require('./middleware/rateLimit');
const loggingMiddleware = require('./middleware/logging');

// Import Routes
const authRoutes = require('./routes/auth');
const logRoutes = require('./routes/logs');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const PORT = process.env.PORT || 10180;

// Global DAL instance
let dal = null;

// Initialize application
async function initializeApplication() {
    try {
        loggers.system.info('🚀 Starting Enhanced Universal Logging Server...');
        
        // Initialize Database Access Layer
        const dbPath = path.join(__dirname, 'data', 'databases', 'logs.db');
        dal = new DatabaseAccessLayer(dbPath);
        await dal.initialize();
        loggers.system.info('✅ Database Access Layer initialized');

        // Initialize Engines
        const alertingEngine = new AlertingEngine(dal, loggers);
        await alertingEngine.initialize();
        
        const searchEngine = new AdvancedSearchEngine(dal, loggers);
        await searchEngine.initialize();
        
        const ingestionEngine = new MultiProtocolIngestionEngine(dal, loggers);
        await ingestionEngine.initialize();
        
        const retentionEngine = new DataRetentionEngine(dal, loggers);
        await retentionEngine.initialize();
        
        // Initialize Managers
        const integrationManager = new IntegrationManager(config, loggers);
        await integrationManager.initialize();
        
        const metricsManager = new MetricsManager(dal, loggers);
        await metricsManager.initialize();
        
        const userManager = new UserManager(dal, loggers);
        await userManager.initialize();
        
        loggers.system.info('✅ All engines and managers initialized');

        // Setup Express middleware
        setupMiddleware();
        
        // Setup routes with dependency injection
        setupRoutes({
            dal,
            alertingEngine,
            searchEngine,
            integrationManager,
            metricsManager,
            userManager,
            loggers
        });
        
        // Start server
        startServer();
        
    } catch (error) {
        loggers.system.error('❌ Failed to initialize application:', error);
        process.exit(1);
    }
}

function setupMiddleware() {
    // Basic Express middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    
    // Custom middleware
    app.use(rateLimitMiddleware);
    app.use(loggingMiddleware(loggers));
    app.use(authMiddleware.session);
}

function setupRoutes(dependencies) {
    // Mount route modules with dependency injection
    app.use('/api/auth', authRoutes(dependencies));
    app.use('/api/logs', logRoutes(dependencies));  
    app.use('/api', apiRoutes(dependencies));
    app.use('/admin', adminRoutes(dependencies));
    app.use('/', dashboardRoutes(dependencies));
    
    // Error handling middleware
    app.use((err, req, res, next) => {
        loggers.system.error('Unhandled error:', err);
        res.status(500).json({ 
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
        });
    });
    
    // 404 handler
    app.use('*', (req, res) => {
        res.status(404).json({ error: 'Route not found' });
    });
}

function startServer() {
    app.listen(PORT, () => {
        loggers.system.info(`🌟 Enhanced Universal Logging Server running on port ${PORT}`);
        loggers.system.info(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
        loggers.system.info(`🔍 Search: http://localhost:${PORT}/search`);
        loggers.system.info(`⚙️  Admin: http://localhost:${PORT}/admin/settings`);
    });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    loggers.system.info('Received SIGTERM, shutting down gracefully...');
    // Close database connections, stop engines, etc.
    if (dal) {
        await dal.close();
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    loggers.system.info('Received SIGINT, shutting down gracefully...');
    if (dal) {
        await dal.close();
    }
    process.exit(0);
});

// Start the application
initializeApplication();

module.exports = app;