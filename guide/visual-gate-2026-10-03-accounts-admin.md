# Visual gate 2026-10-03: accounts and admin (`gate-accounts-admin`)

Site: http://localhost:5175 (build of 0bede03, placeholder sign-in keys). Account: `vt5`; admin part as `test`, one sign-in only (shared by both sizes). Sizes 1300x850 and 390x844 (touch).

Flow files: `tools/visual/flows/gate-accounts-auth.mjs`, `gate-accounts-settings.mjs`, `gate-accounts-admin.mjs`.
Run output: `tools/visual/out/gate-accounts/` (videos in `videos/`, captures in `<flow>/`, frame sheets in `videos/<flow>-<size>-frames/sheet.png`; copies of the clips: scratchpad `visual/gate-accounts-admin/<flow>-1300.webm` and `-390.webm`).
New baselines saved (first capture, nothing to compare): `tools/visual/baselines/gate-accounts-{auth,settings,admin}/`.

Nothing was changed on the site: no account created, no password changed, no setting toggled, no "Run now", no Save, no delete submitted, no provider clicked. The wrong-password tries show up in vt5's Security activity as "Wrong password tried", as expected.

## Verdicts

| Flow | Verdict | Evidence |
|---|---|---|
| Sign-in page, signed out (the "or" line, Google / Microsoft buttons) | FAIL (minor) | `out/gate-accounts/gate-accounts-auth/signin-desktop.png`, `signin-phone.png` |
| Sign-up page, signed out | FAIL (minor, same cause) | `.../signup-desktop.png`, `signup-phone.png` |
| `?sso=exists`, `?sso=failed`, `?sso=cancelled` | PASS | `.../sso-exists-*.png`, `sso-failed-*`, `sso-cancelled-*` |
| `/routes/ChooseUsername` with nothing waiting | PASS | `.../chooseusername-*.png` |
| Wrong password, then right password (vt5) | PASS | `.../wrong-result-*` (+ `-sheet.png`), `signed-in-*.png`; clip `videos/gate-accounts-auth-{desktop,phone}.webm` |
| Forgot-password page | PASS (with the known paragraph) | `.../forgot-*.png` |
| Settings: every section opened | FAIL (two findings) | `out/gate-accounts/gate-accounts-settings/open-*`, `raw-*` (no masks), `tabfocus-desktop.png`; clip `videos/gate-accounts-settings-*.webm` |
| Settings: Sign-in methods, Link with wrong password | PASS | `.../signin-link-wrong-*` |
| Settings: change password, wrong current password | PASS | `.../password-wrong-*` |
| Settings: Security activity | PASS | `.../open-security-*`, `raw-security-desktop.png` |
| Settings: delete-account form opened, not submitted | PASS (faint disabled button noted) | `.../raw-delete-account-desktop.png`, `delete-typed-*` |
| Admin: tabs | PASS | `out/gate-accounts/gate-accounts-admin/tab-*-desktop.png`, `-phone.png` |
| Admin: sign-up switches (read only) | PASS | `tab-settings-*.png` |
| Admin: Stats "Card previews" line | FAIL | `tab-stats-desktop.png`, `tab-stats-phone.png` |
| Admin: fields inside cards at 390 | FAIL | `tab-limits-phone.png`, `tab-users-phone.png` |

## What I saw

**Sign-in and sign-up.** The "or" line is a quiet hairline with a small grey "or". Both "Continue with Google / Microsoft" buttons are grey (fill rgb 243, border rgb 181, text rgb 28, marks in the text colour), full width, same font as the page, no brand colour, at both sizes. Fail: the buttons are 48px tall and the main button (Sign in / Create account) is 46px, at both sizes. The CSS asks for `min-height: 46px` on both, but the provider mark plus `padding: 11px 13px` and the 1.5px border push the link to 48. Fix: `client/src/components/Pages/Auth/Login/Login.css`, `.login-sso-btn` (about line 296), e.g. `height: 46px` or less padding. The main button also looks mid-grey (rgb 116) with its soft glow while the provider buttons are lighter, which reads as intended (primary vs secondary). No sideways scroll.

**SSO lines.** Each shows exactly one quiet grey line above the form: "An account with this email exists. Sign in with your password, then link this provider in Settings." / "That sign-in did not finish. Try again." / "Sign-in was cancelled." Phone and desktop alike. ChooseUsername with nothing waiting says "That sign-in ran out. Start again." with a "Back to sign in" link. Good.

**Wrong then right password.** "Incorrect username or password." in a grey box with a dark left bar, fields keep their text, no sign-out, no jump. The right password lands on `/vt5`. A mouse click on Sign in leaves no ring (outline none).

**Forgot-password.** Calm, same card, but it carries a two-line explanatory paragraph ("Enter the email address on your account and we will send you a link ... good for one hour"). That is the "no explanatory paragraphs" rule; the Settings paragraphs are already on the known list, this one is not.

**Settings.** All 8 sections (Email, Password, Sign-in methods, Security, App, Site background, Code blocks, Delete account) start collapsed and open and fold without a sideways scroll at both sizes. Sign-in methods rows are Password (Set), Google (Not linked, Link), Microsoft (Not linked, Link); Link plus a wrong password shows "That password is not right." in red, the page stays on /settings and still signed in after a reload (checked at both sizes). Change password with a wrong current password shows "Your current password is not right." and stays signed in; the mismatch line and the checklist behave. Delete account form: the "Delete my account" button stays disabled and I did not submit. Findings:
1. Font leak: the small "i" button in the Email section (`.settings-info-btn`) is in Georgia; every other control I measured (14 per section) is system-ui, the top bar's font. Likely `SettingsPage.css`.
2. Keyboard focus: Tab onto a section heading (`summary.settings-section-title`) draws the browser's default blue ring (outline auto, rgb 0,95,204, see `tabfocus-desktop.png`), not the grey ring the other controls use. Mouse clicks leave no ring on any heading. The grey ring rule is in `client/src/index.css` (only `button:focus-visible` is covered); `summary` needs the same.
3. Minor: the disabled "Delete my account" button is almost invisible (white text on near-white). Fine when disabled but worth a look.
(The "Site background" and Security lists are painted black in the compared captures because of the recorder's masks; the `raw-*.png` files are unmasked and look right.)

**Admin panel (one sign-in as test).** Eight tabs: Users, Reports, Stats, Limits, Flagged, Import, Security, Settings. The selected tab is a dark plate (rgb 28) with white text, the others light grey with black text, all in the app font, at both sizes; a Tab-key ring shows on tab buttons. On Settings the sign-up switches read: "Invite code needed to sign up" On, "Confirm email before posting" Off (not changed); the switch cards sit inside their card at both sizes. Failures:
1. Stats "Card previews: up to date" is bare text on the dotted wallpaper (no backing), and so are the "Orphaned uploads are files ..." line and the Limits tab's hint line ("Set default limits ..."); the dots run through the letters. Rule 7: anything on the wallpaper gets its own solid backing. Files: `client/src/components/Pages/Auth/AdminPanel/PreviewLine.jsx` and `AdminPanel.css`.
2. At 390px the Limits table runs off the card: the Save buttons are clipped to "Sa"; the Users table is clipped at the right as well (the "Uploads"-style last column shows "U"). The page itself does not scroll sideways, so the table is simply cut off. Also the Users table uses the browser's own select for the role (rule 7 against browser-default controls). The Create User card and the Sign-ups card fit.
3. Not mine to fix but visible: "Live build: unknown / Update check is off." at the top of every tab.

## Font and focus summary
Fonts measured on the sign-in, sign-up, Settings sections and admin tabs: all system-ui except the Email "i" button (Georgia). Mouse click: no ring on Sign in or the section headings. Tab: grey/black ring on top-bar pills and admin tabs; blue default ring on Settings section headings (fail).

## Three things most worth the owner's attention
1. Admin panel at 390px: Limits (and Users) tables are cut off at the right edge, Save buttons unreachable.
2. Admin Stats / Limits text lines sit straight on the wallpaper with no backing.
3. Settings section headings show the default blue focus ring on Tab; the Email "i" is in Georgia; the provider buttons are 2px taller than the main button.

Area ready for Mae: no
