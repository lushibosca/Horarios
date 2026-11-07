@echo off
chcp 65001 >nul
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8001"

set "HOST=%~2"
if "%HOST%"=="" set "HOST=127.0.0.1"

set "DIR=%~dp0"
if "%DIR:~-1%"=="\" set "DIR=%DIR:~0,-1%"
cd /d "%DIR%"

set "PY_CMD="
python --version >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
) else (
    py --version >nul 2>&1
    if not errorlevel 1 (
        set "PY_CMD=py"
    ) else (
        python3 --version >nul 2>&1
        if not errorlevel 1 (
            set "PY_CMD=python3"
        )
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] No se encontró Python en el sistema.
    echo Asegúrate de tener Python instalado y agregado al PATH.
    pause
    exit /b 1
)

if "%HOST%"=="0.0.0.0" (
    echo 🚀 Servidor iniciado en todas las interfaces (0.0.0.0) en el puerto %PORT%
    echo    Acceso local: http://localhost:%PORT%
) else (
    echo 🚀 Servidor local iniciado en: http://%HOST%:%PORT%
)
echo Presiona Ctrl+C para detener el servidor.
"%PY_CMD%" "%DIR%\scripts\servidor.py" %PORT% %HOST% "%DIR%"
