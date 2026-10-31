# Interface implementation report

Owned files: src/ui.js, src/styles/ui.css, index.html. tokens.css preserved because current palette, type and chamfer tokens already match.

## Implemented
- Same live wordmark DOM traces/fills the chamfered B, wipes ANKSHOT, adds underline and moves from screen centre to its final title position. Font readiness precedes coordinate measurement. Intro settles at 3.5s; reduced version fades over 400ms.
- Global capture key/pointer skip consumes the trigger and shields pointerup/click/keyup. Intro skips resolve the same Promise and snap all visual states.
- Desktop two-column title with equal-width full menu; mobile stacked centred layout. B mark appears in favicon and masthead. Labelled ROOM/SHOTS/PAR/TRIES LEFT HUD, status, guide/restart/menu.
- Bounded virtual room list with 76px rows, overscan, future horizon extension, 40x26 thumbnails from actual generated geometry, disabled locked rows and persistent best letter rank.
- Stats modal with highest reached room, total S ranks, career accuracy/shots, S–D distribution; keyboard trap. No rank pips.
- Guide independent modal with inert underlying siblings, focus restore, six sections, CONFIG-derived physics values, looping SVG illustration, reduced motion, arrow/Home/End/1–6 navigation, Escape/X/backdrop closure. Sliding/resizing active/hover tab accent; six sections below 90 words each.
- Chapter cards at 1,11,21,31,41 with chapter labels and 1.8s promise (400ms reduced).
- Existing universal chamfer, sweep, +2px label, underline and press interactions retained. Focus-visible preserved; disabled buttons suppress hover; hover limited to mouse-capable inputs.

## API
`new UI(root,getRoom,store,action)`; getRoom receives one-based ID. Existing canvas/show/setLevel/setSettings/setInput/update/result/destroy remain.
`startIntro(): Promise<void>`; `introActive` boolean; `skipIntro()` set while intro active.
`showChapter(levelOrId): Promise<void>`; nonmilestone resolves immediately.
`openGuide()` / `closeGuide()`, `guideOpen` boolean. Closure marks guide seen and dispatches action `guide-close`; root owns game pause/resume.
Room action dataset.index and dataset.level are both one-based IDs.
`show('stats')` refreshes statistics; back action returns through root.

## Validation
JavaScript parsed successfully using vm.SourceTextModule through node_repl. Shell node command unavailable on PATH. Browser integration/visual QA delegated to root as agreed. Static checks found and corrected scoring text to match production S <= par, A <= par+1, B <= par+2.

## Notes
Guide does not use main phase itself. Its SVG animation is hidden under reduced motion. Thumbnail generation is restricted to visible + overscan rows, and relies on root getRoom cache. Horizon can grow indefinitely while mounted row count remains bounded.

## Integration follow-up corrections
- Chapter cards now run at every room `1 + 10k`, including 51 and beyond. The displayed chapter number is actual, padded to two digits; title stays MASTERY from chapter 5 onward.
- Accuracy consumes the store's 0–100 percent directly, preserving values such as 0.5%. Distribution now includes proportional orange bars plus counts and percentages.
- Virtual rows display ROOM, actual generated name, PAR and lock glyph; aria labels include name and par. Arrow Up/Down moves between unlocked rooms, Home/End reaches first/latest unlocked, and Tab/Shift+Tab continues across mounted boundaries. Re-render preserves focus when the focused room stays mounted. Ordinary Tab exits at the actual first/last unlocked room. Locked buttons remain outside the tab order. The scroll region itself is keyboard focusable for native scrolling.
- HUD references are cached once. Text, moving state, charging visibility and power only write when values change; update performs no DOM queries.
- Guide explains angle in = angle out and the full-room hazard reset including shots zero. Its only static divider is footer hairline; tabs use a separate moving accent, close control has no resting border/shadow.
- ui.js reformatted with installed TypeScript printer and multiline blocks. Parser diagnostics empty before formatting.
