@echo off
echo Windows Accessibility Service Launcher
echo =====================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

echo Choose service type:
echo 1. Full Windows API Service (requires working pywin32)
echo 2. Simple Mock Service (for testing)
echo 3. Fix pywin32 installation
echo.
set /p choice="Enter your choice (1-3): "

if "%choice%"=="3" (
    echo.
    echo Running pywin32 fix...
    call fix_pywin32.bat
    goto :end
)

if "%choice%"=="2" (
    echo.
    echo Starting Simple Mock Service...
    echo This provides fake accessibility data for testing
    echo.
    python simple_accessibility_service.py
    goto :end
)

REM Default to full service (choice 1 or any other input)
echo.
echo Starting Full Windows API Service...

REM Install requirements
echo Installing requirements...
pip install -r requirements.txt
if errorlevel 1 (
    echo Error: Failed to install requirements
    echo Try running fix_pywin32.bat first
    pause
    exit /b 1
)

REM Test imports first
echo Testing Windows API imports...
python -c "import win32api; import win32gui; import comtypes; print('✅ All imports successful!')" >nul 2>&1
if errorlevel 1 (
    echo.
    echo ❌ Windows API imports failed!
    echo.
    echo Options:
    echo 1. Run fix_pywin32.bat to fix pywin32 installation
    echo 2. Use the Simple Mock Service instead (option 2)
    echo.
    set /p fix_choice="Run pywin32 fix now? (y/n): "
    if /i "%fix_choice%"=="y" (
        call fix_pywin32.bat
        echo.
        echo Retrying service start...
    ) else (
        echo Starting Simple Mock Service instead...
        python simple_accessibility_service.py
        goto :end
    )
)

REM Start the full service
echo.
echo Starting accessibility service...
echo Press Ctrl+C to stop the service
echo.
python windows_accessibility_service.py

:end
pause