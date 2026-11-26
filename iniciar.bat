@echo off
rem Atalho antigo: agora o jeito recomendado e o Instalar.cmd (cria o atalho "Projecao Igreja").
title Projecao Igreja
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias (so na primeira vez)...
  call npm install --omit=dev --no-audit --no-fund
)
start "" http://localhost:3000
node launcher.js
pause
