' Central de Eventos - roda o publicar.ps1 sem abrir janela.
' Usado pela tarefa agendada. Fica em %LOCALAPPDATA%\CentralEventos.
Option Explicit
Dim fso, sh, pasta, cmd
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & pasta & "\publicar.ps1"""
' 0 = janela oculta; True = espera terminar (evita execucoes sobrepostas)
sh.Run cmd, 0, True
