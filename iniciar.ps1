[CmdletBinding()]
param (
    [int]$Port = 8001,
    [string]$Bind = "127.0.0.1"
)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$pythonCmd = $null
foreach ($cmd in @('python', 'py', 'python3')) {
    if (Get-Command $cmd -ErrorAction SilentlyContinue) {
        $pythonCmd = $cmd
        break
    }
}

if (-not $pythonCmd) {
    Write-Error "No se encontró Python en el sistema. Asegúrate de tener Python instalado y agregado al PATH."
    exit 1
}

if ($Bind -eq "0.0.0.0") {
    Write-Host "🚀 Servidor iniciado en todas las interfaces (0.0.0.0) en el puerto $Port"
    Write-Host "   Acceso local: http://localhost:$Port"
} else {
    Write-Host "🚀 Servidor local iniciado en: http://${Bind}:$Port"
}
Write-Host "Presiona Ctrl+C para detener el servidor."
& $pythonCmd (Join-Path $ScriptDir "scripts/servidor.py") $Port $Bind $ScriptDir
