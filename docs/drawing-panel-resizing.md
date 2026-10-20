# Resize a drawing

Drag any edge or corner of the Drawing panel to make it larger or smaller.
The bottom-right corner has a visible grip. The diagram uses the available width
and height, and the panel stays within the screen with room for its controls.
The heading still moves the panel.

Keyboard users can focus a resize edge and use arrow keys; Shift uses a larger
increment. Resizing retains the iframe, so interactive controls retain their state.
The selected size survives live updates and step changes in the same board;
a new board starts at its normal automatic size.

The overlay's eight handles use pointer capture, including across the iframe.
Release, cancellation and lost capture return mouse interaction to its ordinary
hover behavior. The diagram sandbox, drawing coordinates, agent placement inputs
and native window size are unchanged.

Validation: 18 focused unit checks, TypeScript and Vite pass. The native synthetic
Chromium fixture drags edges/corners, verifies the iframe grows, retains its slider
state and sandbox, and keeps the chosen size after a board update:

```powershell
# Unset ELECTRON_RUN_AS_NODE first.
.\node_modules\electron\dist\electron.exe scripts/check-drawing-resize.mjs
```

The current drawing renderer was updated in the existing desktop process, with
its board ID, revision, step count, sketches and selection verified unchanged.
An in-memory redirect also updates newly opened drawing surfaces in that process.
The next-launch candidate is `../.ally-drawing-resize-20261020/glass-pip-chat`,
which also includes the composer storage fix. Older frozen builds are untouched.
