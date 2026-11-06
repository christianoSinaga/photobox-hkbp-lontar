@echo off
rem Double-click file ini untuk menyalakan photobox (server + Chrome mode kiosk).
rem Menjalankan start.ps1 tanpa perlu mengubah Execution Policy Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 pause
