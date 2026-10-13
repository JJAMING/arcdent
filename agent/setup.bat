@echo off
chcp 65001 >nul
cd /d "%~dp0"
call npm install --omit=dev --no-audit --no-fund
if not exist config.json copy config.example.json config.json >nul
echo.
echo [OK] 설치 완료. 메모장으로 config.json 을 열어 값을 입력한 뒤 check.bat 을 실행하세요.
pause
