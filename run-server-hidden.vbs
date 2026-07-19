Set objShell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
serverDir = scriptDir & "apps\server"
objShell.Run "cmd /c cd /d """ & serverDir & """ && npx tsx src\server.ts", 0, False
