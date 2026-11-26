' Fecha o sistema de projecao (servidor escondido).
Option Explicit
Dim x
On Error Resume Next
Set x = CreateObject("MSXML2.ServerXMLHTTP.6.0")
x.setTimeouts 1500, 1500, 1500, 1500
x.open "POST", "http://localhost:3000/api/system/quit", False
x.setRequestHeader "Content-Type", "application/json"
x.send "{}"
If Err.Number = 0 And x.status = 200 Then
  MsgBox "Sistema de projecao fechado.", 64, "Projecao Igreja"
Else
  MsgBox "O sistema ja estava fechado.", 64, "Projecao Igreja"
End If
