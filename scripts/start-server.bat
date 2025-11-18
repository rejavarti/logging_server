@echo off
title Enhanced Universal Logging Platform - Main Server
color 0A
echo.
echo  ========================================
echo   Enhanced Universal Logging Platform
echo   Main Server Starting...
echo  ========================================
echo.

cd /d "%~dp0"
node server.js

echo.
echo Server has stopped. Press any key to exit...
pause >nul