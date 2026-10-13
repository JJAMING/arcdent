# 아크덴트 덴트웹 중계 프로그램 - Windows 시작 시 자동 실행 등록
# 관리자 권한으로 실행해야 합니다. (install-task.bat 을 마우스 오른쪽 > 관리자 권한으로 실행)
$ErrorActionPreference = 'Stop'
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Test-Path (Join-Path $dir 'config.json'))) {
    Write-Host 'config.json 이 없습니다. 먼저 설정 파일을 만들고 check.bat 으로 점검해 주세요.' -ForegroundColor Red
    exit 1
}
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host 'Node.js 가 설치되어 있지 않습니다. https://nodejs.org 에서 LTS 버전을 설치해 주세요.' -ForegroundColor Red
    exit 1
}

$action = New-ScheduledTaskAction -Execute $nodeCmd.Source -Argument 'src\index.js run' -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName 'ArcdentAgent' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'ArcdentAgent'

Write-Host ''
Write-Host '자동 실행 등록 완료! 지금 바로 시작했고, PC를 켤 때마다 자동으로 실행됩니다.' -ForegroundColor Green
Write-Host "작업 기록: $dir\logs 폴더"
