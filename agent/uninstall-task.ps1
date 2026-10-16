# 아크덴트 덴트웹 중계 프로그램 - 자동 실행 해제 (관리자 권한 필요)
$ErrorActionPreference = 'Stop'
if (Get-ScheduledTask -TaskName 'ArcdentAgent' -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName 'ArcdentAgent' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'ArcdentAgent' -Confirm:$false
    Write-Host '자동 실행을 해제했습니다.' -ForegroundColor Green
} else {
    Write-Host '등록된 자동 실행 작업이 없습니다.'
}
# 런처/중계 프로그램 프로세스가 남아 있으면 종료
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and ($_.CommandLine -match 'src\\index\.js run' -or $_.CommandLine -match 'launcher\.js') } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
