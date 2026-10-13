@echo off
"%SystemRoot%\System32\chcp.com" 65001 >nul 2>nul
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-task.ps1"
pause
