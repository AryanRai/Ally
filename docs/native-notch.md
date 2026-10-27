# Native notch: current state and rebuild plan

Ally has two desktop surfaces: the **floating pill** (this repository's Electron app) and a **top-edge notch** that the pill docks into. Ally runs fully without the notch; every chat, agent, voice, Circle, drawing and device feature lives in the desktop app.

## Today

The notch currently runs through a **private local adapter**, kept in the `ally-study` git submodule (a private repository). It is not part of the public source and is not needed to build or run Ally. In a public clone the submodule stays empty: `build-ally.ps1` builds the desktop app only, and `start-ally.ps1` starts Ally as the floating pill.

What is already Ally's own code and lives in this repository:

- The pill ↔ notch coordinator (`glass-pip-chat/electron/surface/`): docking by dragging the pill to the top edge, `Ctrl+Shift+C` toggling, a greeting when docking, and live reply previews mirrored into the notch.
- The chat shown inside the notch, which reuses Ally's sidebar, search, messages and composer components.
- The shared chat selection, so the pill and the notch always show the same chat.

## Plan: an Ally-native notch

We are rebuilding the notch as part of Ally itself so the private adapter can be retired and everything can be public.

| Piece | Status |
| --- | --- |
| Chat inside the notch | Ally code today |
| Docking, toggle, greeting, live previews | Ally code today; will target the new notch window |
| Voice, Circle, screenshots, drawing board, approvals, phone and watch | Ally code today |
| Notch window: always-on-top top-edge strip, hover expansion and animation, multi-monitor placement, hidden from screen capture | To build (Electron or a small native window) |
| Drawing and speaking in step over the screen | Partly in place (visual tutor board); to extend |
| Background jobs, routines and 3D drawing in the notch | To rebuild or drop |

Done means: the notch opens from the pill and back with the same chat, hover and expansion feel smooth on mixed-DPI displays, voice and Circle work from it, and `ally-study` is no longer needed.
