@echo off
cd /d "%~dp0"
echo Rebuilding SkillVault frontend...
call npm run build -w apps/web
if errorlevel 1 (
    echo Build failed.
    exit /b 1
)
echo Build complete. Refresh the browser tab to see the changes (no restart needed).
