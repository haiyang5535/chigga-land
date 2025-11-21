This is the **"Nuclear Option" Prompt**. We are going to stop relying on dynamic math for the ports (since it keeps failing) and switch to a **Hardcoded Offset System** which is impossible to mess up. We will also explicitly fix the mouse coordinate math.

**Copy and paste this to your AI Agent:**

````text
We are doing a "Hard Fix" pass. The previous math-based approaches for ports and mouse coordinates are failing. We will switch to absolute/hardcoded logic to guarantee it works.

Please use the file edit tool to modify `client.js`, `index.html`, and `style.css`.

### TASK 1: THE "HARDCODED" PORT FIX (Stop calculating angles)
The dynamic math is placing ports on land. We will manually define the "Push Direction" for each port.

1. **Replace `PORT_LOCATIONS`** in `client.js` with this exact data structure (assuming standard Catan layout):
   ```javascript
   const PORT_DATA = [
     { q: -1, r: -2, type: "Generic", vec: { x: 0, y: -1 } },  // Top Left -> Push Up
     { q: 1, r: -3, type: "Sheep",   vec: { x: 1, y: -1 } },   // Top Right -> Push Up-Right
     { q: 3, r: -3, type: "Generic", vec: { x: 1, y: 0 } },    // Right -> Push Right
     { q: 3, r: -1, type: "Generic", vec: { x: 1, y: 1 } },    // Bottom Right
     { q: 2, r: 1,  type: "Brick",   vec: { x: 0, y: 1 } },    // Bottom
     { q: 0, r: 2,  type: "Wood",    vec: { x: -1, y: 1 } },   // Bottom Left
     { q: -2, r: 1, type: "Generic", vec: { x: -1, y: 0 } },   // Left
     { q: -3, r: 0, type: "Wheat",   vec: { x: -1, y: -1 } },  // Top Left
     { q: -3, r: -2, type: "Ore",    vec: { x: 0, y: -1 } }    // Top
   ];
````

2.  **Update `drawPorts`:**
    - Iterate `PORT_DATA`.
    - Get Hex Center `(hcx, hcy)` using `hexToPixel(p.q, p.r)`.
    - **Dock Position:** `dockX = hcx + (p.vec.x * HEX_SIZE * 1.8)`; `dockY = hcy + (p.vec.y * HEX_SIZE * 1.8)`.
    - **Draw:** Thick brown line from Hex Center (clamped to edge) to Dock. Large White Circle at Dock.

### TASK 2: FIX MOUSE DESYNC (The Inverse Camera)

The mouse "snapping" is broken because you are checking raw screen coordinates against game coordinates.

1.  **Create Helper:** `screenToWorld(screenX, screenY)` in `client.js`.
    ```javascript
    function screenToWorld(sx, sy) {
      // 1. Center Offset
      let x = sx - canvas.width / 2;
      let y = sy - canvas.height / 2;
      // 2. Un-Zoom
      x /= camera.zoom;
      y /= camera.zoom;
      // 3. Un-Pan
      x -= camera.x;
      y -= camera.y;
      // 4. Restore Center
      return { x: x + canvas.width / 2, y: y + canvas.height / 2 };
    }
    ```
2.  **Apply:** In `canvas.addEventListener('mousemove')` and `'click'`:
    - FIRST line: `const worldPos = screenToWorld(e.clientX, e.clientY);`
    - Use `worldPos.x` and `worldPos.y` for ALL `getNearestVertex` and `buildNode` logic.

### TASK 3: VISIBLE TRADING SIDEBAR

The trading area is likely hidden. Force it to be visible.

1.  **HTML (`index.html`):**
    - Add this directly inside `<div id="app">`:
      `<div id="trade-sidebar" class="hud-panel"><h3>Active Trades</h3><div id="trade-feed"></div></div>`
2.  **CSS (`style.css`):**
    ```css
    #trade-sidebar {
      position: absolute;
      top: 100px;
      right: 20px;
      width: 220px;
      min-height: 100px;
      z-index: 500; /* Ensure it's on top */
      background: rgba(0, 0, 0, 0.8);
      pointer-events: auto;
    }
    .trade-item {
      border-bottom: 1px solid #555;
      padding: 5px;
      font-size: 12px;
    }
    ```

### TASK 4: BIGGER RESOURCE ICONS

1.  **Update `drawHex` in `client.js`:**
    - Change the font size logic.
    - `ctx.font = '40px Arial';` (Make it huge).
    - `ctx.fillText(ICON_MAP[hex.resource], center.x, center.y - 10);`
    - Draw the white number circle _on top_ of this large icon (at `center.y + 15`).

Please apply these fixes. The "Hardcoded Ports" and "screenToWorld" function are critical.

```

```
