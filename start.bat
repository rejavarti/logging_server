@echo off
title Enhanced Universal Logging Platform
echo.
echo ╔══════════════════════════════════════════════════════════════╗
echo ║                Enhanced Universal Logging Platform           ║
echo ║                  Enterprise Grade Log Management             ║
echo ╚══════════════════════════════════════════════════════════════╝
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Node.js is not installed or not in PATH
    echo 📥 Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Check if npm packages are installed
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed successfully
    echo.
)

:: Start the universal launcher
echo 🚀 Starting Enhanced Universal Logging Platform...
echo.
node start.js

pause