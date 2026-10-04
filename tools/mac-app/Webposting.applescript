-- Webposting: a small menu for the copies of webpost.ing and webpaint.ing on
-- this Mac.
--
-- It does nothing by itself: each choice runs one of a repository's own
-- scripts in a Terminal window, so progress, errors and password prompts are
-- in plain sight. One app serves both sites: the title names the site in
-- hand, every row acts on that site only, and the last row switches. The
-- repositories' paths are written in when the app is built
-- (tools/mac-app/build.sh; the webpaint.ing one only with --webpaint, and
-- without it there is no switch row).
--
-- The labels and commands are the same as the action table of tools/menu.mjs
-- (node tools/menu.mjs --actions), which is the menu for Windows and Linux.

property repoPath : "__REPO__"
property paintPath : "__WEBPAINT__"
property prefsDomain : "ing.webpost.menu"

-- The two sites. Both repositories have ./tools/run-local.sh (with "stop")
-- and ./tools/deploy.sh, which behave alike; only webpost.ing has backups.
on siteInfo(siteKey)
	if siteKey is "webpaint" then
		return {siteName:"webpaint.ing", repo:paintPath, localSite:"http://localhost:5184", hasBackups:false, otherKey:"webpost", otherName:"webpost.ing"}
	end if
	return {siteName:"webpost.ing", repo:repoPath, localSite:"http://localhost:5174", hasBackups:true, otherKey:"webpaint", otherName:"webpaint.ing"}
end siteInfo

on hasPaint()
	return paintPath is not ""
end hasPaint

-- The site chosen last time, so the app opens where it was left.
on rememberedSite()
	if not hasPaint() then return "webpost"
	try
		set saved to do shell script "defaults read " & prefsDomain & " site"
		if saved is "webpaint" then return "webpaint"
	end try
	return "webpost"
end rememberedSite

on rememberSite(siteKey)
	try
		do shell script "defaults write " & prefsDomain & " site " & quoted form of siteKey
	end try
end rememberSite

on fileExists(posixPath)
	try
		do shell script "test -e " & quoted form of posixPath
		return true
	on error
		return false
	end try
end fileExists

-- Opens a Terminal window running `command` in a repository. It is handed
-- to Terminal as a small .command file with `open`, not through an Apple
-- event: `tell application "Terminal" to do script` waits for Terminal to
-- answer, and timed out ("AppleEvent timed out") when Terminal was slow to
-- start or was asking for permission.
on runInTerminal(repo, command)
	set scriptFile to do shell script "mktemp -t webposting"
	set scriptFile to scriptFile & ".command"
	do shell script "printf '%s\\n' '#!/bin/bash' " & quoted form of ("cd " & quoted form of repo & " && " & command) & " > " & quoted form of scriptFile & " && chmod +x " & quoted form of scriptFile & " && open -a Terminal " & quoted form of scriptFile
end runInTerminal

on siteIsUp(localSite)
	try
		do shell script "curl -fs -o /dev/null --max-time 2 " & localSite
		return true
	on error
		return false
	end try
end siteIsUp

on currentBuild(repo)
	try
		return do shell script "cd " & quoted form of repo & " && git log -1 --format='%h  %s' | cut -c1-70"
	on error
		return "(could not read the repository at " & repo & ")"
	end try
end currentBuild

set siteKey to rememberedSite()

repeat
	set site to siteInfo(siteKey)
	set repo to repo of site
	set siteName to siteName of site
	set localSite to localSite of site
	
	if siteIsUp(localSite) then
		set viewChoice to "Open the local site"
		set siteStatus to "Running at " & localSite
	else
		set viewChoice to "Build and view locally"
		set siteStatus to "Not running"
	end if
	set deployChoice to "Deploy to " & siteName & "…"
	set choices to {viewChoice, "Rebuild and restart locally", "Stop the local site", deployChoice}
	
	-- Backups are webpost.ing's. A checkout from before the script existed
	-- says so in the row instead of offering a button that does nothing.
	set backupChoice to "Download a backup"
	set backupListChoice to "List server backups"
	set backupsMissing to false
	if hasBackups of site then
		if not fileExists(repo & "/tools/download-backup.sh") then
			set backupsMissing to true
			set backupChoice to "Download a backup (not available in this checkout)"
			set backupListChoice to "List server backups (not available in this checkout)"
		end if
		set choices to choices & {backupChoice, backupListChoice}
	end if
	
	set switchChoice to "Switch to " & (otherName of site)
	if hasPaint() then set choices to choices & {switchChoice}
	
	set windowTitle to "Webposting"
	if hasPaint() then set windowTitle to "Webposting — " & siteName
	set picked to choose from list choices with title windowTitle with prompt "Current build: " & currentBuild(repo) & return & "Local site: " & siteStatus OK button name "Go" cancel button name "Quit"
	if picked is false then exit repeat
	set choice to item 1 of picked
	
	if choice is "Open the local site" then
		open location localSite
	else if choice is "Build and view locally" or choice is "Rebuild and restart locally" then
		runInTerminal(repo, "./tools/run-local.sh")
	else if choice is "Stop the local site" then
		do shell script "cd " & quoted form of repo & " && ./tools/run-local.sh stop"
	else if choice is deployChoice then
		-- The site is named in words here, so the wrong one is not deployed by habit.
		set answer to button returned of (display dialog "Deploy this build to " & siteName & ", the live site?" & return & return & currentBuild(repo) & return & return & "This pushes main to GitHub, then logs in to the server and updates " & siteName & ". A Terminal window opens and asks for your server password. The first time, it also asks where the server is." buttons {"Cancel", "Deploy to " & siteName} default button "Cancel" cancel button "Cancel" with title windowTitle with icon caution)
		if answer is not "Cancel" then runInTerminal(repo, "./tools/deploy.sh")
	else if choice is backupChoice or choice is backupListChoice then
		if backupsMissing then
			display dialog "This checkout has no tools/download-backup.sh. Pull the latest webpost.ing, then try again." buttons {"OK"} default button "OK" with title windowTitle
		else if choice is backupChoice then
			runInTerminal(repo, "./tools/download-backup.sh")
		else
			runInTerminal(repo, "./tools/download-backup.sh --list")
		end if
	else if choice is switchChoice then
		set other to siteInfo(otherKey of site)
		if fileExists((repo of other) & "/tools/run-local.sh") then
			set siteKey to otherKey of site
			rememberSite(siteKey)
		else
			display dialog "There is no " & (siteName of other) & " checkout with tools/run-local.sh at:" & return & (repo of other) & return & return & "Build this app again with the right path (tools/mac-app/build.sh)." buttons {"OK"} default button "OK" with title windowTitle
		end if
	end if
end repeat
