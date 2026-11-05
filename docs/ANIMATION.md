# Animation reference

Read this before any story that touches **touch feedback, gestures, transitions or animation**.
It is a list of 20 motion rules. Each one is the rule in bold, followed by what it means here.

Jim animates with plain CSS (keyframes and transitions in `apps/web/app/globals.css`) and has no
motion library. Rules that name a library feature (item 20's `layoutId`) give the CSS way to get
the same effect. These rules sit on top of `docs/PWA.md` §7, which still applies: reuse the existing
classes (`.page-fade`, `.route-fade`, `.sheet-backdrop`/`.sheet-panel`), animate opacity and
transform, keep transitions short, and respect `prefers-reduced-motion` on every animation.

## Timing and easing

1. **Ease-out for entrances.** Something arriving starts fast and slows into place, so it feels
   responsive straight away. Use `ease-out` (or a stronger curve like
   `cubic-bezier(0.23, 1, 0.32, 1)`) for anything appearing on screen.
2. **Dropdowns at 150–250ms.** Menus, dropdowns and popovers open in 150–250ms. Shorter reads as
   a snap, longer feels slow for something opened many times a day.
3. **Stagger list rows by 30ms.** When a list animates in, delay each row 30ms after the one
   above it. Cap the stagger (roughly the first 8–10 rows) so a long list doesn't take seconds.
4. **Scale to 0.97 on press.** A pressed button or card scales to `0.97` while held, so the tap
   feels physical. This is on top of the existing tap ripple, not instead of it.
5. **Stretch moving knobs 12%.** A knob that slides (a switch thumb, a slider handle) stretches
   about 12% along its direction of travel while moving, then settles back to its normal shape.
6. **Stagger as details settle.** When a view changes, the main element moves first and its
   details (labels, numbers, secondary text) settle in just after, a short stagger rather than all
   at once.
7. **Arcs for object movement.** An object travelling from one place to another follows a slight
   arc rather than a dead-straight line, as real things do.
8. **Pulse to confirm success.** Confirm a completed action (a logged set, a saved item) with one
   quick scale pulse on the thing that changed. One pulse, not a loop.
9. **Ease-in-out for moves.** Something already on screen moving to a new position accelerates
   and decelerates: use `ease-in-out`. Ease-out is for entrances (rule 1), not moves.

## Popovers and overlays

10. **Start popovers at 0.95.** A popover enters from `scale(0.95)` plus opacity 0, not from
    `scale(0)`. Growing from nothing looks unnatural.
11. **Enter from the trigger.** Set `transform-origin` to the side of the element that opened it,
    so a popover grows out of its button rather than from its own centre.
12. **Exit to the trigger.** On close, it shrinks back towards that same origin, so the user
    sees where it went.
13. **No bounce on everyday UI.** No overshoot or springy bounce on menus, sheets, buttons or
    anything used constantly. Save bounce for rare, celebratory moments.
14. **Don't tween while held.** While a finger is dragging something (a sheet, a slider, a
    reorder handle), it tracks the finger 1:1 with no transition. Animate only after release.
15. **Make exits 20% shorter.** An exit runs about 20% faster than its entrance (e.g. 200ms in,
    160ms out). Once the user has dismissed something, they've moved on.

## State changes

16. **Overlap old & new states.** When one state replaces another, start the new one entering
    before the old one has finished leaving, rather than running them back-to-back with a gap.
17. **Masks for reveals & colour.** Reveal content or sweep a colour change with a mask or
    `clip-path` animation, not by animating size or layout.
18. **Crossfade icons + blur.** Swap one icon for another (play to pause, heart to filled heart)
    with a crossfade plus a small blur (a few px) and slight scale on the outgoing and incoming
    icons, rather than a hard swap. `filter: blur()` is the one exception to "opacity and transform
    only": keep it on small icons, never on large areas.
19. **Rubber band past bounds.** Dragging past the end of something (a sheet beyond its top, a
    list beyond its edge) keeps moving but with growing resistance, then springs back on release.
    Never stop dead at the edge.
20. **Reuse the same layoutId.** When one element turns into another (a tab indicator moving
    between tabs, a card expanding into a detail view), treat it as the same element moving, not
    one disappearing and another appearing. In Motion this is a shared `layoutId`. In Jim's plain
    CSS, keep a single element and move it with `transform`, or give both ends the same
    `view-transition-name` with the View Transitions API.

## Reduced motion

Every rule above is skipped under `prefers-reduced-motion: reduce`. Replace movement with an
instant change or a plain short fade, and make sure anything waiting on `animationend` still
completes when no animation runs (see `docs/PWA.md` §7).
