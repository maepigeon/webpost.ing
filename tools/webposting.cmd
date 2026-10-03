@echo off
rem Webposting menu for Windows. Double-click it, or run it from a terminal:
rem   tools\webposting.cmd            the menu
rem   tools\webposting.cmd deploy     one action: see node tools\menu.mjs --help
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 goto nonode
node tools\menu.mjs %*
set CODE=%errorlevel%
goto end
:nonode
echo Node.js is not installed. Install Node 20.19 or newer from https://nodejs.org and run this again.
set CODE=1
:end
rem Keep the window open when it was double-clicked.
if "%~1"=="" pause
exit /b %CODE%
