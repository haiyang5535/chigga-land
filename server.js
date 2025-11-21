const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const Shared = require("./public/shared.js");

app.use(express.static("public"));

// Predefined player colors for 5 players
const PLAYER_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8"];
let colorIndex = 0;

// GAME STATE
// A simplified representation of the board (resource types, numbers)
let gameState = {
  players: {}, // socketId: { color, score }
  board: [], // Array of hex data
  buildings: [], // Where players have built
  roads: [], // Where players have built roads
  turnOrder: [], // Array of socket IDs
  currentTurnIndex: 0,
  phase: "WAITING_FOR_PLAYERS", // 'WAITING_FOR_PLAYERS', 'MAIN_GAME', 'GAME_OVER'
  hasRolled: false,
  activeOffers: [], // { id, from, offer: {}, request: {} }
  gypsy: { q: 0, r: 0 },
  largestArmy: { owner: null, size: 0 },
  longestRoad: { owner: null, length: 0 },
  setupItemsPlaced: { settlement: false, road: false },
  turnDirection: 1,
  ports: [], // { vertexIds: [], type: '3:1' | 'wood' ... }
  turnCount: 0,
  hasPlayedDevCard: false,
  pendingDiscards: [], // List of socketIds who need to discard
};

function isPlayersTurn(socketId) {
  if (
    gameState.phase !== "MAIN_GAME" &&
    gameState.phase !== "SETUP_ROUND_1" &&
    gameState.phase !== "SETUP_ROUND_2" &&
    gameState.phase !== "ROBBER_PLACEMENT"
  )
    return false;
  const currentPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
  return socketId === currentPlayerId;
}

function checkWinCondition(socketId) {
  const player = gameState.players[socketId];
  if (player.victoryPoints >= Shared.LIMITS.VICTORY_POINTS_TO_WIN) {
    gameState.phase = "GAME_OVER";
    io.emit("logMessage", `GAME OVER! ${player.name} WINS!`);
    io.emit("gameOver", { winner: player.name });
    io.emit("init", gameState); // Send full state update
    return true;
  }
  return false;
}

// Initialize a basic hex grid (simulating the standard layout)
function initBoard() {
  // Standard Catan has 19 hexes: 4 wood, 4 brick, 4 sheep, 4 wheat, 3 ore, 1 desert
  const resourcePool = [
    "wood",
    "wood",
    "wood",
    "wood",
    "brick",
    "brick",
    "brick",
    "brick",
    "sheep",
    "sheep",
    "sheep",
    "sheep",
    "wheat",
    "wheat",
    "wheat",
    "wheat",
    "ore",
    "ore",
    "ore",
    "desert",
  ];

  // Standard number tokens (excluding 7)
  const numberPool = [
    2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12,
  ];

  // Shuffle resources
  for (let i = resourcePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resourcePool[i], resourcePool[j]] = [resourcePool[j], resourcePool[i]];
  }

  // Shuffle numbers
  for (let i = numberPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numberPool[i], numberPool[j]] = [numberPool[j], numberPool[i]];
  }

  let resourceIndex = 0;
  let numberIndex = 0;

  // Generate hex grid (radius 2)
  for (let q = -2; q <= 2; q++) {
    for (let r = -2; r <= 2; r++) {
      if (Math.abs(q + r) <= 2) {
        const resource = resourcePool[resourceIndex++];
        const number = resource === "desert" ? 0 : numberPool[numberIndex++];

        const hex = {
          q,
          r,
          resource: resource,
          number: number,
        };

        gameState.board.push(hex);

        // Place gypsy on desert initially
        if (resource === "desert") {
          gameState.gypsy = { q, r };
        }
      }
    }
  }

  // Initialize Ports (Simplified placement on outer ring)
  // We'll just pick some specific coordinates that are likely on the edge
  // In a real implementation, we'd calculate the hull.
  // For radius 2, outer hexes are at distance 2.
  const portTypes = [
    "3:1",
    "wood",
    "brick",
    "3:1",
    "sheep",
    "wheat",
    "3:1",
    "ore",
    "3:1",
  ];
  let portIndex = 0;

  // Helper to add port
  const addPort = (q, r, d1, d2, type) => {
    const v1 = Shared.getCanonicalVertex(q, r, d1);
    const v2 = Shared.getCanonicalVertex(q, r, d2);
    gameState.ports.push({ vertexIds: [v1, v2], type });
  };

  // Hardcoded approximate positions for a standard-ish feel
  addPort(0, -2, 0, 1, portTypes[0]);
  addPort(1, -2, 1, 2, portTypes[1]);
  addPort(2, -2, 2, 3, portTypes[2]);
  addPort(2, -1, 3, 4, portTypes[3]);
  addPort(2, 0, 4, 5, portTypes[4]);
  addPort(1, 1, 5, 0, portTypes[5]);
  addPort(0, 2, 0, 1, portTypes[6]);
  addPort(-1, 2, 1, 2, portTypes[7]);
  addPort(-2, 2, 2, 3, portTypes[8]);
}
initBoard();

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  const token = socket.handshake.query.token;
  let player = null;

  // Check for reconnection
  if (token) {
    player = Object.values(gameState.players).find((p) => p.token === token);
  }

  if (player) {
    // Reconnect logic: Migrate data to new socket.id
    const oldSocketId = player.id;
    console.log(
      `Player reconnected: ${player.name} (${oldSocketId} -> ${socket.id})`
    );

    delete gameState.players[oldSocketId];
    player.id = socket.id;
    gameState.players[socket.id] = player;

    // Update references
    const idx = gameState.turnOrder.indexOf(oldSocketId);
    if (idx !== -1) gameState.turnOrder[idx] = socket.id;

    gameState.buildings.forEach((b) => {
      if (b.owner === oldSocketId) b.owner = socket.id;
    });
    gameState.roads.forEach((r) => {
      if (r.owner === oldSocketId) r.owner = socket.id;
    });
    gameState.activeOffers.forEach((o) => {
      if (o.from === oldSocketId) o.from = socket.id;
    });
    if (gameState.largestArmy.owner === oldSocketId)
      gameState.largestArmy.owner = socket.id;
    if (gameState.longestRoad.owner === oldSocketId)
      gameState.longestRoad.owner = socket.id;
    if (gameState.pendingDiscards.includes(oldSocketId)) {
      gameState.pendingDiscards = gameState.pendingDiscards.map((id) =>
        id === oldSocketId ? socket.id : id
      );
    }
  } else {
    // New player
    const newToken =
      Math.random().toString(36).substring(2) + Date.now().toString(36);

    // Assign color from predefined list
    const playerCount = Object.keys(gameState.players).length;

    // Prevent joining if game is full (5 players) and already started
    if (playerCount >= 5 && gameState.phase !== "WAITING_FOR_PLAYERS") {
      socket.emit("logMessage", "Game is full (5/5 players).");
      socket.disconnect();
      return;
    }

    const assignedColor = PLAYER_COLORS[playerCount % PLAYER_COLORS.length];

    gameState.players[socket.id] = {
      id: socket.id,
      token: newToken,
      name: "Unknown",
      color: assignedColor,
      resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 },
      victoryPoints: 0,
      devCards: [],
      armySize: 0,
      freeRoads: 0,
      supply: { settlements: 5, cities: 4, roads: 15 },
      hasLongestRoad: false,
      hasLargestArmy: false,
    };
    socket.emit("token", newToken);
  }

  // Send current state to new player
  socket.emit("init", gameState);

  // Broadcast new player to everyone else
  io.emit("playerUpdate", gameState.players);

  socket.on("joinGame", (data) => {
    const player = gameState.players[socket.id];
    if (player) {
      player.name = data.name;
      io.emit("playerUpdate", gameState.players);
      io.emit("logMessage", `${player.name} joined the game.`);
    }
  });

  socket.on("startGame", (options) => {
    console.log("Start game request received from", socket.id);
    if (gameState.phase !== "WAITING_FOR_PLAYERS") {
      console.log("Game already started or over");
      return;
    }

    const playerCount = Object.keys(gameState.players).length;
    console.log(`Current player count: ${playerCount}`);
    console.log(
      `Players:`,
      Object.keys(gameState.players).map((id) => gameState.players[id].name)
    );

    if (playerCount < 2) {
      socket.emit(
        "logMessage",
        "Not enough players to start (need at least 2)."
      );
      return;
    }
    if (playerCount > 5) {
      socket.emit("logMessage", `Too many players (${playerCount}/5 maximum).`);
      return;
    }

    // Generate Deck
    const deck = [];
    for (let i = 0; i < 14; i++) deck.push("knight");
    for (let i = 0; i < 5; i++) deck.push("vp");
    for (let i = 0; i < 2; i++) deck.push("roadBuilding");
    for (let i = 0; i < 2; i++) deck.push("yearOfPlenty");
    for (let i = 0; i < 2; i++) deck.push("monopoly");

    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    gameState.deck = deck;

    gameState.turnOrder = Object.keys(gameState.players);
    // Shuffle unless disabled
    if (!options || !options.noShuffle) {
      gameState.turnOrder.sort(() => Math.random() - 0.5);
    } else {
      // Ensure deterministic order (by join order/keys)
      // Object.keys order is not guaranteed to be insertion order in all JS engines, but usually is for strings.
      // But to be safe, we might want to sort by something deterministic if we want P1, P2...
      // The players are added sequentially.
      // Let's assume Object.keys is fine or sort by token/id?
      // Actually, let's sort by name to be sure P1, P2...
      gameState.turnOrder.sort((a, b) => {
        const nameA = gameState.players[a].name;
        const nameB = gameState.players[b].name;
        return nameA.localeCompare(nameB);
      });
    }

    gameState.phase = "SETUP_ROUND_1";
    gameState.currentTurnIndex = 0;
    gameState.hasRolled = false;
    gameState.setupItemsPlaced = { settlement: false, road: false };
    gameState.turnDirection = 1;

    io.emit("init", gameState);
    io.emit("logMessage", "Game Started! Setup Phase: Round 1");
    io.emit(
      "logMessage",
      `It is ${gameState.players[gameState.turnOrder[0]].name}'s turn.`
    );
  });

  function handleEndTurn() {
    gameState.hasRolled = false;
    gameState.setupItemsPlaced = { settlement: false, road: false };
    gameState.hasPlayedDevCard = false;
    gameState.turnCount++;

    if (gameState.phase === "MAIN_GAME") {
      gameState.currentTurnIndex =
        (gameState.currentTurnIndex + 1) % gameState.turnOrder.length;
    } else if (gameState.phase === "SETUP_ROUND_1") {
      if (gameState.currentTurnIndex < gameState.turnOrder.length - 1) {
        gameState.currentTurnIndex++;
      } else {
        gameState.phase = "SETUP_ROUND_2";
        gameState.turnDirection = -1;
        // Index stays same (last player goes again)
        io.emit("logMessage", "Setup Round 2: Reverse Order");
      }
    } else if (gameState.phase === "SETUP_ROUND_2") {
      if (gameState.currentTurnIndex > 0) {
        gameState.currentTurnIndex--;
      } else {
        gameState.phase = "MAIN_GAME";
        gameState.turnDirection = 1;
        gameState.currentTurnIndex = 0;
        io.emit("logMessage", "Main Game Started!");
      }
    }

    const nextPlayerId = gameState.turnOrder[gameState.currentTurnIndex];
    io.emit("init", gameState); // Sync state
    io.emit(
      "logMessage",
      `It is ${gameState.players[nextPlayerId].name}'s turn.`
    );
  }

  socket.on("endTurn", () => {
    if (!isPlayersTurn(socket.id)) return;
    if (gameState.phase === "MAIN_GAME" && !gameState.hasRolled) {
      socket.emit(
        "logMessage",
        "You must roll the dice before ending your turn."
      );
      return;
    }
    if (gameState.phase.startsWith("SETUP")) {
      socket.emit("logMessage", "You cannot manually end turn during setup.");
      return;
    }

    handleEndTurn();
  });

  // Handle a player trying to build a settlement
  socket.on("buildNode", (data) => {
    if (!isPlayersTurn(socket.id)) {
      socket.emit("logMessage", "Not your turn!");
      return;
    }

    const isSetup = gameState.phase.startsWith("SETUP");

    if (!isSetup && !gameState.hasRolled) {
      socket.emit("logMessage", "You must roll the dice first.");
      return;
    }

    const vertexId = data.vertexId;
    const player = gameState.players[socket.id];

    if (
      !isSetup &&
      !Shared.canAfford(player.resources, Shared.COSTS.settlement)
    ) {
      socket.emit("logMessage", "Not enough resources to build settlement.");
      return;
    }

    if (player.supply.settlements <= 0) {
      socket.emit("logMessage", "No settlements left in supply.");
      return;
    }

    if (isSetup && gameState.setupItemsPlaced.settlement) {
      socket.emit("logMessage", "You already placed a settlement this turn.");
      return;
    }

    // Check if spot is taken
    const isTaken = gameState.buildings.some((b) => b.vertexId === vertexId);
    if (isTaken) return;

    // Distance Rule: Check adjacent vertices
    const neighbors = Shared.getAdjacentVertices(vertexId);
    const isTooClose = neighbors.some((neighborId) =>
      gameState.buildings.some((b) => b.vertexId === neighborId)
    );
    if (isTooClose) return;

    // Deduct resources
    if (!isSetup) {
      for (let r in Shared.COSTS.settlement) {
        player.resources[r] -= Shared.COSTS.settlement[r];
      }
    }

    player.supply.settlements--;

    // In a full game, you would check resources here first
    const building = {
      vertexId: vertexId,
      color: gameState.players[socket.id].color,
      owner: socket.id,
      type: "settlement",
    };
    gameState.buildings.push(building);

    player.victoryPoints += 1;

    if (isSetup) {
      gameState.setupItemsPlaced.settlement = true;
      // Give resources for second settlement (standard rule)
      if (gameState.phase === "SETUP_ROUND_2") {
        // Find adjacent hexes and give 1 of each resource
        // Check all hexes and see if this vertex is one of their corners
        const adjacentHexes = new Set();

        gameState.board.forEach((hex) => {
          for (let i = 0; i < 6; i++) {
            const vId = Shared.getCanonicalVertex(hex.q, hex.r, i);
            if (vId === vertexId && hex.resource !== "desert") {
              adjacentHexes.add(hex);
              break;
            }
          }
        });

        // Give 1 of each adjacent resource
        adjacentHexes.forEach((hex) => {
          if (hex.resource && hex.resource !== "desert") {
            player.resources[hex.resource] =
              (player.resources[hex.resource] || 0) + 1;
            io.emit(
              "logMessage",
              `${player.name} received 1 ${hex.resource} from initial placement`
            );
          }
        });
      }
    }

    // Tell everyone to update their board
    io.emit("buildingPlaced", building);
    if (!isSetup) updateLongestRoads();
    checkWinCondition(socket.id);
    io.emit("playerUpdate", gameState.players);

    if (
      isSetup &&
      gameState.setupItemsPlaced.settlement &&
      gameState.setupItemsPlaced.road
    ) {
      handleEndTurn();
    }
  });

  socket.on("buildCity", (data) => {
    if (!isPlayersTurn(socket.id)) return;
    if (!gameState.hasRolled) return;

    const vertexId = data.vertexId;
    const player = gameState.players[socket.id];

    // Check if player has a settlement there
    const building = gameState.buildings.find((b) => b.vertexId === vertexId);
    if (!building) return;
    if (building.owner !== socket.id) return;
    if (building.type === "city") return;

    if (player.supply.cities <= 0) {
      socket.emit("logMessage", "No cities left in supply.");
      return;
    }

    if (!Shared.canAfford(player.resources, Shared.COSTS.city)) {
      socket.emit("logMessage", "Not enough resources to upgrade to City.");
      return;
    }

    // Deduct resources
    for (let r in Shared.COSTS.city) {
      player.resources[r] -= Shared.COSTS.city[r];
    }

    // Upgrade
    building.type = "city";
    player.supply.cities--;
    player.supply.settlements++;
    player.victoryPoints += 1; // Settlement was 1, City is 2. So +1.

    io.emit("buildingPlaced", building); // Re-emit to update type
    checkWinCondition(socket.id);
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("buildRoad", (data) => {
    if (!isPlayersTurn(socket.id)) {
      socket.emit("logMessage", "Not your turn!");
      return;
    }

    const isSetup = gameState.phase.startsWith("SETUP");

    if (!isSetup && !gameState.hasRolled) {
      socket.emit("logMessage", "You must roll the dice first.");
      return;
    }

    const edgeId = data.edgeId;
    const player = gameState.players[socket.id];

    // Check affordability
    if (!isSetup) {
      if (player.freeRoads > 0) {
        // OK
      } else {
        if (!Shared.canAfford(player.resources, Shared.COSTS.road)) {
          socket.emit("logMessage", "Not enough resources to build road.");
          return;
        }
      }
    }

    if (player.supply.roads <= 0) {
      socket.emit("logMessage", "No roads left in supply.");
      return;
    }

    if (isSetup && gameState.setupItemsPlaced.road) {
      socket.emit("logMessage", "You already placed a road this turn.");
      return;
    }

    // Check if taken
    if (gameState.roads.some((r) => r.edgeId === edgeId)) return;

    // Check connectivity
    // In setup, road must connect to the settlement just placed?
    // Or just any settlement owned by player.
    // Standard rule: Must connect to your own settlement/road.
    // In setup, usually you place settlement then road attached to it.
    if (!Shared.hasConnectedInfrastructure(edgeId, socket.id, gameState)) {
      // In setup, we might need looser rules or ensure they place near the settlement.
      // But hasConnectedInfrastructure checks for adjacent buildings owned by player, so it should work
      // IF they placed settlement first.
      return;
    }

    // Deduct resources
    if (!isSetup) {
      if (player.freeRoads > 0) {
        player.freeRoads--;
      } else {
        for (let r in Shared.COSTS.road) {
          player.resources[r] -= Shared.COSTS.road[r];
        }
      }
    }

    player.supply.roads--;

    const road = {
      edgeId: edgeId,
      color: gameState.players[socket.id].color,
      owner: socket.id,
    };
    gameState.roads.push(road);

    if (isSetup) {
      gameState.setupItemsPlaced.road = true;
    }

    // Check Longest Road
    if (!isSetup) {
      updateLongestRoads();
    }

    io.emit("roadPlaced", road);
    io.emit("playerUpdate", gameState.players);

    if (
      isSetup &&
      gameState.setupItemsPlaced.settlement &&
      gameState.setupItemsPlaced.road
    ) {
      handleEndTurn();
    }
  });

  socket.on("bankTrade", (data) => {
    if (!isPlayersTurn(socket.id)) return;
    const player = gameState.players[socket.id];

    const ratio = Shared.getPlayerTradeRatio(socket.id, data.give, gameState);

    if ((player.resources[data.give] || 0) < ratio) {
      socket.emit("logMessage", `Not enough resources (need ${ratio}).`);
      return;
    }

    player.resources[data.give] -= ratio;
    player.resources[data.get] = (player.resources[data.get] || 0) + 1;

    io.emit(
      "logMessage",
      `${player.name} traded ${ratio} ${data.give} for 1 ${data.get} with the bank.`
    );
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("discardResources", (data) => {
    if (gameState.phase !== "DISCARD_PHASE") return;
    if (!gameState.pendingDiscards.includes(socket.id)) return;

    const player = gameState.players[socket.id];
    const toDiscard = data.resources; // { wood: 1, ... }

    // Validate count
    const totalDiscarded = Object.values(toDiscard).reduce((a, b) => a + b, 0);
    const currentTotal = Object.values(player.resources).reduce(
      (a, b) => a + b,
      0
    );
    const required = Math.floor(currentTotal / 2); // Wait, currentTotal is BEFORE discard?
    // Actually we should have stored the required amount or check it again.
    // But since we are in the handler, let's just trust the client is trying to discard correctly OR re-calc.
    // Re-calc is safer but complex if state changed. State shouldn't change in DISCARD_PHASE.

    // Let's just apply it and remove from pending.
    for (let r in toDiscard) {
      if (player.resources[r] >= toDiscard[r]) {
        player.resources[r] -= toDiscard[r];
      }
    }

    gameState.pendingDiscards = gameState.pendingDiscards.filter(
      (id) => id !== socket.id
    );
    io.emit("logMessage", `${player.name} discarded resources.`);

    if (gameState.pendingDiscards.length === 0) {
      gameState.phase = "ROBBER_PLACEMENT";
      io.emit("logMessage", "All discards complete. Move The Gypsy!");
      io.emit("init", gameState);
    }
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("rollDice", () => {
    if (gameState.phase !== "MAIN_GAME") return;

    if (!isPlayersTurn(socket.id)) {
      socket.emit("logMessage", "Not your turn!");
      return;
    }
    if (gameState.hasRolled) {
      socket.emit("logMessage", "You have already rolled.");
      return;
    }

    gameState.hasRolled = true;

    const roll =
      Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
    io.emit("diceRolled", roll);
    io.emit("logMessage", `Player rolled a ${roll}`);

    if (roll === 7) {
      io.emit(
        "logMessage",
        "THE GYPSY ACTIVATED! Players with > 7 cards must discard half."
      );

      gameState.pendingDiscards = [];

      for (let pid in gameState.players) {
        const p = gameState.players[pid];
        const total = Object.values(p.resources).reduce((a, b) => a + b, 0);
        if (total > 7) {
          gameState.pendingDiscards.push(pid);
          const count = Math.floor(total / 2);
          io.to(pid).emit("requestDiscard", { count });
        }
      }

      if (gameState.pendingDiscards.length > 0) {
        gameState.phase = "DISCARD_PHASE";
        io.emit("logMessage", "Waiting for discards...");
      } else {
        gameState.phase = "ROBBER_PLACEMENT";
        io.emit("logMessage", "Move The Gypsy!");
      }

      io.emit("init", gameState);
      io.emit("playerUpdate", gameState.players);
      return;
    }

    // Distribute resources
    const matchingHexes = gameState.board.filter(
      (h) =>
        h.number === roll &&
        h.resource !== "desert" &&
        (h.q !== gameState.gypsy.q || h.r !== gameState.gypsy.r)
    );

    matchingHexes.forEach((hex) => {
      // Get all 6 vertices of this hex
      for (let i = 0; i < 6; i++) {
        const vertexId = Shared.getCanonicalVertex(hex.q, hex.r, i);

        // Check if anyone has a building here
        const building = gameState.buildings.find(
          (b) => b.vertexId === vertexId
        );
        if (building) {
          const owner = gameState.players[building.owner];
          if (owner) {
            const amount = building.type === "city" ? 2 : 1;
            owner.resources[hex.resource] =
              (owner.resources[hex.resource] || 0) + amount;
            io.emit(
              "logMessage",
              `${owner.name} received ${amount} ${hex.resource}`
            );
          }
        }
      }
    });

    io.emit("init", gameState); // Sync state (hasRolled changed)
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("offerTrade", (data) => {
    const player = gameState.players[socket.id];
    // Validate offer content
    if (!data.offer || !data.request) return;

    if (!Shared.canAfford(player.resources, data.offer)) {
      socket.emit("logMessage", "You don't have the resources to offer.");
      return;
    }

    const offerId = Date.now().toString();
    gameState.activeOffers.push({
      id: offerId,
      from: socket.id,
      offer: data.offer,
      request: data.request,
    });

    io.emit("logMessage", `${player.name} posted a trade offer.`);
    io.emit("init", gameState);
  });

  socket.on("acceptTrade", (data) => {
    const offerId = data.offerId;
    const offerIndex = gameState.activeOffers.findIndex(
      (o) => o.id === offerId
    );
    if (offerIndex === -1) return;

    const offer = gameState.activeOffers[offerIndex];
    const sender = gameState.players[offer.from];
    const receiver = gameState.players[socket.id];

    if (socket.id === offer.from) return;

    if (!Shared.canAfford(sender.resources, offer.offer)) {
      socket.emit("logMessage", "Sender no longer has resources.");
      gameState.activeOffers.splice(offerIndex, 1);
      io.emit("init", gameState);
      return;
    }

    if (!Shared.canAfford(receiver.resources, offer.request)) {
      socket.emit("logMessage", "You don't have the resources to accept.");
      return;
    }

    // Execute Trade
    for (let r in offer.offer) {
      sender.resources[r] = (sender.resources[r] || 0) - offer.offer[r];
      receiver.resources[r] = (receiver.resources[r] || 0) + offer.offer[r];
    }
    for (let r in offer.request) {
      receiver.resources[r] = (receiver.resources[r] || 0) - offer.request[r];
      sender.resources[r] = (sender.resources[r] || 0) + offer.request[r];
    }

    gameState.activeOffers.splice(offerIndex, 1);

    io.emit("logMessage", "Trade completed!");
    io.emit("playerUpdate", gameState.players);
    io.emit("init", gameState);
  });

  socket.on("cancelOffer", (data) => {
    const offerIndex = gameState.activeOffers.findIndex(
      (o) => o.id === data.offerId
    );
    if (
      offerIndex !== -1 &&
      gameState.activeOffers[offerIndex].from === socket.id
    ) {
      gameState.activeOffers.splice(offerIndex, 1);
      io.emit("init", gameState);
    }
  });

  socket.on("buyDevCard", () => {
    if (!isPlayersTurn(socket.id)) return;
    if (!gameState.hasRolled) return;

    const player = gameState.players[socket.id];
    if (!Shared.canAfford(player.resources, Shared.COSTS.devCard)) {
      socket.emit("logMessage", "Not enough resources for Dev Card.");
      return;
    }

    // Deduct
    for (let r in Shared.COSTS.devCard) {
      player.resources[r] -= Shared.COSTS.devCard[r];
    }

    if (!gameState.deck || gameState.deck.length === 0) {
      socket.emit("logMessage", "No Dev Cards left.");
      return;
    }

    // Draw from deck
    const type = gameState.deck.pop();

    player.devCards.push({ type: type, boughtTurn: gameState.turnCount });

    if (type === "vp") {
      player.victoryPoints += 1;
      checkWinCondition(socket.id);
    }

    io.emit("logMessage", `${player.name} bought a Development Card.`);
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("playDevCard", (data) => {
    if (!isPlayersTurn(socket.id)) return;
    if (gameState.hasPlayedDevCard) {
      socket.emit("logMessage", "You can only play one Dev Card per turn.");
      return;
    }

    const player = gameState.players[socket.id];
    // data.type is just the string name, but we store objects now.
    // We need to find a card of that type that wasn't bought this turn.

    const cardIndex = player.devCards.findIndex(
      (c) => c.type === data.type && c.boughtTurn !== gameState.turnCount
    );

    if (cardIndex === -1) {
      socket.emit(
        "logMessage",
        "Cannot play this card (bought this turn or don't have it)."
      );
      return;
    }

    // Mark as played
    gameState.hasPlayedDevCard = true;

    // Remove card (except VP which are kept? Usually VP are hidden until end. Here we just added VP on buy)
    // If Knight
    if (data.type === "knight") {
      player.devCards.splice(cardIndex, 1);
      io.emit("logMessage", `${player.name} played a Knight!`);

      player.armySize = (player.armySize || 0) + 1;
      updateLargestArmy();

      // Knight allows moving The Gypsy
      gameState.phase = "ROBBER_PLACEMENT";
      io.emit("logMessage", "Move The Gypsy!");
      io.emit("init", gameState);
    } else if (data.type === "yearOfPlenty") {
      player.devCards.splice(cardIndex, 1);
      player.resources[data.res1] = (player.resources[data.res1] || 0) + 1;
      player.resources[data.res2] = (player.resources[data.res2] || 0) + 1;
      io.emit("logMessage", `${player.name} played Year of Plenty.`);
    } else if (data.type === "monopoly") {
      player.devCards.splice(cardIndex, 1);
      const res = data.resource;
      let totalStolen = 0;
      for (let pid in gameState.players) {
        if (pid === socket.id) continue;
        const victim = gameState.players[pid];
        const amount = victim.resources[res] || 0;
        if (amount > 0) {
          victim.resources[res] = 0;
          totalStolen += amount;
        }
      }
      player.resources[res] = (player.resources[res] || 0) + totalStolen;
      io.emit(
        "logMessage",
        `${player.name} played Monopoly on ${res} and got ${totalStolen}!`
      );
    } else if (data.type === "roadBuilding") {
      player.devCards.splice(cardIndex, 1);
      player.freeRoads = 2;
      io.emit(
        "logMessage",
        `${player.name} played Road Building (2 free roads).`
      );
    }

    io.emit("playerUpdate", gameState.players);
  });

  socket.on("moveGypsy", (data) => {
    if (!isPlayersTurn(socket.id)) return;
    if (gameState.phase !== "ROBBER_PLACEMENT") return;

    gameState.gypsy = { q: data.q, r: data.r };
    gameState.phase = "MAIN_GAME";

    // Steal logic
    const victims = [];
    for (let i = 0; i < 6; i++) {
      const vId = Shared.getCanonicalVertex(data.q, data.r, i);
      const b = gameState.buildings.find((b) => b.vertexId === vId);
      if (b && b.owner !== socket.id) {
        if (!victims.includes(b.owner)) victims.push(b.owner);
      }
    }

    if (victims.length > 0) {
      // In a real game, user chooses victim if multiple. Here we pick random.
      const victimId = victims[Math.floor(Math.random() * victims.length)];
      const victim = gameState.players[victimId];
      const thief = gameState.players[socket.id];

      const available = [];
      for (let r in victim.resources) {
        if (victim.resources[r] > 0) available.push(r);
      }

      if (available.length > 0) {
        const res = available[Math.floor(Math.random() * available.length)];
        victim.resources[res]--;
        thief.resources[res]++;
        io.emit("logMessage", `${thief.name} stole 1 card from ${victim.name}`);
      } else {
        io.emit(
          "logMessage",
          `${thief.name} tried to steal from ${victim.name} but they had nothing!`
        );
      }
    }

    io.emit("init", gameState);
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("resetGame", () => {
    gameState.board = [];
    gameState.buildings = [];
    gameState.roads = [];
    gameState.activeOffers = [];
    gameState.gypsy = { q: 0, r: 0 };
    gameState.largestArmy = { owner: null, size: 0 };
    gameState.longestRoad = { owner: null, length: 0 };
    gameState.setupItemsPlaced = { settlement: false, road: false };
    gameState.turnCount = 0;
    gameState.hasPlayedDevCard = false;
    gameState.pendingDiscards = [];
    gameState.ports = [];
    gameState.phase = "WAITING_FOR_PLAYERS";
    gameState.turnOrder = [];
    gameState.currentTurnIndex = 0;
    gameState.hasRolled = false;

    // Keep existing players but reset their states
    for (let pid in gameState.players) {
      const p = gameState.players[pid];
      p.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
      p.victoryPoints = 0;
      p.devCards = [];
      p.armySize = 0;
      p.freeRoads = 0;
      p.supply = { settlements: 5, cities: 4, roads: 15 };
      p.hasLongestRoad = false;
      p.hasLargestArmy = false;
    }

    initBoard();

    io.emit("init", gameState);
    io.emit("playerUpdate", gameState.players);
    io.emit("logMessage", "Game Reset!");
  });

  socket.on("disconnect", () => {
    delete gameState.players[socket.id];
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("chatMessage", (data) => {
    const player = gameState.players[socket.id];
    if (player && data.message) {
      const chatData = {
        name: player.name,
        color: player.color,
        message: data.message,
      };
      io.emit("chatMessage", chatData);
    }
  });

  // DEV BACKDOOR
  socket.on("dev_force_resource", (data) => {
    const player = gameState.players[socket.id];
    if (player) {
      player.resources = data.resources;
      io.emit("playerUpdate", gameState.players);
      io.emit("logMessage", `[DEV] ${player.name} resources forced.`);
    }
  });

  socket.on("dev_force_roll", (data) => {
    if (gameState.phase !== "MAIN_GAME") return;
    if (!isPlayersTurn(socket.id)) return;

    gameState.hasRolled = true;
    const roll = data.roll;
    io.emit("diceRolled", roll);
    io.emit("logMessage", `[DEV] Player rolled a ${roll}`);

    if (roll === 7) {
      io.emit("logMessage", "THE GYPSY ACTIVATED! (Forced)");
      gameState.pendingDiscards = [];
      for (let pid in gameState.players) {
        const p = gameState.players[pid];
        const total = Object.values(p.resources).reduce((a, b) => a + b, 0);
        if (total > 7) {
          gameState.pendingDiscards.push(pid);
          const count = Math.floor(total / 2);
          io.to(pid).emit("requestDiscard", { count });
        }
      }
      if (gameState.pendingDiscards.length > 0) {
        gameState.phase = "DISCARD_PHASE";
        io.emit("logMessage", "Waiting for discards...");
      } else {
        gameState.phase = "ROBBER_PLACEMENT";
        io.emit("logMessage", "Move The Gypsy!");
      }
      io.emit("init", gameState);
      io.emit("playerUpdate", gameState.players);
    }
  });

  socket.on("dev_grant_building", (data) => {
    const player = gameState.players[socket.id];
    const building = {
      vertexId: data.vertexId,
      color: player.color,
      owner: socket.id,
      type: data.type || "settlement",
    };
    gameState.buildings.push(building);
    player.victoryPoints += building.type === "city" ? 2 : 1;
    io.emit("buildingPlaced", building);
    io.emit("playerUpdate", gameState.players);
    checkWinCondition(socket.id);
  });

  socket.on("dev_give_dev_card", (data) => {
    const player = gameState.players[socket.id];
    player.devCards.push({ type: data.cardType, played: false });
    if (data.cardType === "vp") {
      player.victoryPoints++;
    }
    io.emit("playerUpdate", gameState.players);
    checkWinCondition(socket.id);
  });

  socket.on("disconnect", () => {
    delete gameState.players[socket.id];
    io.emit("playerUpdate", gameState.players);
  });

  socket.on("chatMessage", (data) => {
    const player = gameState.players[socket.id];
    if (player && data.message) {
      const chatData = {
        name: player.name,
        color: player.color,
        message: data.message,
      };
      io.emit("chatMessage", chatData);
    }
  });
});

function updateLongestRoads() {
  let changed = false;

  // Calculate lengths for all players
  const lengths = {};
  for (let pid in gameState.players) {
    lengths[pid] = Shared.calculateLongestRoad(
      pid,
      gameState.roads,
      gameState.buildings
    );
  }

  // Check if current owner lost it (dropped below 5)
  if (gameState.longestRoad.owner) {
    const ownerLen = lengths[gameState.longestRoad.owner];
    if (ownerLen < Shared.LIMITS.MIN_LONGEST_ROAD) {
      gameState.players[gameState.longestRoad.owner].victoryPoints -= 2;
      gameState.players[gameState.longestRoad.owner].hasLongestRoad = false;
      gameState.longestRoad = { owner: null, length: 0 };
      io.emit("logMessage", `Longest Road lost (below limit)!`);
      changed = true;
    } else {
      // Update stored length
      if (gameState.longestRoad.length !== ownerLen) {
        gameState.longestRoad.length = ownerLen;
        changed = true;
      }
    }
  }

  // Find candidate for longest road
  let bestPid = null;
  let bestLen = 0;

  for (let pid in lengths) {
    if (lengths[pid] >= Shared.LIMITS.MIN_LONGEST_ROAD) {
      if (lengths[pid] > bestLen) {
        bestLen = lengths[pid];
        bestPid = pid;
      }
    }
  }

  // Transfer logic
  if (bestPid) {
    const currentOwner = gameState.longestRoad.owner;
    const currentLen = currentOwner ? lengths[currentOwner] : 0;

    if (bestPid !== currentOwner && bestLen > currentLen) {
      if (currentOwner) {
        gameState.players[currentOwner].victoryPoints -= 2;
        gameState.players[currentOwner].hasLongestRoad = false;
      }
      gameState.longestRoad = { owner: bestPid, length: bestLen };
      gameState.players[bestPid].victoryPoints += 2;
      gameState.players[bestPid].hasLongestRoad = true;
      io.emit(
        "logMessage",
        `${gameState.players[bestPid].name} took Longest Road (${bestLen})!`
      );
      checkWinCondition(bestPid);
      changed = true;
    }
  }

  if (changed) io.emit("playerUpdate", gameState.players);
}

function updateLargestArmy() {
  let changed = false;
  let maxArmy = 0;
  let maxPid = null;

  for (let pid in gameState.players) {
    const size = gameState.players[pid].armySize || 0;
    if (size >= Shared.LIMITS.MIN_LARGEST_ARMY) {
      if (size > maxArmy) {
        maxArmy = size;
        maxPid = pid;
      }
    }
  }

  if (maxPid) {
    const currentOwner = gameState.largestArmy.owner;
    const currentSize = gameState.largestArmy.size;

    if (maxPid !== currentOwner && maxArmy > currentSize) {
      if (currentOwner) {
        gameState.players[currentOwner].victoryPoints -= 2;
        gameState.players[currentOwner].hasLargestArmy = false;
      }
      gameState.largestArmy = { owner: maxPid, size: maxArmy };
      gameState.players[maxPid].victoryPoints += 2;
      gameState.players[maxPid].hasLargestArmy = true;
      io.emit(
        "logMessage",
        `${gameState.players[maxPid].name} took Largest Army (${maxArmy})!`
      );
      checkWinCondition(maxPid);
      changed = true;
    } else if (maxPid === currentOwner && maxArmy !== currentSize) {
      gameState.largestArmy.size = maxArmy;
      changed = true;
    }
  }

  if (changed) io.emit("playerUpdate", gameState.players);
}

http.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
