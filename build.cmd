@echo off
rem Double-click file ini untuk build photobox.
rem Menjalankan build.ps1 tanpa perlu mengubah Execution Policy Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
