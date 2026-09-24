@echo off
cd /d "%~dp0"
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://127.0.0.1:4173/"
node tools\serve.mjs
