param([string]$Pasta, [int]$Inicio = 0)
# Cria os atalhos: área de trabalho (abrir e fechar) e, se pedido, na inicialização do Windows.
$ErrorActionPreference = 'Stop'
$Pasta = (Resolve-Path $Pasta).Path
$sh = New-Object -ComObject WScript.Shell
$ico = Join-Path $Pasta 'windows\projecao.ico'
function Atalho($arquivo, $vbs, $descricao) {
  $l = $sh.CreateShortcut($arquivo)
  $l.TargetPath = "$env:WINDIR\System32\wscript.exe"
  $l.Arguments = '"' + (Join-Path $Pasta "windows\$vbs") + '"'
  $l.WorkingDirectory = $Pasta
  $l.IconLocation = $ico
  $l.Description = $descricao
  $l.Save()
}
$desk = [Environment]::GetFolderPath('Desktop')
Atalho (Join-Path $desk 'Projeção Igreja.lnk') 'Projecao.vbs' 'Abrir o sistema de projeção'
Atalho (Join-Path $desk 'Fechar Projeção.lnk') 'Fechar.vbs' 'Fechar o sistema de projeção'
$startup = [Environment]::GetFolderPath('Startup')
$auto = Join-Path $startup 'Projeção Igreja.lnk'
if ($Inicio -eq 1) { Atalho $auto 'Projecao.vbs' 'Abrir o sistema de projeção ao ligar' ; Write-Host '  Vai abrir sozinho quando o Windows ligar.' }
elseif (Test-Path $auto) { Remove-Item $auto }
Write-Host '  Atalhos criados na área de trabalho.'
