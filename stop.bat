@echo off
setlocal enabledelayedexpansion

set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo Stopping SkillVault (PID %%P)...
    taskkill /PID %%P /F >NUL 2>&1
    set "FOUND=1"
)

if "!FOUND!"=="0" (
    echo SkillVault is not running.
) else (
    echo SkillVault stopped.
)
endlocal
