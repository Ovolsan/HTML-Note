# HTML Note: установка Rust и инструментов сборки C++ для Tauri.
# Запускайте двойным щелчком по install-rust.cmd из Проводника: так PATH и переменные среды
# попадут в систему, а не в изолированную среду другой программы.
$ErrorActionPreference = 'Stop'
$log = Join-Path $PSScriptRoot 'install-rust.log'
Start-Transcript -Path $log -Force | Out-Null

$rustRoot = 'M:\Rust'
$vsRoot   = 'M:\VS'

function Step($text) { Write-Host "`n=== $text ===" -ForegroundColor Cyan }

try {
    Step '1/4. Папки Rust на диске M:'
    # Rust и кэш библиотек будут на M:, чтобы не занимать место на C:.
    [Environment]::SetEnvironmentVariable('RUSTUP_HOME', "$rustRoot\rustup", 'User')
    [Environment]::SetEnvironmentVariable('CARGO_HOME',  "$rustRoot\cargo",  'User')
    $env:RUSTUP_HOME = "$rustRoot\rustup"
    $env:CARGO_HOME  = "$rustRoot\cargo"
    Write-Host "RUSTUP_HOME = $env:RUSTUP_HOME"
    Write-Host "CARGO_HOME  = $env:CARGO_HOME"

    Step '2/4. Инструменты сборки Microsoft C++ (MSVC + Windows SDK)'
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $haveMsvc = (Test-Path $vswhere) -and (& $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath)
    if ($haveMsvc) {
        Write-Host 'Уже установлены, пропускаю.'
    } else {
        Write-Host 'Сейчас winget попросит принять лицензию (Y) и Windows спросит права администратора.'
        Write-Host 'Установка займёт 10-30 минут. Окно установщика Visual Studio закрывать не нужно.'
        $override = "--passive --wait --norestart --installPath $vsRoot\BuildTools --path shared=$vsRoot\Shared --path cache=$vsRoot\Cache " +
                    "--add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100"
        # Build Tools 2022 из winget падают с кодом 5008 (устаревший установщик), поэтому берём 2026.
        winget install --id Microsoft.VisualStudio.BuildTools -e --override $override
        if ($LASTEXITCODE -ne 0) { throw "winget завершился с кодом $LASTEXITCODE" }
    }

    Step '3/4. Rust (rustup, stable, минимальный набор)'
    $rustupInit = Join-Path $env:TEMP 'rustup-init.exe'
    Invoke-WebRequest -Uri 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe' -OutFile $rustupInit -UseBasicParsing
    & $rustupInit -y --default-toolchain stable --profile minimal
    if ($LASTEXITCODE -ne 0) { throw "rustup-init завершился с кодом $LASTEXITCODE" }
    Remove-Item -LiteralPath $rustupInit -Force

    Step '4/4. Проверка'
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'User') + ';' + [Environment]::GetEnvironmentVariable('Path', 'Machine')
    & "$env:CARGO_HOME\bin\rustc.exe" --version
    & "$env:CARGO_HOME\bin\cargo.exe" --version
    $msvc = & $vswhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    Write-Host "MSVC: $msvc"
    Write-Host "`nГОТОВО. Можно закрыть окно." -ForegroundColor Green
}
catch {
    Write-Host "`nОШИБКА: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Журнал: $log"
}
finally {
    Stop-Transcript | Out-Null
}
