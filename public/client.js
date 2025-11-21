const token = localStorage.getItem("catan_token");
const socket = io({
  autoConnect: false,
  query: { token: token },
});

socket.on("token", (t) => localStorage.setItem("catan_token", t));

document.getElementById("joinGameBtn").addEventListener("click", () => {
  const name = document.getElementById("nicknameInput").value;
  if (!name) return alert("Please enter a name");

  document.getElementById("joinModal").style.display = "none";
  socket.connect();
  // Wait for connection to emit join
  // Note: 'connect' event fires on reconnection too, so check if we already joined?
  // For simplicity, just emit. Server handles updates.
});

socket.on("connect", () => {
  const name = document.getElementById("nicknameInput").value;
  if (name) socket.emit("joinGame", { name });
});

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const startBtn = document.getElementById("startGameBtn");
const rollBtn = document.getElementById("rollDiceBtn");
const endTurnBtn = document.getElementById("endTurnBtn");
const turnIndicator = document.getElementById("turn-indicator");
const logDiv = document.getElementById("game-log");
const chatMessagesDiv = document.getElementById("chat-messages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");
const activeOffersDiv = document.getElementById("activeOffers");

// --- UI LISTENERS ---
startBtn.addEventListener("click", () => {
  console.log("Start Game button clicked");
  socket.emit("startGame");
  document.getElementById("start-overlay").style.display = "none";
});
endTurnBtn.addEventListener("click", () => socket.emit("endTurn"));
rollBtn.addEventListener("click", () => socket.emit("rollDice"));
document
  .getElementById("buyDevCardBtn")
  .addEventListener("click", () => socket.emit("buyDevCard"));
document
  .getElementById("tradeBtn")
  .addEventListener("click", () =>
    document.getElementById("tradeModal").classList.remove("hidden")
  );

document.getElementById("postTradeBtn").addEventListener("click", () => {
  const offerRes = document.getElementById("offerRes").value;
  const offerAmt = parseInt(document.getElementById("offerAmt").value);
  const reqRes = document.getElementById("reqRes").value;
  const reqAmt = parseInt(document.getElementById("reqAmt").value);

  const offer = {};
  offer[offerRes] = offerAmt;
  const request = {};
  request[reqRes] = reqAmt;

  socket.emit("createOffer", { offer, request });
  document.getElementById("tradeModal").classList.add("hidden");
});

document.getElementById("bankTradeBtn").addEventListener("click", () => {
  const give = document.getElementById("bankGive").value;
  const get = document.getElementById("bankGet").value;
  socket.emit("bankTrade", { give, get });
});

// --- CHAT LISTENERS ---
sendChatBtn.addEventListener("click", () => {
  const message = chatInput.value.trim();
  if (message) {
    socket.emit("chatMessage", { message });
    chatInput.value = "";
  }
});

chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    const message = chatInput.value.trim();
    if (message) {
      socket.emit("chatMessage", { message });
      chatInput.value = "";
    }
  }
});

// --- STATE ---
const HEX_SIZE = 50;
let CENTER_X = canvas.width / 2;
let CENTER_Y = canvas.height / 2;
let camera = { x: 0, y: 0, zoom: 1 };
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let hoverState = { vertex: null, edge: null };

// --- CONSTANTS ---
const PORT_DATA = [
  { q: -1, r: -2, type: "Generic", vec: { x: 0, y: -1 } },
  { q: 1, r: -3, type: "Sheep", vec: { x: 1, y: -1 } },
  { q: 3, r: -3, type: "Generic", vec: { x: 1, y: 0 } },
  { q: 3, r: -1, type: "Generic", vec: { x: 1, y: 1 } },
  { q: 2, r: 1, type: "Brick", vec: { x: 0, y: 1 } },
  { q: 0, r: 2, type: "Wood", vec: { x: -1, y: 1 } },
  { q: -2, r: 1, type: "Generic", vec: { x: -1, y: 0 } },
  { q: -3, r: 0, type: "Wheat", vec: { x: -1, y: -1 } },
  { q: -3, r: -2, type: "Ore", vec: { x: 0, y: -1 } },
];

const OCEAN_SCENERY = [
  { q: 4, r: -4, icon: "⛵️", size: 30 },
  { q: -5, r: 1, icon: "🐳", size: 36 },
  { q: 5, r: -1, icon: "🐙", size: 30 },
  { q: -4, r: 4, icon: "🦀", size: 28 },
  { q: 0, r: 5, icon: "🐠", size: 32 },
];

function drawPorts() {
  const portIcons = {
    Wood: "🌲",
    Brick: "🧱",
    Sheep: "🐑",
    Wheat: "🌾",
    Ore: "⛰️",
  };

  PORT_DATA.forEach((port) => {
    const center = hexToPixel(port.q, port.r);
    const rawVx = port.vec.x;
    const rawVy = port.vec.y;
    const vecLength = Math.hypot(rawVx, rawVy) || 1;
    const dirX = rawVx / vecLength;
    const dirY = rawVy / vecLength;
    const perpX = -dirY;
    const perpY = dirX;

    const corners = getHexCorners(center);
    const targetDotThreshold = 0.98;
    let startPoint = null;
    for (let i = 0; i < 6; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 6];
      const midX = (c1.x + c2.x) / 2;
      const midY = (c1.y + c2.y) / 2;
      const edgeDirX = midX - center.x;
      const edgeDirY = midY - center.y;
      const edgeLen = Math.hypot(edgeDirX, edgeDirY) || 1;
      const edgeUnitX = edgeDirX / edgeLen;
      const edgeUnitY = edgeDirY / edgeLen;
      const dot = edgeUnitX * dirX + edgeUnitY * dirY;
      if (dot > targetDotThreshold) {
        startPoint = { x: midX, y: midY };
        break;
      }
    }

    if (!startPoint) {
      startPoint = {
        x: center.x + dirX * HEX_SIZE * 0.88,
        y: center.y + dirY * HEX_SIZE * 0.88,
      };
    }

    const pierLength = HEX_SIZE * 0.65;
    const endX = startPoint.x + dirX * pierLength;
    const endY = startPoint.y + dirY * pierLength;
    const innerOffset = HEX_SIZE * 0.12;
    const innerX = startPoint.x - dirX * innerOffset;
    const innerY = startPoint.y - dirY * innerOffset;
    const halfWidth = HEX_SIZE * 0.22;
    const tipWidth = HEX_SIZE * 0.16;

    const innerLeft = {
      x: innerX + perpX * (halfWidth * 0.9),
      y: innerY + perpY * (halfWidth * 0.9),
    };
    const innerRight = {
      x: innerX - perpX * (halfWidth * 0.9),
      y: innerY - perpY * (halfWidth * 0.9),
    };
    const baseLeft = {
      x: startPoint.x + perpX * halfWidth,
      y: startPoint.y + perpY * halfWidth,
    };
    const baseRight = {
      x: startPoint.x - perpX * halfWidth,
      y: startPoint.y - perpY * halfWidth,
    };
    const tipLeft = {
      x: endX + perpX * tipWidth,
      y: endY + perpY * tipWidth,
    };
    const tipRight = {
      x: endX - perpX * tipWidth,
      y: endY - perpY * tipWidth,
    };

    ctx.save();
    const plankGradient = ctx.createLinearGradient(innerX, innerY, endX, endY);
    plankGradient.addColorStop(0, "#b57a42");
    plankGradient.addColorStop(1, "#6d3f1b");
    ctx.fillStyle = plankGradient;
    ctx.beginPath();
    ctx.moveTo(innerLeft.x, innerLeft.y);
    ctx.lineTo(innerRight.x, innerRight.y);
    ctx.lineTo(baseRight.x, baseRight.y);
    ctx.lineTo(tipRight.x, tipRight.y);
    ctx.lineTo(tipLeft.x, tipLeft.y);
    ctx.lineTo(baseLeft.x, baseLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.35)";
    ctx.stroke();

    const pierPixels = Math.hypot(endX - startPoint.x, endY - startPoint.y);
    for (let i = 0; i < 2; i++) {
      const t = 0.35 + i * 0.25;
      const postX = startPoint.x + dirX * pierPixels * t;
      const postY = startPoint.y + dirY * pierPixels * t;
      [1, -1].forEach((mult) => {
        ctx.beginPath();
        ctx.arc(
          postX + perpX * halfWidth * 0.55 * mult,
          postY + perpY * halfWidth * 0.55 * mult,
          3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "#4a2d16";
        ctx.fill();
      });
    }

    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(endX, endY, 18, 0, 2 * Math.PI);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#654321";
    ctx.stroke();

    const isGeneric = port.type === "Generic";
    const icon = isGeneric ? "❓" : portIcons[port.type] || port.type;
    const ratioText = isGeneric ? "3:1" : "2:1";

    ctx.fillStyle = "black";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = isGeneric ? "bold 15px Arial" : "bold 20px Arial";
    ctx.fillText(icon, endX, endY - 2);

    ctx.font = "11px Arial";
    ctx.fillText(ratioText, endX, endY + 13);
    ctx.restore();
  });
}

let localState = {
  board: [],
  buildings: [],
  roads: [],
  activeOffers: [],
  players: {},
};

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  CENTER_X = canvas.width / 2;
  CENTER_Y = canvas.height / 2;
  render();
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// --- CAMERA CONTROLS ---
canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
});

canvas.addEventListener("mousemove", (e) => {
  if (isDragging) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    camera.x += dx;
    camera.y += dy;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    render();
    return;
  }

  const worldPos = screenToWorld(e.clientX, e.clientY);
  const snappedVertex = getNearestVertex(worldPos.x, worldPos.y);
  const snappedEdge = !snappedVertex
    ? getNearestEdge(worldPos.x, worldPos.y)
    : null;

  hoverState = { vertex: snappedVertex, edge: snappedEdge };
  render();
});

canvas.addEventListener("mouseleave", () => {
  hoverState = { vertex: null, edge: null };
  render();
});

canvas.addEventListener("mouseup", () => {
  isDragging = false;
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    if (e.deltaY < 0) {
      camera.zoom = Math.min(camera.zoom + zoomSpeed, 2.0);
    } else {
      camera.zoom = Math.max(camera.zoom - zoomSpeed, 0.5);
    }
    render();
  },
  { passive: false }
);

// --- UI UPDATES ---
function updateUI() {
  if (localState.phase === "WAITING_FOR_PLAYERS") {
    turnIndicator.innerText = "Lobby: Waiting for players...";

    // Show start button only if I am the first player (Host)
    const playerIds = Object.keys(localState.players);
    if (playerIds.length > 0 && playerIds[0] === socket.id) {
      startBtn.style.display = "block";
      document.getElementById("start-overlay").style.display = "block";
    } else {
      startBtn.style.display = "none";
      document.getElementById("start-overlay").style.display = "none";
    }

    rollBtn.disabled = true;
    endTurnBtn.disabled = true;
  } else {
    startBtn.style.display = "none";
    document.getElementById("start-overlay").style.display = "none";
  }

  if (
    localState.phase === "MAIN_GAME" ||
    localState.phase.startsWith("SETUP")
  ) {
    const currentPlayerId = localState.turnOrder[localState.currentTurnIndex];
    const currentPlayer = localState.players[currentPlayerId];
    const isMyTurn = currentPlayerId === socket.id;

    let statusText = isMyTurn
      ? "YOUR TURN!"
      : `Waiting for ${currentPlayer ? currentPlayer.name : "Opponent"}...`;

    if (
      localState.phase === "SETUP_ROUND_1" ||
      localState.phase === "SETUP_ROUND_2"
    ) {
      statusText = isMyTurn
        ? "YOUR TURN (Place Settlement & Road)"
        : `Waiting for ${
            currentPlayer ? currentPlayer.name : "Opponent"
          } (Setup)...`;
      if (localState.phase === "SETUP_ROUND_1")
        statusText += " [Snake Draft ->]";
      if (localState.phase === "SETUP_ROUND_2")
        statusText += " [Snake Draft <-]";

      rollBtn.disabled = true;
      endTurnBtn.disabled = true;
    } else {
      rollBtn.disabled = !isMyTurn || localState.hasRolled;
      endTurnBtn.disabled = !isMyTurn || !localState.hasRolled;
    }

    turnIndicator.innerText = statusText;
    turnIndicator.style.color = isMyTurn ? "var(--accent-green)" : "white";
    turnIndicator.style.textShadow = isMyTurn
      ? "0 0 10px var(--accent-green)"
      : "none";
  } else if (localState.phase === "GAME_OVER") {
    turnIndicator.innerText = "GAME OVER";
    rollBtn.disabled = true;
    endTurnBtn.disabled = true;
  } else if (localState.phase === "ROBBER_PLACEMENT") {
    turnIndicator.innerText = "Place The Gypsy";
    rollBtn.disabled = true;
    endTurnBtn.disabled = true;
  } else if (localState.phase === "DISCARD_PHASE") {
    turnIndicator.innerText = "Discarding...";
    rollBtn.disabled = true;
    endTurnBtn.disabled = true;
  }
}

// Game Over Overlay
const overlay = document.createElement("div");
overlay.id = "gameOverOverlay";
overlay.style.position = "absolute";
overlay.style.top = "0";
overlay.style.left = "0";
overlay.style.width = "100%";
overlay.style.height = "100%";
overlay.style.background = "rgba(0,0,0,0.85)";
overlay.style.display = "none";
overlay.style.flexDirection = "column";
overlay.style.justifyContent = "center";
overlay.style.alignItems = "center";
overlay.style.color = "white";
overlay.style.zIndex = "1000";
overlay.innerHTML = `
    <h1 id="winnerText">GAME OVER</h1>
    <button id="playAgainBtn" style="padding: 15px 30px; font-size: 20px; cursor: pointer;">Play Again</button>
`;
document.body.appendChild(overlay);

document.getElementById("playAgainBtn").addEventListener("click", () => {
  socket.emit("resetGame");
  overlay.style.display = "none";
});

document.getElementById("resetGameBtn").addEventListener("click", () => {
  const btn = document.getElementById("resetGameBtn");
  btn.innerText = "Waiting...";
  btn.disabled = true;
  socket.emit("requestReset");
});

socket.on("gameOver", (data) => {
  document.getElementById(
    "winnerText"
  ).innerText = `GAME OVER - ${data.winner} WINS!`;
  overlay.style.display = "flex";
});

function updateOffers() {
  const list = document.getElementById("trade-feed");
  const panel = document.getElementById("trade-sidebar");

  if (!list || !panel) return;

  list.innerHTML = "";

  panel.style.display = "block";

  if (localState.activeOffers.length === 0) {
    list.innerHTML =
      '<div class="trade-item trade-empty">No active trades</div>';
    return;
  }

  localState.activeOffers.forEach((o) => {
    const div = document.createElement("div");
    div.className = "trade-item";

    const fromPlayer = localState.players[o.from];
    const name = fromPlayer ? fromPlayer.name : "Unknown";

    const offerText = Object.entries(o.offer)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");
    const reqText = Object.entries(o.request)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");

    div.innerHTML = `
        <div><strong>${name}</strong> wants:</div>
        <div style="color: #e74c3c">${reqText}</div>
        <div>Offers:</div>
        <div style="color: #2ecc71">${offerText}</div>
    `;

    if (o.from === socket.id) {
      const cancelBtn = document.createElement("button");
      cancelBtn.innerText = "Cancel";
      cancelBtn.onclick = () => socket.emit("cancelOffer", { offerId: o.id });
      div.appendChild(cancelBtn);
    } else {
      const acceptBtn = document.createElement("button");
      acceptBtn.innerText = "Accept";
      acceptBtn.onclick = () => socket.emit("acceptTrade", { offerId: o.id });
      div.appendChild(acceptBtn);
    }

    list.appendChild(div);
  });
  console.log("Trades updated:", localState.activeOffers);
}

// --- SOCKET EVENTS ---
socket.on("init", (state) => {
  localState.board = state.board;
  localState.buildings = state.buildings;
  localState.roads = state.roads;
  localState.turnOrder = state.turnOrder;
  localState.currentTurnIndex = state.currentTurnIndex;
  localState.phase = state.phase;
  localState.hasRolled = state.hasRolled;
  localState.activeOffers = state.activeOffers || [];
  localState.gypsy = state.gypsy;
  localState.ports = state.ports || [];
  render();
  updateUI();
  updateOffers();
});

socket.on("requestDiscard", (data) => {
  const count = data.count;
  alert(`The Gypsy! You must discard ${count} resources.`);

  const toDiscard = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
  let remaining = count;

  while (remaining > 0) {
    const res = prompt(
      `Discard ${remaining} more. Type resource name (wood, brick, sheep, wheat, ore):`
    );
    if (res && toDiscard.hasOwnProperty(res)) {
      toDiscard[res]++;
      remaining--;
    }
  }

  socket.emit("discardResources", { resources: toDiscard });
});

let lastDevCardCount = 0;

socket.on("playerUpdate", (players) => {
  // Check for new dev cards
  const myId = socket.id;
  if (players[myId]) {
    const myPlayer = players[myId];
    const currentCount = (myPlayer.devCards || []).length;
    if (currentCount > lastDevCardCount) {
      const newCard = myPlayer.devCards[currentCount - 1];
      const type = newCard.type || newCard;
      showDevCardReveal(type);
    }
    lastDevCardCount = currentCount;
  }

  localState.players = players; // Store for UI logic
  updateUI(); // Re-check host status

  // Update Top Bar Player List
  const playerListDiv = document.getElementById("player-list");
  if (playerListDiv) {
    playerListDiv.innerHTML = "";
    Object.values(players).forEach((p) => {
      const badge = document.createElement("div");
      badge.className = "player-badge";
      badge.style.borderLeft = `5px solid ${p.color}`;
      badge.innerHTML = `
                <span>${p.name}</span>
                <span style="color: gold;">${p.victoryPoints} Social Cred</span>
                <span>🃏 ${Object.values(p.resources).reduce(
                  (a, b) => a + b,
                  0
                )}</span>
                <span>⚔️ ${p.armySize}</span>
            `;
      playerListDiv.appendChild(badge);
    });
  }

  if (players[myId]) {
    const myPlayer = players[myId];
    const vpBar = document.getElementById("vp-bar");
    if (vpBar) vpBar.innerText = `${myPlayer.victoryPoints} / 10 Social Cred`;

    const handContainer = document.getElementById("hand-container");
    if (handContainer) {
      handContainer.innerHTML = "";

      const resourceIcons = {
        wood: "🌲",
        brick: "🧱",
        sheep: "🐑",
        wheat: "🌾",
        ore: "🪨",
      };

      for (let res in resourceIcons) {
        const count = myPlayer.resources[res] || 0;
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
                    <div class="card-icon">${resourceIcons[res]}</div>
                    <div style="font-size: 12px; margin-top: 5px;">${res.toUpperCase()}</div>
                    <div class="card-count">${count}</div>
                `;
        handContainer.appendChild(card);
      }

      const cards = myPlayer.devCards || [];
      cards.forEach((cardObj) => {
        const cardType = cardObj.type || cardObj;
        const card = document.createElement("div");
        card.className = "card";
        card.style.background = "#bdc3c7";
        card.innerHTML = `
                    <div class="card-icon">🃏</div>
                    <div style="font-size: 10px; margin-top: 5px;">${cardType}</div>
                `;

        if (cardType === "knight") {
          card.onclick = () => socket.emit("playDevCard", { type: "knight" });
        } else if (cardType === "yearOfPlenty") {
          card.onclick = () => {
            const r1 = prompt("Resource 1 (wood, brick, sheep, wheat, ore):");
            const r2 = prompt("Resource 2:");
            if (r1 && r2)
              socket.emit("playDevCard", {
                type: "yearOfPlenty",
                res1: r1,
                res2: r2,
              });
          };
        } else if (cardType === "monopoly") {
          card.onclick = () => {
            const r = prompt("Resource to monopolize:");
            if (r)
              socket.emit("playDevCard", { type: "monopoly", resource: r });
          };
        } else if (cardType === "roadBuilding") {
          card.onclick = () =>
            socket.emit("playDevCard", { type: "roadBuilding" });
        }

        handContainer.appendChild(card);
      });
    }
  }
});

socket.on("buildingPlaced", (building) => {
  const idx = localState.buildings.findIndex(
    (b) => b.vertexId === building.vertexId
  );
  if (idx !== -1) {
    localState.buildings[idx] = building;
  } else {
    localState.buildings.push(building);
  }
  render();
});

socket.on("roadPlaced", (road) => {
  localState.roads.push(road);
  render();
});

socket.on("diceRolled", (roll) => {
  showDiceAnimation(roll);

  setTimeout(() => {
    const myId = socket.id;
    const myBuildings = localState.buildings.filter((b) => b.owner === myId);

    localState.board.forEach((hex) => {
      if (
        hex.number === roll &&
        hex.resource !== "desert" &&
        (hex.q !== localState.gypsy.q || hex.r !== localState.gypsy.r)
      ) {
        const center = hexToPixel(hex.q, hex.r);

        myBuildings.forEach((b) => {
          const parts = b.vertexId.split(",").map(Number);
          const vQ = parts[0],
            vR = parts[1],
            vD = parts[2];

          const vHexCenter = hexToPixel(vQ, vR);
          const angle_deg = 60 * vD - 30;
          const angle_rad = (Math.PI / 180) * angle_deg;
          const vx = vHexCenter.x + HEX_SIZE * Math.cos(angle_rad);
          const vy = vHexCenter.y + HEX_SIZE * Math.sin(angle_rad);

          const dist = Math.sqrt(
            Math.pow(vx - center.x, 2) + Math.pow(vy - center.y, 2)
          );

          if (Math.abs(dist - HEX_SIZE) < 5) {
            const amount = b.type === "city" ? 2 : 1;
            animateResourceGain(hex.resource, amount, center.x, center.y);
          }
        });
      }
    });
  }, 800);
});

// --- HOOD LOGS & VISUAL JUICE ---

const SLANG_DICT = {
  turnStart: (name) => `It's ${name}'s turn to cook.`,
  roll: (name, num) => `${name} rolled a ${num}. We eating good.`,
  roll7: (name) => `OH SH*T! ${name} called the Opps!`,
  buildRoad: (name) => `${name} is expanding the block.`,
  buildSettlement: (name) => `${name} set up a trap house.`,
  buildCity: (name) => `${name} upgraded to the Penthouse.`,
  steal: (name, victim) => `${name} just finessed a card from ${victim}.`,
  win: (name) => `${name} is the King of the Hood!`,
};

function showToast(msg) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = msg;
  document.body.appendChild(toast);

  // Trigger reflow
  toast.offsetHeight;

  toast.style.opacity = "1";
  toast.style.transform = "translate(-50%, -50%) scale(1)";

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, -60%) scale(0.9)";
    setTimeout(() => toast.remove(), 500);
  }, 2000);
}

function logGameEvent(msg, type = "info") {
  let slangMsg = msg;

  // Regex Matching for Slang Translation
  const turnMatch = msg.match(/^It is (.+)'s turn\.$/);
  if (turnMatch) slangMsg = SLANG_DICT.turnStart(turnMatch[1]);

  const rollMatch = msg.match(/^(.+) rolled a (\d+)\.$/);
  if (rollMatch) {
    const num = parseInt(rollMatch[2]);
    if (num === 7) {
      slangMsg = SLANG_DICT.roll7(rollMatch[1]);
      document.body.classList.add("shake");
      setTimeout(() => document.body.classList.remove("shake"), 500);
    } else {
      slangMsg = SLANG_DICT.roll(rollMatch[1], num);
    }
  }

  const roadMatch = msg.match(/^(.+) built a road\.$/);
  if (roadMatch) slangMsg = SLANG_DICT.buildRoad(roadMatch[1]);

  const settlementMatch = msg.match(/^(.+) built a settlement\.$/);
  if (settlementMatch)
    slangMsg = SLANG_DICT.buildSettlement(settlementMatch[1]);

  const cityMatch = msg.match(/^(.+) upgraded to a city\.$/);
  if (cityMatch) slangMsg = SLANG_DICT.buildCity(cityMatch[1]);

  const stealMatch = msg.match(/^(.+) stole a card from (.+)\.$/);
  if (stealMatch) slangMsg = SLANG_DICT.steal(stealMatch[1], stealMatch[2]);

  const winMatch = msg.match(/^GAME OVER! (.+) WINS!$/);
  if (winMatch) slangMsg = SLANG_DICT.win(winMatch[1]);

  const p = document.createElement("div");
  p.innerText = slangMsg;
  p.style.background = "rgba(0,0,0,0.2)";
  p.style.padding = "4px 8px";
  p.style.borderRadius = "4px";
  p.style.marginBottom = "4px";
  logDiv.prepend(p);
}

socket.on("logMessage", (msg) => {
  logGameEvent(msg);
});

socket.on("chatMessage", (data) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-message";

  const authorSpan = document.createElement("span");
  authorSpan.className = "chat-author";
  authorSpan.style.color = data.color || "#fff";
  authorSpan.innerText = `${data.name}:`;

  const textSpan = document.createElement("span");
  textSpan.className = "chat-text";
  textSpan.innerText = data.message;

  messageDiv.appendChild(authorSpan);
  messageDiv.appendChild(textSpan);
  chatMessagesDiv.appendChild(messageDiv);

  // Auto-scroll to bottom
  chatMessagesDiv.scrollTop = chatMessagesDiv.scrollHeight;
});

// --- VISUAL EFFECTS HELPERS ---

function showDiceAnimation(roll) {
  const container = document.getElementById("dice-container");
  const dice1 = document.getElementById("dice1");
  const dice2 = document.getElementById("dice2");

  container.classList.remove("hidden");
  dice1.className = "dice shake";
  dice2.className = "dice shake";

  const interval = setInterval(() => {
    const r1 = Math.floor(Math.random() * 6) + 1;
    const r2 = Math.floor(Math.random() * 6) + 1;
    dice1.className = `dice shake face-${r1}`;
    dice2.className = `dice shake face-${r2}`;
  }, 100);

  setTimeout(() => {
    clearInterval(interval);
    let d1 = Math.floor(roll / 2);
    let d2 = roll - d1;
    if (d1 === 0) {
      d1 = 1;
      d2 = roll - 1;
    }

    dice1.className = `dice face-${d1}`;
    dice2.className = `dice face-${d2}`;

    setTimeout(() => {
      container.classList.add("hidden");
    }, 1000);
  }, 800);
}

function animateResourceGain(type, amount, startX, startY) {
  if (!startX) startX = window.innerWidth / 2;
  if (!startY) startY = window.innerHeight / 2;

  const destX = window.innerWidth / 2;
  const destY = window.innerHeight - 50;

  for (let i = 0; i < amount; i++) {
    setTimeout(() => {
      const el = document.createElement("div");
      el.className = `floating-resource res-${type}`;
      el.innerText = type.charAt(0).toUpperCase();
      el.style.left = `${startX}px`;
      el.style.top = `${startY}px`;
      document.body.appendChild(el);

      // Force reflow
      el.offsetWidth;

      el.style.left = `${destX}px`;
      el.style.top = `${destY}px`;
      el.style.opacity = "0";

      setTimeout(() => {
        el.remove();
      }, 800);
    }, i * 100);
  }
}

function showDevCardReveal(type) {
  const container = document.getElementById("dev-card-reveal");
  const title = document.getElementById("revealed-card-title");
  const desc = document.getElementById("revealed-card-desc");

  title.innerText = type.toUpperCase();

  let description = "";
  if (type === "knight") description = "Move the robber";
  else if (type === "vp") description = "1 Victory Point";
  else if (type === "roadBuilding") description = "Build 2 roads";
  else if (type === "yearOfPlenty") description = "Take 2 resources";
  else if (type === "monopoly") description = "Monopolize a resource";

  desc.innerText = description;

  container.classList.remove("hidden");

  setTimeout(() => {
    container.classList.add("hidden");
  }, 2000);
}

// --- MATH & RENDER ---
function hexToPixel(q, r) {
  const x = HEX_SIZE * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = HEX_SIZE * ((3 / 2) * r);
  return { x: x + CENTER_X, y: y + CENTER_Y };
}

function getHexCorners(center) {
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30;
    const angle_rad = (Math.PI / 180) * angle_deg;
    corners.push({
      x: center.x + HEX_SIZE * Math.cos(angle_rad),
      y: center.y + HEX_SIZE * Math.sin(angle_rad),
    });
  }
  return corners;
}

function getNearestVertex(x, y) {
  let nearest = null;
  let minDistance = Infinity;
  const SNAP_DISTANCE = 20;

  localState.board.forEach((hex) => {
    const center = hexToPixel(hex.q, hex.r);
    const corners = getHexCorners(center);

    corners.forEach((corner, index) => {
      const dx = x - corner.x;
      const dy = y - corner.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < minDistance && distance < SNAP_DISTANCE) {
        minDistance = distance;
        nearest = {
          x: corner.x,
          y: corner.y,
          id: Shared.getCanonicalVertex(hex.q, hex.r, index),
        };
      }
    });
  });
  return nearest;
}

function getNearestEdge(x, y) {
  let nearest = null;
  let minDistance = Infinity;
  const SNAP_DISTANCE = 20;

  localState.board.forEach((hex) => {
    const center = hexToPixel(hex.q, hex.r);
    const corners = getHexCorners(center);

    for (let i = 0; i < 6; i++) {
      const c1 = corners[i];
      const c2 = corners[(i + 1) % 6];

      const midX = (c1.x + c2.x) / 2;
      const midY = (c1.y + c2.y) / 2;

      const dx = x - midX;
      const dy = y - midY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < minDistance && dist < SNAP_DISTANCE) {
        minDistance = dist;
        nearest = {
          x: midX,
          y: midY,
          id: Shared.getCanonicalEdge(hex.q, hex.r, i),
        };
      }
    }
  });
  return nearest;
}

function drawHex(q, r, resource, number) {
  const center = hexToPixel(q, r);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle_deg = 60 * i - 30;
    const angle_rad = (Math.PI / 180) * angle_deg;
    ctx.lineTo(
      center.x + HEX_SIZE * Math.cos(angle_rad),
      center.y + HEX_SIZE * Math.sin(angle_rad)
    );
  }
  ctx.closePath();

  // Gradients
  const gradient = ctx.createRadialGradient(
    center.x,
    center.y,
    10,
    center.x,
    center.y,
    HEX_SIZE
  );

  if (resource === "wood") {
    gradient.addColorStop(0, "#2ecc71");
    gradient.addColorStop(1, "#27ae60");
  } else if (resource === "brick") {
    gradient.addColorStop(0, "#e74c3c");
    gradient.addColorStop(1, "#c0392b");
  } else if (resource === "sheep") {
    gradient.addColorStop(0, "#a9dfbf");
    gradient.addColorStop(1, "#27ae60"); // Light green to dark
  } else if (resource === "wheat") {
    gradient.addColorStop(0, "#f1c40f");
    gradient.addColorStop(1, "#f39c12");
  } else if (resource === "ore") {
    gradient.addColorStop(0, "#95a5a6");
    gradient.addColorStop(1, "#7f8c8d");
  } else if (resource === "desert") {
    gradient.addColorStop(0, "#f39c12");
    gradient.addColorStop(1, "#d35400");
  } else {
    gradient.addColorStop(0, "#fff");
    gradient.addColorStop(1, "#ccc");
  }

  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1;

  // Resource Emoji Background
  const emojis = {
    wood: "🌲",
    brick: "🧱",
    sheep: "🐑",
    wheat: "🌾",
    ore: "⛰️",
    desert: "🌵",
  };

  if (emojis[resource]) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = "48px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;
    ctx.fillText(emojis[resource], center.x, center.y - 5);
    ctx.restore();
  }

  if (resource !== "desert") {
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(center.x, center.y + 18, 15, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = "#333";
    ctx.stroke();

    // Number Color (Red for 6 and 8)
    const isRed = number === 6 || number === 8;
    ctx.fillStyle = isRed ? "#e74c3c" : "black";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 14px Arial";
    ctx.fillText(number, center.x, center.y + 16);

    // Probability Dots
    const dotsCount =
      {
        2: 1,
        12: 1,
        3: 2,
        11: 2,
        4: 3,
        10: 3,
        5: 4,
        9: 4,
        6: 5,
        8: 5,
      }[number] || 0;

    const dotSize = 2;
    const dotSpacing = 4;
    const totalWidth = (dotsCount - 1) * dotSpacing;
    let startX = center.x - totalWidth / 2;

    ctx.fillStyle = isRed ? "#e74c3c" : "black";
    for (let i = 0; i < dotsCount; i++) {
      ctx.beginPath();
      ctx.arc(startX + i * dotSpacing, center.y + 23, dotSize, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
}
function drawBuilding(vertexId, color, type) {
  const parts = vertexId.split(",").map(Number);
  const q = parts[0],
    r = parts[1],
    d = parts[2];
  const center = hexToPixel(q, r);
  const angle_deg = 60 * d - 30;
  const angle_rad = (Math.PI / 180) * angle_deg;
  const x = center.x + HEX_SIZE * Math.cos(angle_rad);
  const y = center.y + HEX_SIZE * Math.sin(angle_rad);

  ctx.fillStyle = color;
  ctx.beginPath();
  if (type === "city") {
    ctx.rect(x - 15, y - 15, 30, 30);
  } else {
    ctx.rect(x - 10, y - 10, 20, 20);
  }
  ctx.fill();
  ctx.stroke();
}

function drawRoad(edgeId, color) {
  const parts = edgeId.replace("E", "").split(",").map(Number);
  const q = parts[0],
    r = parts[1],
    d = parts[2];
  const center = hexToPixel(q, r);
  const corners = getHexCorners(center);
  const c1 = corners[d];
  const c2 = corners[(d + 1) % 6];
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(c1.x, c1.y);
  ctx.lineTo(c2.x, c2.y);
  ctx.stroke();
  ctx.lineWidth = 1;
}

function drawGypsy() {
  if (!localState.gypsy) return;
  const center = hexToPixel(localState.gypsy.q, localState.gypsy.r);
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.arc(center.x, center.y, 15, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "20px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🧙", center.x, center.y);
}

function drawOceanDecorations() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  OCEAN_SCENERY.forEach((item) => {
    const pos = hexToPixel(item.q, item.r);
    ctx.font = `${item.size}px Arial`;
    ctx.globalAlpha = 0.9;
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 8;
    ctx.fillText(item.icon, pos.x, pos.y);
  });

  ctx.globalAlpha = 0.3;
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(CENTER_X, CENTER_Y, HEX_SIZE * (4 + i * 1.3), 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function getVertexPixel(vertexId) {
  const parts = vertexId.split(",").map(Number);
  const q = parts[0],
    r = parts[1],
    d = parts[2];
  const center = hexToPixel(q, r);
  const angle_deg = 60 * d - 30;
  const angle_rad = (Math.PI / 180) * angle_deg;
  return {
    x: center.x + HEX_SIZE * Math.cos(angle_rad),
    y: center.y + HEX_SIZE * Math.sin(angle_rad),
  };
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(camera.x + canvas.width / 2, camera.y + canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-canvas.width / 2, -canvas.height / 2);

  drawOceanDecorations();
  localState.board.forEach((hex) =>
    drawHex(hex.q, hex.r, hex.resource, hex.number)
  );
  drawPorts();
  localState.roads.forEach((r) => drawRoad(r.edgeId, r.color));
  localState.buildings.forEach((b) =>
    drawBuilding(b.vertexId, b.color, b.type)
  );
  drawGypsy();

  if (hoverState.vertex) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(hoverState.vertex.x, hoverState.vertex.y, 10, 0, 2 * Math.PI);
    ctx.fill();
  } else if (hoverState.edge) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.beginPath();
    ctx.arc(hoverState.edge.x, hoverState.edge.y, 10, 0, 2 * Math.PI);
    ctx.fill();
  }

  ctx.restore();
}

// Helper to transform mouse coordinates to world coordinates
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

canvas.addEventListener("click", (e) => {
  if (isDragging) return; // Don't click if we just dragged

  const worldPos = screenToWorld(e.clientX, e.clientY);
  const x = worldPos.x;
  const y = worldPos.y;

  if (localState.phase === "ROBBER_PLACEMENT") {
    let clickedHex = null;
    localState.board.forEach((hex) => {
      const center = hexToPixel(hex.q, hex.r);
      const dx = x - center.x;
      const dy = y - center.y;
      if (Math.sqrt(dx * dx + dy * dy) < HEX_SIZE * 0.8) {
        // Increased hit area slightly
        clickedHex = hex;
      }
    });

    if (clickedHex) {
      socket.emit("moveGypsy", { q: clickedHex.q, r: clickedHex.r });
    }
    return;
  }

  const snapped = getNearestVertex(x, y);
  if (snapped) {
    const existing = localState.buildings.find(
      (b) => b.vertexId === snapped.id
    );
    if (existing) {
      if (existing.owner === socket.id && existing.type !== "city") {
        socket.emit("buildCity", { vertexId: snapped.id });
      }
      return;
    }
    socket.emit("buildNode", { vertexId: snapped.id });
    return;
  }

  const snappedEdge = getNearestEdge(x, y);
  if (snappedEdge) {
    socket.emit("buildRoad", { edgeId: snappedEdge.id });
  }
});

// --- GAME RESET ---
socket.on("gameReset", () => {
  localState = {
    board: [],
    buildings: [],
    roads: [],
    activeOffers: [],
    players: {},
  };
  camera = { x: 0, y: 0, zoom: 1 };
  hoverState = { vertex: null, edge: null };

  const btn = document.getElementById("resetGameBtn");
  btn.innerText = "🔄 Reset";
  btn.disabled = false;

  document.getElementById("game-log").innerHTML = "";
  const tradeSidebar = document.getElementById("trade-sidebar");
  const tradeFeed = document.getElementById("trade-feed");
  if (tradeSidebar) tradeSidebar.style.display = "block";
  if (tradeFeed)
    tradeFeed.innerHTML =
      '<div class="trade-item trade-empty">No active trades</div>';

  render();
  updateUI();
});
