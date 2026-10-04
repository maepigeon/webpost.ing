# Design rules — what Mae wants and does not want

Collected from her own feedback across the sessions (dates are when she said
it). This is the standard every screen is held to. When she gives new
feedback, add it here the same day, in her words where possible. The
`design-guardian` agent enforces this file.

## Always

1. **Grayscale app chrome.** Black, white, greys. No colour accents in the
   app's own interface (top bar, Settings, Messages, dialogs, tool panels).
   Colour belongs to people's content and themes.
2. **Tactile, springy controls.** Buttons look pressable and give a little
   when pressed.
3. **One font for the app.** "I want font consistency except in user profiles
   and posts" (the font is the top bar's, `var(--app-font)`). Every control,
   field, tab, status line, dialog and message in the app uses it. Only a
   profile's or post's own content uses that page's theme fonts.
4. **The editor looks like the post.** "when editing posts id like it if it
   were as close to how it will actually look, theming-wise as you can make
   it." The post's title, text and card wear its theme while editing; the
   controls around them stay in the app font.
5. **Grids speak one design language.** The grid editor and the post
   editor's tool panels are dark panels of pixel buttons (`GridButton`), pixel
   text and symbols from the Basics pack; dropdowns and number steppers are
   the grid kind, not the browser's; white means "on". Sections fold one by
   one. Icon-only buttons have a hover label that also shows on touch.
6. **Clear, consistent icons.** One icon means one thing (the heart is
   reactions; stickers are a star). The same action has the same name
   everywhere ("Publish", not "Upload").
7. **Readable on any theme.** "make sure contrast is maintained ... even with
   dark, light, or weird color selected by user." Anything drawn on a themed
   card takes its colours from the theme variables; anything on the wallpaper
   gets its own solid backing. Post titles and links must never vanish.
8. **Edit things where they are.** The banner is edited on the profile; "Set
   profile picture" sits under the picture; pinning lives in the profile's
   arrange view. Don't send people to a settings page for something they can
   see in front of them.
9. **Things line up and have room.** No element flush against a card's edge
   (padding under a grid); related buttons share one row and one style;
   popovers stay inside the window and never hide behind a header; stickers
   never cover content.
10. **Plain words.** Short labels, short hints, in everyday language.
11. **Settings fold away.** Every Settings section starts collapsed; longer
    explanations live behind an "i".
12. **Pixels stay pixels.** Text and images inside grids are drawn at the
    grid's own resolution (16×16 per tile).
13. **It works on a phone.** No sideways scrolling; touch targets about 40px.

## Never

1. **No glass or blur panels.** "NO glass card panels."
2. **Never rotate or tilt posts.**
3. **No emojis in the interface.** (Reaction emojis are content and stay.)
4. **No floating notes over controls.** "i dont like these kinds of notes
   Description / Goes in. they are bad design." A field explains itself with
   its placeholder; labels needed for screen readers are visually hidden.
5. **No explanatory paragraphs on the page.** She has asked to remove them
   every time ("remove this text Drag the grip...", "remove this text The top
   of your profile is a tile grid..."). No banner-style info boxes ("i dont
   like these info areas"); put what must be said behind an "i".
6. **No raw counts glued to labels, no stacks of stray boxes.** The first
   profile tabs ("Posts4 Notes0", three separate floating boxes) were
   "really hideous". One control, one panel, counts small and hidden at zero.
7. **No browser-default controls** where the app has its own: no system
   colour dialog, no native selects inside tool panels.
8. **No "slop".** Vague questions, filler text, half-working buttons, a
   prompt that accepts nonsense. If something asks the user a question, it is
   specific, gives an example and checks the answer.
9. **Don't replace a screen she likes without showing her first.** The home
   page redesign of 2026-10-03 was reverted: "WOAH I dont like the new
   homepage. bring back the old one."
10. **No ugly default buttons.** Edit/Delete as plain boxes were "kinda
    ugly": quiet pills, with Delete visibly different from Edit.
11. **No fonts or colours hard-coded on themed surfaces**, and no theme fonts
    leaking into app controls.

## Themes she likes, and why

- **Corkboard** is "the only appealing one" of the first set: a real texture,
  typed notes, a pin. Themes should have that much character: a textured
  page, a card that belongs on it, fonts that fit. Cork itself should be even
  (no large light and dark clouds).
- Better fonts matter: Neon Terminal and Sticky Pad were "kinda ugly ...
  because of ugly fonts".
- The paw pattern is staggered half a step on alternate rows.

## How to judge a new screen

Put it beside the nearest screen she already accepts. Is it as calm? Are the
controls the same family as their neighbours? Could any text be removed? Does
anything look like a web form from a framework's defaults? Would it still
read on a black card and on a pink one? If in doubt, it is not ready.
