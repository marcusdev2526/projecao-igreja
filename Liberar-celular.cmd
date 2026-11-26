@echo off
rem Libera o celular e outros aparelhos da rede local para acessar o sistema (porta 3000).
rem Precisa de permissao de administrador: o Windows vai perguntar.
net session >nul 2>&1
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
echo.
echo  Liberando a porta 3000 para a rede local (celular, tablet, retorno)...
netsh advfirewall firewall delete rule name="Projecao Igreja" >nul 2>&1
netsh advfirewall firewall add rule name="Projecao Igreja" dir=in action=allow protocol=TCP localport=3000 remoteip=localsubnet profile=any >nul
if errorlevel 1 (echo  Nao consegui criar a regra do firewall. & pause & exit /b 1)
echo  Pronto! O celular ja consegue abrir o sistema (no mesmo Wi-Fi).
echo  So aparelhos da mesma rede local conseguem acessar.
timeout /t 5 >nul
