/**
 * 🛡️ FUTURE-PROOFING STRATEGY
 * Ensures local changes sync with running container
 */

const fs = require('fs');
const { spawn } = require('child_process');

class DevProductionSync {
    constructor() {
        this.localPath = 'c:\\Users\\Tom Nelson\\Documents\\Visual_Studio_Code\\Node-Red-Home-Assistant\\logging-server';
        this.containerName = 'enhanced-logging-production';
        this.containerPath = '/app';
    }

    async syncToContainer(filePath) {
        console.log(`🔄 Syncing ${filePath} to container...`);
        
        return new Promise((resolve, reject) => {
            const localFile = `${this.localPath}\\${filePath}`;
            const containerFile = `${this.containerName}:${this.containerPath}/${filePath}`;
            
            const dockerCp = spawn('docker', ['cp', localFile, containerFile]);
            
            dockerCp.on('close', (code) => {
                if (code === 0) {
                    console.log(`✅ ${filePath} synced successfully`);
                    resolve();
                } else {
                    reject(new Error(`Failed to sync ${filePath}`));
                }
            });
        });
    }

    async deployChanges(filesToSync = []) {
        console.log('🚀 Deploying local changes to production container...\n');
        
        const defaultFiles = [
            'routes/dashboard.js',
            'database-access-layer.js', 
            'universal-sqlite-adapter.js',
            'fixed-database-migration.js',
            'error-recovery-system.js'
        ];
        
        const files = filesToSync.length > 0 ? filesToSync : defaultFiles;
        
        for (const file of files) {
            try {
                await this.syncToContainer(file);
            } catch (error) {
                console.error(`❌ Failed to sync ${file}: ${error.message}`);
            }
        }
        
        console.log('\n🔄 Restarting container to apply changes...');
        
        return new Promise((resolve, reject) => {
            const restart = spawn('docker', ['restart', this.containerName]);
            
            restart.on('close', (code) => {
                if (code === 0) {
                    console.log('✅ Container restarted successfully');
                    console.log('🎯 Production deployment complete!');
                    resolve();
                } else {
                    reject(new Error('Failed to restart container'));
                }
            });
        });
    }

    async validateDeployment() {
        console.log('\n🔍 Validating deployment...');
        
        return new Promise((resolve, reject) => {
            const validate = spawn('docker', ['exec', this.containerName, 'node', 'final-system-validation.js']);
            
            let output = '';
            validate.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            validate.on('close', (code) => {
                if (code === 0 && output.includes('100%')) {
                    console.log('✅ Deployment validation passed!');
                    resolve(true);
                } else {
                    console.log('❌ Deployment validation failed');
                    reject(new Error('Validation failed'));
                }
            });
        });
    }

    async fullDeploymentPipeline(filesToSync = []) {
        try {
            await this.deployChanges(filesToSync);
            
            // Wait for container to be ready
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            await this.validateDeployment();
            
            console.log('\n🎉 SUCCESS: Full deployment pipeline completed!');
            return true;
            
        } catch (error) {
            console.error('\n💥 Deployment pipeline failed:', error.message);
            console.log('\n🛠️ Running emergency recovery...');
            
            // Auto-recovery
            const recovery = spawn('docker', ['exec', this.containerName, 'node', 'error-recovery-system.js']);
            return false;
        }
    }
}

// Export for use
module.exports = { DevProductionSync };

// Command line usage
if (require.main === module) {
    const sync = new DevProductionSync();
    
    const args = process.argv.slice(2);
    const command = args[0];
    
    switch (command) {
        case 'sync':
            sync.deployChanges(args.slice(1)).catch(console.error);
            break;
        case 'deploy':
            sync.fullDeploymentPipeline(args.slice(1)).catch(console.error);
            break;
        case 'validate':
            sync.validateDeployment().catch(console.error);
            break;
        default:
            console.log(`
🛡️ DEVELOPMENT-PRODUCTION SYNC TOOL

Usage:
  node dev-prod-sync.js sync [files...]     - Sync specific files
  node dev-prod-sync.js deploy [files...]   - Full deployment pipeline
  node dev-prod-sync.js validate            - Validate current deployment

Examples:
  node dev-prod-sync.js sync routes/dashboard.js
  node dev-prod-sync.js deploy
  node dev-prod-sync.js validate
`);
            break;
    }
}