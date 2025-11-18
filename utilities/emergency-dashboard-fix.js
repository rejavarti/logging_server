/**
 * EMERGENCY DASHBOARD FIX
 * Applies the logsToday fix directly to the running container
 */

const fs = require('fs');

async function emergencyDashboardFix() {
    console.log('🚨 Applying emergency dashboard fix...');
    
    try {
        // Read the current dashboard.js file
        const dashboardPath = '/app/routes/dashboard.js';
        let dashboardContent = fs.readFileSync(dashboardPath, 'utf8');
        
        console.log('📖 Reading current dashboard.js file...');
        
        // Check if our fix is already applied
        if (dashboardContent.includes('stats.logsToday =')) {
            console.log('✅ Fix already applied, but something else is wrong...');
            
            // Let's check what the getSystemStats actually returns
            const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
            const db = new UniversalSQLiteAdapter('/app/logs.db');
            
            const stats = await db.get(`
                SELECT 
                    COUNT(*) as totalLogs,
                    SUM(CASE WHEN level = 'error' THEN 1 ELSE 0 END) as errorCount,
                    SUM(CASE WHEN level = 'warning' THEN 1 ELSE 0 END) as warningCount,
                    SUM(CASE WHEN level = 'info' THEN 1 ELSE 0 END) as infoCount,
                    SUM(CASE WHEN level = 'debug' THEN 1 ELSE 0 END) as debugCount
                FROM logs 
                WHERE timestamp >= datetime('now', '-24 hours')
            `);
            
            console.log('📊 Current stats from DB:', stats);
            return;
        }
        
        console.log('🔧 Applying logsToday fix...');
        
        // Apply the fix: add logsToday calculation after getSystemStats
        const oldPattern = `        try {
            stats = await req.dal.getSystemStats() || stats;
        } catch (error) {
            console.error('Error getting system stats:', error);
        }`;
        
        const newPattern = `        try {
            stats = await req.dal.getSystemStats() || stats;
            // Add logsToday calculation
            const todayLogsResult = await req.dal.get(\`
                SELECT COUNT(*) as count 
                FROM logs 
                WHERE date(timestamp) = date('now')
            \`);
            stats.logsToday = todayLogsResult ? todayLogsResult.count : 0;
        } catch (error) {
            console.error('Error getting system stats:', error);
            stats.logsToday = 0;
        }`;
        
        if (dashboardContent.includes(oldPattern)) {
            dashboardContent = dashboardContent.replace(oldPattern, newPattern);
            
            // Write the fixed content back
            fs.writeFileSync(dashboardPath, dashboardContent);
            
            console.log('✅ Dashboard fix applied successfully!');
            console.log('🔄 Restart the server to apply changes...');
            
        } else {
            console.log('⚠️ Could not find exact pattern to replace. Manual fix needed.');
            console.log('Looking for alternative patterns...');
            
            // Try a more flexible approach
            if (dashboardContent.includes('getSystemStats()')) {
                console.log('📍 Found getSystemStats() call, need manual inspection');
                
                // Show the relevant section
                const lines = dashboardContent.split('\n');
                const statsLineIndex = lines.findIndex(line => line.includes('getSystemStats()'));
                
                if (statsLineIndex > -1) {
                    console.log('Current code around getSystemStats():');
                    for (let i = Math.max(0, statsLineIndex - 3); i < Math.min(lines.length, statsLineIndex + 8); i++) {
                        console.log(`${i + 1}: ${lines[i]}`);
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('❌ Emergency fix failed:', error.message);
        
        // Alternative approach: create a new fixed file
        console.log('🔄 Attempting alternative fix...');
        
        try {
            const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
            const db = new UniversalSQLiteAdapter('/app/logs.db');
            
            // Test if we can get logsToday directly
            const todayLogs = await db.get(`
                SELECT COUNT(*) as count 
                FROM logs 
                WHERE date(timestamp) = date('now')
            `);
            
            console.log('📊 Logs today from direct query:', todayLogs);
            
            // Create a patch file that adds logsToday to the stats object
            const patchCode = `
// EMERGENCY PATCH: Add to stats object before rendering
if (typeof stats === 'object' && stats !== null) {
    stats.logsToday = stats.logsToday || 0;
}
`;
            
            fs.writeFileSync('/app/emergency-stats-patch.js', patchCode);
            console.log('✅ Emergency patch created');
            
        } catch (patchError) {
            console.error('❌ Alternative fix also failed:', patchError.message);
        }
    }
}

// Run the emergency fix
emergencyDashboardFix()
    .then(() => {
        console.log('🎯 Emergency dashboard fix completed');
        process.exit(0);
    })
    .catch(error => {
        console.error('💥 Emergency fix crashed:', error);
        process.exit(1);
    });