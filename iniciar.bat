@echo off
chcp 65001 >nul
setlocal

set "PORT=%~1"
if "%PORT%"=="" set "PORT=8001"

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

echo 🚀 Servidor local iniciado en: http://127.0.0.1:%PORT%
echo Presiona Ctrl+C para detener el servidor.
"%PY_CMD%" -m http.server %PORT% -b 127.0.0.1 -d "%DIR%"
