Chigga Land v3.2 - Master Design & Production Specification

1. Visual Architecture (Modern Web Design)

Layout Strategy: "Immersive HUD".

Canvas: 100vw / 100vh (Full Screen background).

UI: Floating HTML overlays with backdrop-filter: blur(10px) (Glassmorphism).

Color Palette:

Water: Deep Ocean Blue (#4b91c8).

UI Panels: Semi-transparent Dark (rgba(20, 20, 35, 0.85)).

Text: White/Off-White.

Accents: Gold (VP), Green (Success), Red (Error/Robber).

2. The Port Rendering Fix (Vector Math)

The Problem: Current ports look like floating blobs.

The Fix:

Identify the Edge Midpoint $(Mx, My)$ of the coastal edge.

Identify the Hex Center $(Cx, Cy)$.

Calculate the Outward Vector $(Vx, Vy) = (Mx - Cx, My - Cy)$.

Normalize $(Vx, Vy)$ and scale it by HEX_SIZE * 0.6.

Dock Point $(Dx, Dy) = (Mx + Vx, My + Vy)$.

Draw:

Stick: Thick Brown Line (Width 5px) from $(Mx, My)$ to $(Dx, Dy)$.

Platform: Circle at $(Dx, Dy)$.

Label: Rotate text to match the angle of the edge (optional) or keep horizontal inside the platform.

3. UI Components (The "Missing" Features)

3.1 Top Bar (Global State)

Left: "Chigga Land" Logo.

Center: Victory Point Bar (e.g., "6 / 10 VP").

Right: Player List (Avatars + Names + Card Count + Army Size).

Crucial: You must see how many cards opponents have.

3.2 Bottom Bar (The Player Hand)

Resource Cards: Instead of text "Wood: 4", render 5 distinct Card Elements that animate/pop up on hover.

[Wood Icon] [Brick Icon] [Sheep Icon] [Wheat Icon] [Ore Icon].

Badge shows count (e.g., "x4").

Dev Cards: Separate stack for Knights/Monopoly/etc.

3.3 Right Action Panel (Controls)

Dice Button: Large, prominent button. Shake animation on click.

Build Menu: Vertical row of circular icons:

[Road Icon] (Hover shows cost: 1 Wood, 1 Brick)

[House Icon] (Settlement)

[Castle Icon] (City)

[Card Icon] (Buy Dev Card)

Trade Button: Opens the Trade Modal.

3.4 Left Panel (Game Log)

Scrollable chat box.

Rich Text: "Player Red rolled a 6." (Color coded).

4. Mechanics Integration (From v3.1)

Limits: Enforce 5 Settlements, 4 Cities, 15 Roads.

Robber: Spawn on Desert.

Longest Road/Largest Army: Auto-calculate and show icons next to Player Name in Top Bar.

5. CSS Framework

No external heavy framework (React/Vue) needed.

Use CSS Grid/Flexbox for layout.

Use CSS Variables for colors.

Use pointer-events: none on the container overlay so clicks pass through to the Canvas, but pointer-events: auto on the buttons.


***

### **Step 2: The Execution Prompts**

Give these prompts to your AI agent in order.

#### **Prompt 1: The Port Fix (Rendering Engine)**
This fixes the "blobs" in the water.

```text
I have updated the plan to v3.2. First, let's fix the ugly port rendering.

Please read Section 2 of `v3.2_master_plan.md`.

Using the file edit tool, modify `client.js` inside the `renderBoard` (or `drawPort`) function:
1. Instead of drawing the port text directly on the hex edge, calculate a "Dock Point".
2. MATH:
   - Get Hex Center (cx, cy) and Edge Center (ex, ey).
   - Vector V = (ex - cx, ey - cy).
   - New Point (dx, dy) = (ex + V.x * 0.6, ey + V.y * 0.6).
3. DRAW:
   - `ctx.moveTo(ex, ey)`, `ctx.lineTo(dx, dy)` (Thick brown line).
   - Draw a white circle at (dx, dy) with a brown border.
   - Draw the port text (e.g., "3:1") centered at (dx, dy).
   - Ensure the text color contrasts well with the white circle.


Prompt 2: Modern UI Refactor (HTML/CSS)

This transforms the look from "Dev Art" to "Modern Web App".

Now let's implement the Modern UI defined in Section 1 and 3 of `v3.2_master_plan.md`.

Please use the file edit tool to completely replace the body content of `index.html` and update `style.css`.

1. LAYOUT CHANGE:
   - Make the `<canvas>` fill the entire screen (position: fixed, top: 0, left: 0, z-index: 0).
   - Create a `id="ui-layer"` div that sits on top (z-index: 1).

2. NEW COMPONENTS (HTML):
   - **Top Bar:** `<div id="top-bar">` with Logo, VP Counter, and Player List.
   - **Bottom Bar:** `<div id="hand-container">` for resource cards.
   - **Action Menu:** `<div id="build-menu">` (floating right side) with icons for Road, Settlement, City, Dev Card.
   - **Game Log:** `<div id="game-log">` (floating bottom left, semi-transparent).

3. STYLING (CSS):
   - Use a "Glassmorphism" look: `background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(5px); border-radius: 12px;`.
   - Use a nice sans-serif font (system-ui or Roboto).
   - Make buttons look like modern "pills" or circles with hover effects.

4. CLEANUP:
   - Remove the old "sidebar" and raw input fields. Move them into a `<div id="trade-modal" class="hidden">` that we can toggle later.
