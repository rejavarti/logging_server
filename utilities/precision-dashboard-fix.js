/**
 * PRECISE DASHBOARD FIX
 * Applies the exact fix for the logsToday issue
 */

const fs = require('fs');

async function precisionFix() {
    console.log('🎯 Applying precision dashboard fix...');
    
    try {
        const dashboardPath = '/app/routes/dashboard.js';
        let content = fs.readFileSync(dashboardPath, 'utf8');
        
        // The exact pattern we need to replace
        const oldCode = `        try {
            stats = await req.dal.getSystemStats() || stats;
        } catch (error) {
            console.error('Error getting system stats:', error);
        }`;
        
        const newCode = `        try {
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
        
        if (content.includes(oldCode)) {
            content = content.replace(oldCode, newCode);
            fs.writeFileSync(dashboardPath, content);
            console.log('✅ Fix applied successfully!');
        } else {
            // More targeted replacement
            const targetLine = "            stats = await req.dal.getSystemStats() || stats;";
            const replacement = `            stats = await req.dal.getSystemStats() || stats;
            // Add logsToday calculation
            const todayLogsResult = await req.dal.get(\`
                SELECT COUNT(*) as count 
                FROM logs 
                WHERE date(timestamp) = date('now')
            \`);
            stats.logsToday = todayLogsResult ? todayLogsResult.count : 0;`;
            
            if (content.includes(targetLine)) {
                content = content.replace(targetLine, replacement);
                fs.writeFileSync(dashboardPath, content);
                console.log('✅ Targeted fix applied successfully!');
            } else {
                throw new Error('Could not find target line for replacement');
            }
        }
        
        console.log('🔄 Fix applied, restarting container...');
        
    } catch (error) {
        console.error('❌ Precision fix failed:', error.message);
        
        // Create a minimal working patch
        console.log('🔧 Creating minimal patch...');
        
        const minimalPatch = `
// Add this after line 29 in dashboard.js:
stats.logsToday = 0; // Default value
try {
    const todayResult = await req.dal.get('SELECT COUNT(*) as count FROM logs WHERE date(timestamp) = date("now")');
    stats.logsToday = todayResult ? todayResult.count : 0;
} catch (e) {
    console.warn('Could not get logsToday:', e.message);
}
`;
        
        fs.writeFileSync('/app/manual-patch-instructions.txt', minimalPatch);
        console.log('📝 Manual patch instructions saved to /app/manual-patch-instructions.txt');
    }
}

precisionFix();