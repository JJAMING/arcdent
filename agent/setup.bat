@echo off
"%SystemRoot%\System32\chcp.com" 65001 >nul 2>nul
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%SystemRoot%\System32;%PATH%"
set "NPM_CMD=npm"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
set "NODE_EXE=node"
if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
echo 필요한 부품을 설치하는 중입니다...
call "%NPM_CMD%" install --omit=dev --no-audit --no-fund
"%NODE_EXE%" src\setup.js
pause
