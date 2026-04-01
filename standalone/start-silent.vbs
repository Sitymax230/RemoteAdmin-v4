Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
' Launch agent.js hidden (no console window)
WshShell.Run "remoteadmin-agent-win.exe --server ws://YOUR_SERVER:3000/ws/agent", 0, False
