@echo off
title Projecao Igreja
cd /d %~dp0
if not exist node_modules (
  echo Instalando dependencias (so na primeira vez)...
  call npm install
)
start "" http://localhost:3000
node launcher.js
pause
