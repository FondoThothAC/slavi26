@echo off
echo ============================================
echo   SLAVI Trading Bot - Auto-Run Setup
echo ============================================
echo.
echo This will configure the bot to start automatically on Windows startup.
echo.

:: Get current directory
set "SCRIPT_PATH=%~dp0start_bot.bat"

:: Create VBS wrapper for hidden execution (optional)
echo Set WshShell = CreateObject("WScript.Shell") > "%~dp0start_hidden.vbs"
echo WshShell.Run chr(34) ^& "%SCRIPT_PATH%" ^& chr(34), 0 >> "%~dp0start_hidden.vbs"
echo Set WshShell = Nothing >> "%~dp0start_hidden.vbs"

:: Add to Startup folder
set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Creating startup shortcut...

:: Create shortcut using PowerShell
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%STARTUP_FOLDER%\SLAVI Bot.lnk'); $Shortcut.TargetPath = '%~dp0start_bot.bat'; $Shortcut.WorkingDirectory = '%~dp0'; $Shortcut.Save()"

if %errorlevel% equ 0 (
    echo.
    echo [OK] Auto-run configured successfully!
    echo.
    echo The bot will now start automatically when Windows starts.
    echo Shortcut created at: %STARTUP_FOLDER%\SLAVI Bot.lnk
    echo.
    echo To remove auto-run, delete: %STARTUP_FOLDER%\SLAVI Bot.lnk
) else (
    echo.
    echo [ERROR] Failed to create startup shortcut
    echo Please manually copy start_bot.bat to your Startup folder:
    echo %STARTUP_FOLDER%
)

echo.
pause
