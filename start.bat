@echo off
cd /d "%~dp0"
start "USB Helper" cmd /k node usb-server\server.js
start "USB Transfer Pro" cmd /k npm run dev
