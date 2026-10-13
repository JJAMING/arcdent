@echo off
"%SystemRoot%\System32\chcp.com" 65001 >nul 2>nul
cd /d "%~dp0"
set "NODE_EXE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
"%NODE_EXE%" src\index.js once
pause
