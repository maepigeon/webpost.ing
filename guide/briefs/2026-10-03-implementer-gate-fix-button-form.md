# implementer-gate-fix-button-form (Sonnet, `implementer`)

Two small fixes found by the visual tester (`guide/visual-test-2026-10-03.md`,
findings 1 and the last "smaller item"). These go on top of the frozen deploy
candidate, so keep the change as small as it can be.

## Your files (only these)
`client/src/components/Pages/Posts/PostRenderer/RichTextPost/ButtonNode.jsx`,
`client/src/test/ButtonNode.test.js` (or a new test file beside it), and the
Navbar file that decides whether the account menu shows (find it; say which).

## 1. The Button block's form closes while you type its address
Typing a web address closes the form after "https://e" and the rest of the
typing is lost. Cause, in `ButtonComponent`:
`const open = editable && (selected || Boolean(validateTarget(data.action, data.target)));`
The form is open only while the block is selected **or its target is not yet
valid**. Clicking into the address field deselects the block, so the form is
being held open only by the invalid target, and the moment the typed text
becomes a valid address the form closes under the typist.

Fix: opening and closing are events, not a derived value. The form opens when
the block is selected or is new (no valid target yet); once open it stays open
while focus is anywhere inside the block's form, and closes only when focus
leaves the form (and the target is valid), on Escape, or on its Done control
if it has one. A new block whose target is still invalid stays open as today.
Do not change what is saved or the node's shape.

Test that fails before and passes after: open the form on a new button, type
`https://example.com/page` one character at a time, and expect the form to be
open and the field to hold the whole address at the end. Also: Escape closes
it; clicking elsewhere in the post closes it; selecting the block again opens
it.

## 2. Account menu on the "session ended" sign-in screen
When a session has ended and the sign-in screen is shown, the top bar still
shows the account menu of the signed-out person. It must show what a
signed-out visitor sees. Find where the top bar reads the signed-in state and
why it is stale on that screen; fix it at the source of the state, not by
hiding the menu on one route. Test.

## Checks
`npx vitest run` in `client/`; eslint on your files. No commit, no
`vite build`, no servers. Report: cause as you found it, files, test counts,
what a checker must click.
