/**
 * End-to-End Test for Chigga Land (Catan Clone)
 * Tests full gameplay with 5 simulated players
 */

const { spawn } = require("child_process");
const io = require("socket.io-client");
const Shared = require("./public/shared.js");
const http = require("http");

const SERVER_URL = "http://localhost:3000";
const NUM_PLAYERS = 5;
const PLAYER_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve"];

// Predefined valid positions
const SETUP_POSITIONS_R1 = [
  { q: 0, r: -2, d: 0, roadD: 0 },
  { q: 2, r: -2, d: 0, roadD: 0 },
  { q: 2, r: 0, d: 0, roadD: 0 },
  { q: 0, r: 2, d: 0, roadD: 0 },
  { q: -2, r: 0, d: 0, roadD: 0 },
];

const SETUP_POSITIONS_R2 = [
  { q: 1, r: -1, d: 0, roadD: 0 },
  { q: 1, r: 0, d: 0, roadD: 0 },
  { q: 0, r: 1, d: 0, roadD: 0 },
  { q: -1, r: 1, d: 0, roadD: 0 },
  { q: -1, r: 0, d: 0, roadD: 0 },
];

class TestClient {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    this.socket = null;
    this.gameState = null;
    this.playerId = null;
    this.resources = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    this.buildings = [];
    this.roads = [];
    this.logCount = 0;
  }

  connect() {
    return new Promise((resolve) => {
      this.socket = io(SERVER_URL, {
        autoConnect: true,
        query: {},
        forceNew: true,
      });

      this.socket.on("connect", () => {
        this.playerId = this.socket.id;
        console.log(`[${this.name}] Connected with ID: ${this.playerId}`);
        this.socket.emit("joinGame", { name: this.name });
        setTimeout(resolve, 100);
      });

      this.socket.on("init", (state) => {
        this.gameState = state;
      });

      this.socket.on("playerUpdate", (players) => {
        if (players[this.playerId]) {
          this.resources = players[this.playerId].resources;
        }
      });

      this.socket.on("buildingPlaced", (building) => {
        if (building.owner === this.playerId) {
          this.buildings.push(building);
        }
      });

      this.socket.on("roadPlaced", (road) => {
        if (road.owner === this.playerId) {
          this.roads.push(road);
        }
      });

      this.socket.on("logMessage", (msg) => {
        if (this.index === 0 && msg.includes("Error")) {
          console.log(`[LOG] ${msg}`);
        }
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }

  isMyTurn() {
    if (!this.gameState) return false;
    const currentPlayerId =
      this.gameState.turnOrder[this.gameState.currentTurnIndex];
    return currentPlayerId === this.playerId;
  }

  async placeSetupBuilding(vertexId) {
    return new Promise((resolve) => {
      this.socket.emit("buildNode", { vertexId });
      setTimeout(resolve, 500);
    });
  }

  async placeSetupRoad(edgeId) {
    return new Promise((resolve) => {
      const initialTurnIndex = this.gameState
        ? this.gameState.currentTurnIndex
        : -1;
      this.socket.emit("buildRoad", { edgeId });

      // Wait for turn to actually change
      let attempts = 0;
      const checkTurn = () => {
        attempts++;
        if (attempts > 50) {
          // 5 seconds
          console.log(
            `    [${this.name}] Warning: Turn didn't change after road placement`
          );
          resolve();
          return;
        }

        if (
          this.gameState &&
          this.gameState.currentTurnIndex !== initialTurnIndex
        ) {
          resolve();
        } else {
          setTimeout(checkTurn, 100);
        }
      };
      setTimeout(checkTurn, 200);
    });
  }

  async rollDice() {
    return new Promise((resolve) => {
      this.socket.emit("rollDice");
      setTimeout(resolve, 200);
    });
  }

  async endTurn() {
    return new Promise((resolve) => {
      this.socket.emit("endTurn");
      setTimeout(resolve, 200);
    });
  }

  async buildRoad(edgeId) {
    return new Promise((resolve) => {
      this.socket.emit("buildRoad", { edgeId });
      setTimeout(resolve, 200);
    });
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer() {
  console.log("Waiting for server to be ready...");
  for (let i = 0; i < 30; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(SERVER_URL, (res) => {
          if (res.statusCode === 200) resolve();
          else reject();
        });
        req.on("error", reject);
        req.end();
      });
      console.log("Server is ready!");
      return;
    } catch (e) {
      await sleep(500);
    }
  }
  throw new Error("Server failed to start");
}

async function runE2ETest() {
  console.log("\n========================================");
  console.log("Starting E2E Test: 5-Player Game");
  console.log("========================================\n");

  const clients = [];

  try {
    // Step 1: Connect all players
    console.log("STEP 1: Connecting 5 players...");
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const client = new TestClient(PLAYER_NAMES[i], i);
      await client.connect();
      clients.push(client);
      await sleep(100);
    }
    console.log("✓ All players connected\n");

    await sleep(500);

    // Step 2: Start the game (first player)
    console.log("STEP 2: Starting game...");
    clients[0].socket.emit("startGame");
    await sleep(1000);
    console.log("✓ Game started\n");

    // Step 3: Setup Phase - Round 1 (forward order)
    console.log("STEP 3: Setup Round 1 (Forward Order)...");

    for (let turnIdx = 0; turnIdx < NUM_PLAYERS; turnIdx++) {
      let currentClient = clients.find((c) => c.isMyTurn());
      if (!currentClient) {
        await sleep(1000);
        currentClient = clients.find((c) => c.isMyTurn());
      }

      if (!currentClient)
        throw new Error(`No client found for turn ${turnIdx}`);

      console.log(
        `  [${currentClient.name}] Placing initial settlement and road...`
      );

      const pos = SETUP_POSITIONS_R1[turnIdx];
      const settlementVertex = Shared.getCanonicalVertex(pos.q, pos.r, pos.d);
      await currentClient.placeSetupBuilding(settlementVertex);

      const roadEdge = Shared.getCanonicalEdge(pos.q, pos.r, pos.roadD);
      await currentClient.placeSetupRoad(roadEdge);

      await sleep(200);
    }
    console.log("✓ Setup Round 1 complete\n");

    // Step 4: Setup Phase - Round 2 (reverse order)
    console.log("STEP 4: Setup Round 2 (Reverse Order)...");

    for (let turnIdx = 0; turnIdx < NUM_PLAYERS; turnIdx++) {
      let currentClient = clients.find((c) => c.isMyTurn());
      if (!currentClient) {
        await sleep(1000);
        currentClient = clients.find((c) => c.isMyTurn());
      }

      if (!currentClient)
        throw new Error(`No client found for turn ${turnIdx} (Round 2)`);

      console.log(
        `  [${currentClient.name}] Placing second settlement and road...`
      );

      const pos = SETUP_POSITIONS_R2[currentClient.index];
      const settlementVertex = Shared.getCanonicalVertex(pos.q, pos.r, pos.d);
      await currentClient.placeSetupBuilding(settlementVertex);

      const roadEdge = Shared.getCanonicalEdge(pos.q, pos.r, pos.roadD);
      await currentClient.placeSetupRoad(roadEdge);

      await sleep(200);
    }
    console.log("✓ Setup Round 2 complete\n");

    // Step 5: Main game
    console.log("STEP 5: Main Game Phase (15 turns)...");

    let turnCount = 0;
    const maxTurns = 15;

    while (turnCount < maxTurns) {
      let currentClient = clients.find((c) => c.isMyTurn());
      if (!currentClient) {
        await sleep(500);
        currentClient = clients.find((c) => c.isMyTurn());
      }
      if (!currentClient) break;

      if (currentClient.gameState.phase !== "MAIN_GAME") break;

      console.log(`  Turn ${turnCount + 1}: ${currentClient.name}`);

      await currentClient.rollDice();
      await sleep(200);

      // Try to build road if possible
      if (
        currentClient.resources.wood >= 1 &&
        currentClient.resources.brick >= 1
      ) {
        const existingRoad = currentClient.roads[0];
        if (existingRoad) {
          const vertices = Shared.getVerticesOfEdge(existingRoad.edgeId);
          for (let v of vertices) {
            const edges = Shared.getEdgesOfVertex(v);
            for (let e of edges) {
              if (!currentClient.gameState.roads.find((r) => r.edgeId === e)) {
                await currentClient.buildRoad(e);
                break;
              }
            }
          }
        }
      }

      await currentClient.endTurn();
      await sleep(200);
      turnCount++;
    }
    console.log(`✓ Completed ${turnCount} turns\n`);

    // Step 6: Verify
    console.log("STEP 6: Verifying game state...");
    let totalBuildings = 0;
    for (const client of clients) {
      const count = client.gameState.buildings.filter(
        (b) => b.owner === client.playerId
      ).length;
      totalBuildings += count;
      console.log(`  ${client.name}: ${count} buildings`);
    }

    if (totalBuildings >= 10) {
      console.log("✓ Setup buildings verified");
    } else {
      console.error("✗ Missing buildings!");
      process.exit(1);
    }
  } catch (err) {
    console.error("Test Failed:", err);
    process.exit(1);
  } finally {
    clients.forEach((c) => c.disconnect());
  }
}

// Main execution
const serverProcess = spawn("node", ["server.js"], {
  stdio: "inherit",
  detached: false,
});

serverProcess.on("error", (err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

waitForServer()
  .then(() => {
    return runE2ETest();
  })
  .then(() => {
    console.log("Test Passed!");
    serverProcess.kill();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    serverProcess.kill();
    process.exit(1);
  });
