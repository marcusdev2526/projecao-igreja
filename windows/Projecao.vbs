' Abre o sistema sem janela preta: liga o servidor escondido (se ainda nao estiver ligado)
' e abre o painel numa janela propria do Edge (ou no navegador padrao).
Option Explicit
Dim sh, fso, pasta, node, url, i, ok
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
url = "http://localhost:3000"

node = "node"
If fso.FileExists(sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe") Then node = """" & sh.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"""

If Not Ligado() Then
  If Not fso.FolderExists(pasta & "\data") Then fso.CreateFolder(pasta & "\data")
  sh.CurrentDirectory = pasta
  ' 0 = escondido; o registro fica em data\sistema.log
  sh.Run "cmd /c """ & node & " launcher.js > ""data\sistema.log"" 2>&1""", 0, False
  ok = False
  For i = 1 To 60
    WScript.Sleep 500
    If Ligado() Then ok = True : Exit For
  Next
  If Not ok Then
    MsgBox "O sistema nao abriu. Veja o arquivo data\sistema.log na pasta do sistema." & vbCrLf & "Se for a primeira vez, rode Instalar.cmd.", 48, "Projecao Igreja"
    WScript.Quit 1
  End If
End If

' Janela de aplicativo do Edge (sem barra de endereco); se nao tiver Edge, abre no navegador padrao
On Error Resume Next
sh.Run "msedge --app=" & url & " --start-maximized", 1, False
If Err.Number <> 0 Then
  Err.Clear
  sh.Run url, 1, False
End If

Function Ligado()
  Dim x
  On Error Resume Next
  Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  x.setTimeouts 800, 800, 800, 800
  x.open "GET", url & "/api/auth/status", False
  x.send
  Ligado = (Err.Number = 0 And x.status = 200)
End Function
