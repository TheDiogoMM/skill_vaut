@echo off
setlocal enabledelayedexpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"
set "WEB_DIST=%ROOT%apps\web\dist"
set "URL=http://localhost:3001"
set "HEALTH_URL=%URL%/api/health"

if not exist "%WEB_DIST%\index.html" (
    echo Building frontend, this may take a minute...
    call npm run build -w apps/web
    if errorlevel 1 (
        echo Frontend build failed. Check the output above.
        exit /b 1
    )
)

call :CHECK_HEALTH
if "!HEALTH_CODE!"=="200" (
    echo SkillVault is already running.
    goto OPEN_BROWSER
)

echo Starting SkillVault server...
wscript.exe "%ROOT%run-server-hidden.vbs"

set /a ATTEMPTS=0
:WAIT_LOOP
set /a ATTEMPTS+=1
timeout /t 1 /nobreak >NUL
call :CHECK_HEALTH
if "!HEALTH_CODE!"=="200" goto OPEN_BROWSER
if !ATTEMPTS! GEQ 20 (
    echo SkillVault did not start within 20 seconds. Check for errors and try again.
    exit /b 1
)
goto WAIT_LOOP

:OPEN_BROWSER
start "" "%URL%"
goto :EOF

:CHECK_HEALTH
set "TMPFILE=%TEMP%\skillvault_health_%RANDOM%.txt"
curl -s -o NUL -w "%%{http_code}" "%HEALTH_URL%" > "%TMPFILE%" 2>NUL
set /p HEALTH_CODE=<"%TMPFILE%"
del "%TMPFILE%" >NUL 2>&1
goto :EOF
