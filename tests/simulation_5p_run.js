/**
 * Simulation 5-Player Run
 * Comprehensive E2E test for Chigga Land v3.2
 */

const { spawn } = require("child_process");
const io = require("socket.io-client");
const Shared = require("../public/shared.js");
const http = require("http");

const SERVER_URL = "http://localhost:3000";
const NUM_PLAYERS = 5;
const PLAYER_NAMES = ["P1", "P2", "P3", "P4", "P5"];

// Predefined valid positions
const SETUP_POSITIONS_R1 = [
  { q: 0, r: -2, d: 0, roadD: 0 }, // P1
  { q: 2, r: -2, d: 0, roadD: 0 }, // P2
  { q: 2, r: 0, d: 0, roadD: 0 }, // P3
  { q: 0, r: 2, d: 0, roadD: 0 }, // P4
  { q: -2, r: 0, d: 0, roadD: 0 }, // P5
];

const SETUP_POSITIONS_R2 = [
  { q: 1, r: -1, d: 0, roadD: 0 }, // P1
  { q: 1, r: 0, d: 0, roadD: 0 }, // P2
  { q: 0, r: 1, d: 0, roadD: 0 }, // P3
  { q: -1, r: 1, d: 0, roadD: 0 }, // P4
  { q: -1, r: 0, d: 0, roadD: 0 }, // P5
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
        this.socket.emit("joinGame", { name: this.name });
        setTimeout(resolve, 100);
      });

      this.socket.on("init", (state) => {
        this.gameState = state;
      });

      this.socket.on("playerUpdate", (players) => {
        if (this.gameState) {
          this.gameState.players = players;
        }
        if (players[this.playerId]) {
          this.resources = players[this.playerId].resources;
        }
      });

      this.socket.on("buildingPlaced", (building) => {
        if (this.gameState) {
          const idx = this.gameState.buildings.findIndex(
            (b) => b.vertexId === building.vertexId
          );
          if (idx !== -1) {
            this.gameState.buildings[idx] = building;
          } else {
            this.gameState.buildings.push(building);
          }
        }
        if (building.owner === this.playerId) {
          this.buildings.push(building);
        }
      });

      this.socket.on("roadPlaced", (road) => {
        if (this.gameState) {
          this.gameState.roads.push(road);
        }
        if (road.owner === this.playerId) {
          this.roads.push(road);
        }
      });

      this.socket.on("requestDiscard", (data) => {
        console.log(`[${this.name}] Requested to discard ${data.count} cards`);
        const toDiscard = { wood: data.count };
        this.socket.emit("discardResources", { resources: toDiscard });
      });

      this.socket.on("gameOver", (data) => {
        console.log(`\x1b[32m[GAME OVER] Winner: ${data.winner}\x1b[0m`);
      });
    });
  }

  disconnect() {
    if (this.socket) this.socket.disconnect();
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
      setTimeout(resolve, 200);
    });
  }

  async placeSetupRoad(edgeId) {
    return new Promise((resolve) => {
      this.socket.emit("buildRoad", { edgeId });
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
      return;
    } catch (e) {
      await sleep(500);
    }
  }
  throw new Error("Server failed to start");
}

async function runSimulation() {
  console.log("\x1b[36m%s\x1b[0m", "Starting Simulation 5-Player Run...");

  const clients = [];

  try {
    // 1. Setup
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const client = new TestClient(PLAYER_NAMES[i], i);
      await client.connect();
      clients.push(client);
    }
    console.log("\x1b[32m%s\x1b[0m", "[SUCCESS] 5 Players Connected");

    await sleep(500);
    clients[0].socket.emit("startGame", { noShuffle: true });
    await sleep(1000);

    // Snake Draft
    // Round 1
    for (let i = 0; i < NUM_PLAYERS; i++) {
      const client = clients[i];
      while (!client.isMyTurn()) await sleep(100);

      const pos = SETUP_POSITIONS_R1[i];
      await client.placeSetupBuilding(
        Shared.getCanonicalVertex(pos.q, pos.r, pos.d)
      );
      await client.placeSetupRoad(
        Shared.getCanonicalEdge(pos.q, pos.r, pos.roadD)
      );
    }

    // Round 2 (Reverse)
    for (let i = NUM_PLAYERS - 1; i >= 0; i--) {
      const client = clients[i];
      while (!client.isMyTurn()) await sleep(100);

      const pos = SETUP_POSITIONS_R2[i];
      await client.placeSetupBuilding(
        Shared.getCanonicalVertex(pos.q, pos.r, pos.d)
      );
      await client.placeSetupRoad(
        Shared.getCanonicalEdge(pos.q, pos.r, pos.roadD)
      );
    }

    console.log(
      "\x1b[32m%s\x1b[0m",
      "[SUCCESS] Snake Draft completed for 5 players"
    );

    await sleep(500);
    if (clients[0].gameState.phase === "MAIN_GAME" && clients[0].isMyTurn()) {
      console.log(
        "\x1b[32m%s\x1b[0m",
        "[SUCCESS] Game transitioned to MAIN_GAME, P1 active"
      );
    } else {
      throw new Error("Game did not transition to MAIN_GAME correctly");
    }

    // Scenario A: Overstock & Robber
    console.log("\n--- Scenario A: Overstock & Robber ---");
    const p1 = clients[0];
    const p5 = clients[4];

    p1.socket.emit("dev_force_resource", {
      resources: { wood: 9, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    });
    await sleep(200);

    p1.socket.emit("dev_force_roll", { roll: 7 });
    await sleep(500);

    if (p1.resources.wood === 5) {
      console.log(
        "\x1b[32m%s\x1b[0m",
        "[SUCCESS] P1 discarded correctly (9 -> 5)"
      );
    } else {
      console.error(`[FAIL] P1 has ${p1.resources.wood} wood, expected 5`);
    }

    // Ensure P5 has something to steal
    p5.socket.emit("dev_force_resource", {
      resources: { sheep: 1, wood: 0, brick: 0, wheat: 0, ore: 0 },
    });
    await sleep(200);

    const targetHex = { q: -2, r: 0 };
    p1.socket.emit("moveGypsy", {
      q: targetHex.q,
      r: targetHex.r,
      victim: p5.playerId,
    });
    await sleep(500);

    console.log("\x1b[32m%s\x1b[0m", "[SUCCESS] Robber scenario executed");

    await p1.endTurn();
    await sleep(200);

    // Scenario B: Domestic Trading
    console.log("\n--- Scenario B: Domestic Trading ---");
    const p2 = clients[1];
    const p3 = clients[2];
    const p4 = clients[3];

    let attempts = 0;
    while (!p2.isMyTurn()) {
      attempts++;
      if (attempts > 50) {
        console.log("DEBUG: P2 GameState:", {
          phase: p2.gameState?.phase,
          currentTurnIndex: p2.gameState?.currentTurnIndex,
          turnOrder: p2.gameState?.turnOrder,
          myId: p2.playerId,
        });
        throw new Error("Timed out waiting for P2 turn");
      }
      await sleep(100);
    }

    p2.socket.emit("dev_force_resource", {
      resources: { brick: 1, wood: 0, sheep: 0, wheat: 0, ore: 0 },
    });
    p5.socket.emit("dev_force_resource", {
      resources: { wheat: 1, wood: 0, sheep: 0, brick: 0, ore: 0 },
    });
    await sleep(200);

    p2.socket.emit("dev_force_roll", { roll: 8 });
    await sleep(200);

    p2.socket.emit("offerTrade", {
      offer: { brick: 1 },
      request: { wheat: 1 },
    });
    await sleep(200);

    const offerId = p2.gameState.activeOffers[0].id;
    p5.socket.emit("acceptTrade", { offerId });
    await sleep(500);

    console.log("DEBUG: P2 Resources:", p2.resources);
    console.log("DEBUG: P5 Resources:", p5.resources);

    if (p2.resources.wheat === 1 && p5.resources.brick === 1) {
      console.log(
        "\x1b[32m%s\x1b[0m",
        "[SUCCESS] Trade completed: P2 got Wheat, P5 got Brick"
      );
    } else {
      console.error("[FAIL] Trade failed");
    }

    await p2.endTurn();
    await sleep(200);

    // Scenario C: Maritime Trading
    console.log("\n--- Scenario C: Maritime Trading ---");

    attempts = 0;
    while (!p3.isMyTurn()) {
      attempts++;
      if (attempts > 50) {
        console.log("DEBUG: P3 GameState:", {
          phase: p3.gameState?.phase,
          currentTurnIndex: p3.gameState?.currentTurnIndex,
          turnOrder: p3.gameState?.turnOrder,
          myId: p3.playerId,
        });
        throw new Error("Timed out waiting for P3 turn");
      }
      await sleep(100);
    }

    p3.socket.emit("dev_force_roll", { roll: 6 });
    await sleep(100);
    await p3.endTurn();

    attempts = 0;
    while (!p4.isMyTurn()) {
      attempts++;
      if (attempts > 50) {
        console.log("DEBUG: P4 GameState:", {
          phase: p4.gameState?.phase,
          currentTurnIndex: p4.gameState?.currentTurnIndex,
          turnOrder: p4.gameState?.turnOrder,
          myId: p4.playerId,
        });
        throw new Error("Timed out waiting for P4 turn");
      }
      await sleep(100);
    }

    const portVertex = Shared.getCanonicalVertex(1, -2, 1);
    p4.socket.emit("dev_grant_building", {
      vertexId: portVertex,
      type: "settlement",
    });
    await sleep(200);

    p4.socket.emit("dev_force_resource", {
      resources: { wood: 2, brick: 0, sheep: 0, wheat: 0, ore: 0 },
    });
    await sleep(200);

    p4.socket.emit("dev_force_roll", { roll: 5 });
    await sleep(100);

    p4.socket.emit("bankTrade", { give: "wood", get: "ore" });
    await sleep(500);

    console.log("DEBUG: P4 Resources:", p4.resources);

    if (p4.resources.ore === 1 && p4.resources.wood === 0) {
      console.log("\x1b[32m%s\x1b[0m", "[SUCCESS] Maritime Trade (2:1) worked");
    } else {
      console.error("[FAIL] Maritime Trade failed");
    }

    p4.socket.emit("dev_force_resource", {
      resources: { sheep: 2, ore: 1, wood: 0, brick: 0, wheat: 0 },
    });
    await sleep(100);
    p4.socket.emit("bankTrade", { give: "sheep", get: "wood" });
    await sleep(200);

    if (p4.resources.sheep === 2) {
      console.log(
        "\x1b[32m%s\x1b[0m",
        "[SUCCESS] Invalid trade rejected (2 Sheep without port)"
      );
    } else {
      console.error("[FAIL] Invalid trade accepted");
    }

    await p4.endTurn();
    await sleep(200);

    // Scenario D: Victory March
    console.log("\n--- Scenario D: Victory March ---");
    while (!p5.isMyTurn()) await sleep(100);
    p5.socket.emit("dev_force_roll", { roll: 4 });
    await sleep(100);
    await p5.endTurn();

    while (!p1.isMyTurn()) await sleep(100);

    // Enable full logging for P1
    p1.socket.on("logMessage", (msg) => console.log(`[P1 LOG] ${msg}`));

    p1.socket.emit("dev_force_resource", {
      resources: { wood: 20, brick: 20, sheep: 20, wheat: 20, ore: 20 },
    });
    await sleep(200);

    p1.socket.emit("dev_force_roll", { roll: 3 });
    await sleep(100);

    // Build 10 Roads (to ensure Longest Road >= 5)
    console.log("Building 10 roads...");
    const builtEdges = new Set();
    for (let i = 0; i < 10; i++) {
      const roads = p1.gameState.roads.filter((r) => r.owner === p1.playerId);
      let built = false;
      // Try to extend from the last built road first to encourage a line
      const sortedRoads = [...roads].reverse();

      for (let r of sortedRoads) {
        const vertices = Shared.getVerticesOfEdge(r.edgeId);
        for (let v of vertices) {
          const edges = Shared.getEdgesOfVertex(v);
          for (let e of edges) {
            if (
              !p1.gameState.roads.find((rd) => rd.edgeId === e) &&
              !builtEdges.has(e)
            ) {
              console.log(`Building road at ${e}`);
              await p1.buildRoad(e);
              builtEdges.add(e);
              built = true;
              break;
            }
          }
          if (built) break;
        }
        if (built) break;
      }
      await sleep(200);
    }

    // Upgrade 2 Settlements
    console.log("Upgrading 2 settlements...");
    const settlements = p1.gameState.buildings.filter(
      (b) => b.owner === p1.playerId && b.type === "settlement"
    );
    console.log(`Found ${settlements.length} settlements to upgrade`);
    for (let i = 0; i < 2 && i < settlements.length; i++) {
      console.log(`Upgrading settlement at ${settlements[i].vertexId}`);
      p1.socket.emit("buildCity", { vertexId: settlements[i].vertexId });
      await sleep(200);
    }

    // Build 2 new Settlements (via dev grant to avoid placement logic)
    console.log("Granting 2 new settlements...");
    const v1 = Shared.getCanonicalVertex(-2, 2, 0);
    const v2 = Shared.getCanonicalVertex(-2, 2, 2);
    p1.socket.emit("dev_grant_building", { vertexId: v1, type: "settlement" });
    await sleep(100);
    p1.socket.emit("dev_grant_building", { vertexId: v2, type: "settlement" });
    await sleep(200);

    // Buy 2 VP Cards
    console.log("Buying 2 VP cards...");
    p1.socket.emit("dev_give_dev_card", { cardType: "vp" });
    p1.socket.emit("dev_give_dev_card", { cardType: "vp" });
    await sleep(500);

    console.log(
      "DEBUG: P1 VP:",
      p1.gameState.players[p1.playerId].victoryPoints
    );
    console.log(
      "DEBUG: P1 Longest Road:",
      p1.gameState.players[p1.playerId].hasLongestRoad
    );
    console.log("DEBUG: Game Phase:", p1.gameState.phase);

    if (p1.gameState.phase === "GAME_OVER") {
      console.log(
        "\x1b[32m%s\x1b[0m",
        "[SUCCESS] Game Over triggered! P1 Wins!"
      );
    } else {
      console.log("[INFO] Game not over yet, checking VP...");
      // Maybe need to end turn?
      await p1.endTurn();
      await sleep(500);
      if (p1.gameState.phase === "GAME_OVER") {
        console.log(
          "\x1b[32m%s\x1b[0m",
          "[SUCCESS] Game Over triggered after end turn! P1 Wins!"
        );
      } else {
        console.error("[FAIL] Game Over not triggered");
      }
    }
  } catch (err) {
    console.error("\x1b[31m%s\x1b[0m", `[ERROR] ${err.message}`);
    process.exit(1);
  } finally {
    clients.forEach((c) => c.disconnect());
  }
}

const serverProcess = spawn("node", ["server.js"], { stdio: "inherit" });
waitForServer()
  .then(runSimulation)
  .then(() => {
    console.log("\x1b[32m%s\x1b[0m", "[SUCCESS] Simulation Complete");
    serverProcess.kill();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    serverProcess.kill();
    process.exit(1);
  });
