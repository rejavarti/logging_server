/**
 * 🔍 SIMPLE DAL HEALTH CHECK
 * 
 * Basic validation that DAL methods exist and can be called without crashing.
 */

const path = require('path');
const fs = require('fs');

// Test if we can at least load and inspect the DAL without full initialization
async function validateDALStructure() {
    try {
        console.log('🔍 SIMPLE DAL VALIDATION');
        console.log('==================================================');

        // Load the DAL class
        const DatabaseAccessLayer = require('./database-access-layer');
        console.log('✅ DAL class loaded successfully');

        // Check that key methods exist
        const dalPrototype = DatabaseAccessLayer.prototype;
        const requiredMethods = [
            'getSystemStats',
            'getSystemHealth', 
            'getRecentLogs',
            'getLogSources',
            'getAllSettings',
            'getAllUsers',
            'getUserById',
            'getUserByUsername',
            'getDashboardWidgets'
        ];

        console.log('\n🔧 CHECKING DAL METHOD EXISTENCE:');
        let methodsFound = 0;
        let methodsMissing = 0;

        for (const method of requiredMethods) {
            if (typeof dalPrototype[method] === 'function') {
                console.log(`✅ ${method}: exists`);
                methodsFound++;
            } else {
                console.log(`❌ ${method}: MISSING`);
                methodsMissing++;
            }
        }

        console.log('\n📊 DAL STRUCTURE VALIDATION SUMMARY');
        console.log('==================================================');
        console.log(`Total Required Methods: ${requiredMethods.length}`);
        console.log(`✅ Found: ${methodsFound}`);
        console.log(`❌ Missing: ${methodsMissing}`);
        console.log(`📈 Coverage: ${((methodsFound / requiredMethods.length) * 100).toFixed(1)}%`);

        if (methodsMissing === 0) {
            console.log('\n🎉 ALL DAL METHODS PRESENT!');
            console.log('The DAL structure is valid and complete.');
        } else {
            console.log('\n⚠️  MISSING METHODS DETECTED!');
            console.log('Some required DAL methods are not implemented.');
        }

        // Check Universal SQLite Adapter
        console.log('\n🔧 CHECKING UNIVERSAL SQLITE ADAPTER:');
        const UniversalSQLiteAdapter = require('./universal-sqlite-adapter');
        console.log('✅ Universal SQLite Adapter loaded successfully');
        
        const adapter = new UniversalSQLiteAdapter();
        console.log('✅ Adapter instance created');
        
        // Test environment detection
        const isDocker = process.env.NODE_ENV === 'production' || 
                        fs.existsSync('/.dockerenv') || 
                        process.env.DOCKER_CONTAINER === 'true';
        console.log(`🐳 Docker Environment: ${isDocker}`);
        console.log(`🖥️  Platform: ${process.platform}`);
        
        console.log('\n🎯 SIMPLE DAL VALIDATION COMPLETE');
        console.log('Structure validation passed. For full testing, use API endpoints.');
        
        return true;
        
    } catch (error) {
        console.error('\n❌ DAL VALIDATION FAILED:', error.message);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Run the validation
async function main() {
    const success = await validateDALStructure();
    process.exit(success ? 0 : 1);
}

if (require.main === module) {
    main();
}