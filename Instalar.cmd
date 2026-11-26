@echo off
setlocal EnableExtensions
title Instalar Projecao Igreja
rem Funciona de qualquer pasta (inclusive "projecao-igreja\projecao-igreja"): usa a pasta deste arquivo.
cd /d "%~dp0"
echo.
echo  ==========================================
echo    Projecao Igreja - instalacao
echo  ==========================================
echo.

rem ---- 1) Node.js 22 ou mais novo ----
set "NODE=node"
where node >nul 2>nul || (if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe")
"%NODE%" -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" >nul 2>nul
if errorlevel 1 (
  echo  Instalando o Node.js LTS (precisa de internet)...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo  Nao consegui instalar sozinho. Baixe e instale o Node.js LTS:
    echo  https://nodejs.org   e depois rode este instalador de novo.
    start "" https://nodejs.org
    pause
    exit /b 1
  )
  winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  set "NODE=%ProgramFiles%\nodejs\node.exe"
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)
"%NODE%" -v >nul 2>nul || (echo  O Node.js nao foi encontrado. Reinicie o computador e rode de novo. & pause & exit /b 1)
echo  Node.js encontrado:
"%NODE%" -v

rem ---- 2) Dependencias ----
echo.
echo  Instalando as dependencias (so demora na primeira vez)...
call npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (echo  Erro ao instalar as dependencias. Verifique a internet e rode de novo. & pause & exit /b 1)

rem ---- 3) Liberar o celular no firewall do Windows ----
echo.
echo  Liberando o celular no firewall (o Windows vai pedir permissao)...
call "%~dp0Liberar-celular.cmd"

rem ---- 4) Atalhos ----
echo.
choice /c SN /n /m " Abrir o sistema sozinho quando o Windows ligar? [S/N] "
set "AUTO=0"
if %errorlevel%==1 set "AUTO=1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows\atalhos.ps1" -Pasta "%~dp0." -Inicio %AUTO%

echo.
echo  Pronto! Use o atalho "Projecao Igreja" na area de trabalho.
echo  Abrindo agora...
start "" wscript.exe "%~dp0windows\Projecao.vbs"
timeout /t 4 >nul
