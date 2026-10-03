-- Webposting: a small menu for the copy of webpost.ing on this Mac.
--
-- It does nothing by itself: each choice runs one of the repository's own
-- scripts in a Terminal window, so progress, errors and password prompts are
-- in plain sight. The repository's path is written in when the app is built
-- (tools/mac-app/build.sh).

property repoPath : "__REPO__"
property localSite : "http://localhost:5174"

on runInTerminal(command)
	tell application "Terminal"
		activate
		do script "cd " & quoted form of repoPath & " && " & command
	end tell
end runInTerminal

on siteIsUp()
	try
		do shell script "curl -fs -o /dev/null --max-time 2 " & localSite
		return true
	on error
		return false
	end try
end siteIsUp

on currentBuild()
	try
		return do shell script "cd " & quoted form of repoPath & " && git log -1 --format='%h  %s' | cut -c1-70"
	on error
		return "(could not read the repository at " & repoPath & ")"
	end try
end currentBuild

repeat
	set siteUp to siteIsUp()
	if siteUp then
		set viewChoice to "Open the local site"
		set siteStatus to "Running at " & localSite
	else
		set viewChoice to "Build and view locally"
		set siteStatus to "Not running"
	end if
	set choices to {viewChoice, "Rebuild and restart locally", "Stop the local site", "Deploy to webpost.ing…"}
	set picked to choose from list choices with title "Webposting" with prompt "Current build: " & currentBuild() & return & "Local site: " & siteStatus OK button name "Go" cancel button name "Quit"
	if picked is false then exit repeat
	set choice to item 1 of picked
	
	if choice is "Open the local site" then
		open location localSite
	else if choice is "Build and view locally" or choice is "Rebuild and restart locally" then
		runInTerminal("./tools/run-local.sh")
	else if choice is "Stop the local site" then
		do shell script "cd " & quoted form of repoPath & " && ./tools/run-local.sh stop"
	else if choice is "Deploy to webpost.ing…" then
		set answer to button returned of (display dialog "Deploy this build to the live site?" & return & return & currentBuild() & return & return & "This pushes main to GitHub, then tests, builds, uploads and installs it on the server. Terminal will ask for your SSH and sudo passwords." buttons {"Cancel", "Deploy"} default button "Cancel" cancel button "Cancel" with title "Webposting" with icon caution)
		if answer is "Deploy" then runInTerminal("./tools/deploy.sh")
	end if
end repeat
