@echo off
"%SystemRoot%\System32\chcp.com" 65001 >nul 2>nul
cd /d "%~dp0"
set "PATH=%ProgramFiles%\nodejs;%SystemRoot%\System32;%PATH%"
set "NPM_CMD=npm"
if exist "%ProgramFiles%\nodejs\npm.cmd" set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
call "%NPM_CMD%" install --omit=dev --no-audit --no-fund
if not exist config.json copy config.example.json config.json >nul
echo.
echo [OK] 설치 완료. 메모장으로 config.json 을 열어 값을 입력한 뒤 check.bat 을 실행하세요.
pause
