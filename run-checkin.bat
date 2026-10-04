@echo off
chcp 65001 >nul

set "SCRIPT_DIR=%~dp0"
set "LOG_DIR=%SCRIPT_DIR%logs"
set "LOG_FILE=%LOG_DIR%\checkin_%date:~0,4%%date:~5,2%%date:~8,2%.log"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo [%date% %time%] Start checkin... >> "%LOG_FILE%"
node "%SCRIPT_DIR%checkin.cjs" >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"
echo [%date% %time%] Exit code: %EXIT_CODE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

if "%EXIT_CODE%"=="0" (
    echo Done. Log: %LOG_FILE%
) else (
    echo FAILED. Log: %LOG_FILE%
)
exit /b %EXIT_CODE%