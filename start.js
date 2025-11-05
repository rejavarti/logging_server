#!/usr/bin/env node
/**
 * Universal Launcher for Enhanced Universal Logging Platform
 * Automatically detects if setup is needed and launches appropriate server
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class UniversalLauncher {
    constructor() {
        this.setupDataPath = path.join(__dirname, 'data', 'setup-complete.json');
        this.envPath = path.join(__dirname, '.env');
    }

    isSetupComplete() {
        return fs.existsSync(this.setupDataPath) && fs.existsSync(this.envPath);
    }

    async launch() {
        console.log('\n🚀 Enhanced Universal Logging Platform Launcher');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        if (this.isSetupComplete()) {
            console.log('✅ Setup detected - Starting main server...\n');
            this.startMainServer();
        } else {
            console.log('🔧 Initial setup required - Starting setup wizard...\n');
            this.startSetupWizard();
        }
    }

    startSetupWizard() {
        const setupProcess = spawn('node', ['initial-setup-server.js'], {
            stdio: 'inherit',
            cwd: __dirname
        });

        setupProcess.on('exit', (code) => {
            if (code === 0) {
                console.log('\n✅ Setup completed successfully!');
                console.log('🔄 Starting main server...\n');
                setTimeout(() => {
                    this.startMainServer();
                }, 2000);
            } else {
                console.error('\n❌ Setup failed or was cancelled.');
                console.error('Please run setup manually: node initial-setup-server.js');
                process.exit(1);
            }
        });

        setupProcess.on('error', (error) => {
            console.error('Failed to start setup wizard:', error);
            process.exit(1);
        });
    }

    startMainServer() {
        const serverProcess = spawn('node', ['server.js'], {
            stdio: 'inherit',
            cwd: __dirname
        });

        serverProcess.on('exit', (code) => {
            console.log(`\nServer exited with code: ${code}`);
            if (code === 0) {
                console.log('Server shut down gracefully.');
            } else {
                console.log('Server encountered an error.');
            }
        });

        serverProcess.on('error', (error) => {
            console.error('Failed to start main server:', error);
            process.exit(1);
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down...');
            serverProcess.kill('SIGINT');
        });

        process.on('SIGTERM', () => {
            console.log('\n🛑 Shutting down...');
            serverProcess.kill('SIGTERM');
        });
    }
}

// Start launcher if run directly
if (require.main === module) {
    const launcher = new UniversalLauncher();
    launcher.launch().catch(console.error);
}

module.exports = UniversalLauncher;