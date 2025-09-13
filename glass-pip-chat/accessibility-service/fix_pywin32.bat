@echo off
echo Fixing pywin32 installation...
echo.

REM Force reinstall pywin32
echo Step 1: Reinstalling pywin32...
pip uninstall pywin32 -y
pip install pywin32

REM Run post-install script
echo.
echo Step 2: Running pywin32 post-install script...
python -c "import sys; import os; sys.path.append(os.path.join(sys.prefix, 'Scripts')); import pywin32_postinstall; pywin32_postinstall.install()"

REM Alternative method if the above fails
if errorlevel 1 (
    echo Post-install script failed, trying alternative method...
    for /f "tokens=*" %%i in ('python -c "import sys; print(sys.executable)"') do set PYTHON_PATH=%%i
    for /f "tokens=*" %%i in ('python -c "import sys; print(sys.prefix)"') do set PYTHON_PREFIX=%%i
    
    if exist "%PYTHON_PREFIX%\Scripts\pywin32_postinstall.py" (
        echo Found pywin32_postinstall.py, running it...
        python "%PYTHON_PREFIX%\Scripts\pywin32_postinstall.py" -install
    ) else (
        echo pywin32_postinstall.py not found, trying manual registration...
        python -c "import win32api; print('pywin32 is working!')"
    )
)

echo.
echo Step 3: Testing imports...
python -c "import win32api; import win32gui; import comtypes; print('✅ All imports successful!')"

if errorlevel 1 (
    echo.
    echo ❌ Import test failed. Additional troubleshooting needed.
    echo Try running as administrator or check your Python installation.
) else (
    echo.
    echo ✅ pywin32 installation fixed successfully!
    echo You can now run the full accessibility service.
)

echo.
pause