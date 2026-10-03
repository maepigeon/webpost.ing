# Webposting menu for Windows PowerShell (right-click, Run with PowerShell; or
# tools\webposting.cmd, which can be double-clicked).
#   .\tools\webposting.ps1            the menu
#   .\tools\webposting.ps1 deploy     one action: see node tools\menu.mjs --help
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host 'Node.js is not installed. Install Node 20.19 or newer from https://nodejs.org and run this again.'
    $code = 1
} else {
    & node tools/menu.mjs @args
    $code = $LASTEXITCODE
}
# Keep the window open when it was started without an action.
if ($args.Count -eq 0) { Read-Host 'Press Enter to close' | Out-Null }
exit $code
