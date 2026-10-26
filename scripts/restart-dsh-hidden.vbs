' Run restart-dsh.ps1 without opening a console window.
' Scheduled Task uses: wscript.exe //B "<path>\restart-dsh-hidden.vbs"
Dim fso, shell, base, script
Set fso = CreateObject("Scripting.FileSystemObject")
base = fso.GetParentFolderName(WScript.ScriptFullName)
script = fso.BuildPath(base, "restart-dsh.ps1")
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & script & """ -Force", 0, False
