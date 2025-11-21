I need to add visual polish ("Juice") to the game events. Currently, dice rolls and card gains happen instantly with no feedback.

Please use the file edit tool to implement Visual Effects in `style.css`, `index.html`, and `client.js`.

### 1. DICE ROLL VISUALS (CSS Only)

- **HTML:** Add a `<div id="dice-container">` to `index.html`. Inside, put two `div`s representing dice.
- **CSS:**
  - Style the dice as white rounded squares with shadow.
  - Use CSS Grid or Flexbox to position the "dots" (pips) on the faces based on classes `.face-1` to `.face-6`.
  - Add a `@keyframes shake` animation (rotate and translate slightly).
- **JS Logic (`client.js`):**
  - Inside `socket.on('diceRolled', ({ roll, result }) => ...)`:
  - Show the container.
  - Apply the `shake` animation class for 800ms.
  - During the shake, rapidly change the dot classes to random numbers to simulate rolling.
  - After 800ms, set the classes to match the actual `result` (e.g., if roll is 8, show 4 and 4, or 3 and 5).
  - Pause for 1 second, then fade out.

### 2. "FLYING CARD" ANIMATIONS

- **CSS:**
  - Create a class `.floating-resource`:
    - Fixed size (e.g., 40px x 60px).
    - Background colors matching resources (Wood=Brown, Brick=Red, etc.).
    - `position: absolute`, `transition: top 0.8s ease-in-out, left 0.8s ease-in-out, opacity 0.8s`.
    - `z-index: 1000`.
- **JS Logic:**
  - Create a helper `animateResourceGain(type, amount, startX, startY)`.
    - If `startX/Y` are missing, default to the center of the screen.
  - **The Animation:**
    1. Create the DOM element at `startX, startY`.
    2. Calculate the destination (the position of the resource icon in the player's bottom HUD).
    3. Force a browser reflow (read `element.offsetWidth`).
    4. Set `style.top` and `style.left` to the destination coordinates.
    5. Set `style.opacity` to 0.
    6. Remove element after 800ms.
  - **Trigger:**
    - When a harvest happens (`diceRolled`), calculate which Hexes produced resources. Spawn the floating cards **from those Hex coordinates** flying towards the player's hand.

### 3. DEV CARD REVEAL

- **UI:** When `buyDevCard` is successful:
  - Show a "Card Flip" animation in the center of the screen.
  - Front of card: "Dev Card Back".
  - Flip to: The specific card text (e.g., "Knight").
  - Then shrink and fly it down to the "Dev Cards" section of the HUD.

Please implement these visuals to make the game feel responsive.
