[CmdletBinding()]
param (
    [int]$Port = 8001
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

Write-Host "🚀 Servidor local iniciado en: http://127.0.0.1:$Port"
Write-Host "Presiona Ctrl+C para detener el servidor."
& $pythonCmd -m http.server $Port -b 127.0.0.1 -d $ScriptDir
