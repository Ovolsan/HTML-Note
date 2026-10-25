@echo off
rem Сборка установщика HTML Note. Результат: src-tauri\target\release\bundle\nsis
chcp 65001 >nul
cd /d "%~dp0.."
if not defined CARGO_HOME set "CARGO_HOME=M:\Rust\cargo"
if not defined RUSTUP_HOME set "RUSTUP_HOME=M:\Rust\rustup"
set "PATH=%CARGO_HOME%\bin;%PATH%"
call npm install --no-fund --no-audit || goto :fail
call npm run tauri build || goto :fail
echo.
echo Готово. Установщик:
dir /b "src-tauri\target\release\bundle\nsis\*.exe"
pause
exit /b 0
:fail
echo.
echo Сборка не удалась, смотрите сообщения выше.
pause
exit /b 1
