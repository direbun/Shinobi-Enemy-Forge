$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root
& "C:\Users\Dire\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" -m http.server 4174 --bind 127.0.0.1
