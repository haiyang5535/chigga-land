const token = localStorage.getItem('catan_token');
const socket = io({
    autoConnect: false,
    query: { token: token }
});

socket.on('token', (t) => localStorage.setItem('catan_token', t));

document.getElementById('joinGameBtn').addEventListener('click', () => {
    const name = document.getElementById('nicknameInput').value;
    if (!name) return alert("Please enter a name");
    
    document.getElementById('joinModal').style.display = 'none';
    socket.connect();
    // Wait for connection to emit join
    // Note: 'connect' event fires on reconnection too, so check if we already joined?
    // For simplicity, just emit. Server handles updates.
});

socket.on('connect', () => {
    const name = document.getElementById('nicknameInput').value;
    if(name) socket.emit('joinGame', { name });
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startGameBtn');
const rollBtn = document.getElementById('rollDiceBtn');
const endTurnBtn = document.getElementById('endTurnBtn');
const turnIndicator = document.getElementById('turnIndicator');
const logDiv = document.getElementById('gameLog');
const activeOffersDiv = document.getElementById('activeOffers');

// --- UI LISTENERS ---
startBtn.addEventListener('click', () => {
    console.log("Start Game button clicked");
    socket.emit('startGame');
});
endTurnBtn.addEventListener('click', () => socket.emit('endTurn'));
rollBtn.addEventListener('click', () => socket.emit('rollDice'));
document.getElementById('buyDevCardBtn').addEventListener('click', () => socket.emit('buyDevCard'));
document.getElementById('tradeBtn').addEventListener('click', () => document.getElementById('tradeModal').classList.remove('hidden'));

document.getElementById('postTradeBtn').addEventListener('click', () => {
    const offerRes = document.getElementById('offerRes').value;
    const offerAmt = parseInt(document.getElementById('offerAmt').value);
    const reqRes = document.getElementById('reqRes').value;
    const reqAmt = parseInt(document.getElementById('reqAmt').value);
    
    const offer = {}; offer[offerRes] = offerAmt;
    const request = {}; request[reqRes] = reqAmt;
    
    socket.emit('createOffer', { offer, request });
    document.getElementById('tradeModal').classList.add('hidden');
});

document.getElementById('bankTradeBtn').addEventListener('click', () => {
    const give = document.getElementById('bankGive').value;
    const get = document.getElementById('bankGet').value;
    socket.emit('bankTrade', { give, get });
});

// --- STATE ---
const HEX_SIZE = 50;
let CENTER_X = canvas.width / 2;
let CENTER_Y = canvas.height / 2;
let localState = { board: [], buildings: [], roads: [], activeOffers: [], players: {} };

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    CENTER_X = canvas.width / 2;
    CENTER_Y = canvas.height / 2;
    render();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- UI UPDATES ---
function updateUI() {
    if (localState.phase === 'WAITING_FOR_PLAYERS') {
        turnIndicator.innerText = "Lobby: Waiting for players...";
        
        // Show start button only if I am the first player (Host)
        const playerIds = Object.keys(localState.players);
        if (playerIds.length > 0 && playerIds[0] === socket.id) {
            startBtn.style.display = 'block';
        } else {
            startBtn.style.display = 'none';
        }
        
        rollBtn.disabled = true;
        endTurnBtn.disabled = true;
    } else {
        startBtn.style.display = 'none';
    }
    
    if (localState.phase === 'MAIN_GAME' || localState.phase.startsWith('SETUP')) {
        const currentPlayerId = localState.turnOrder[localState.currentTurnIndex];
        const isMyTurn = currentPlayerId === socket.id;
        
        let statusText = isMyTurn ? "YOUR TURN" : "Waiting for opponent...";
        if (localState.phase === 'SETUP_ROUND_1' || localState.phase === 'SETUP_ROUND_2') {
            statusText = isMyTurn ? "YOUR TURN (Place Settlement & Road)" : "Waiting for opponent (Setup)...";
            if (localState.phase === 'SETUP_ROUND_1') statusText += " [Snake Draft ->]";
            if (localState.phase === 'SETUP_ROUND_2') statusText += " [Snake Draft <-]";
            
            rollBtn.disabled = true;
            endTurnBtn.disabled = true;
        } else {
            rollBtn.disabled = !isMyTurn || localState.hasRolled;
            endTurnBtn.disabled = !isMyTurn || !localState.hasRolled;
        }
        
        turnIndicator.innerText = statusText;
        turnIndicator.style.color = isMyTurn ? "lime" : "white";
    } else if (localState.phase === 'GAME_OVER') {
        turnIndicator.innerText = "GAME OVER";
        rollBtn.disabled = true;
        endTurnBtn.disabled = true;
    } else if (localState.phase === 'ROBBER_PLACEMENT') {
        turnIndicator.innerText = "Place Robber";
        rollBtn.disabled = true;
        endTurnBtn.disabled = true;
    } else if (localState.phase === 'DISCARD_PHASE') {
        turnIndicator.innerText = "Discarding...";
        rollBtn.disabled = true;
        endTurnBtn.disabled = true;
    }
}

// Game Over Overlay
const overlay = document.createElement('div');
overlay.id = 'gameOverOverlay';
overlay.style.position = 'absolute';
overlay.style.top = '0';
overlay.style.left = '0';
overlay.style.width = '100%';
overlay.style.height = '100%';
overlay.style.background = 'rgba(0,0,0,0.85)';
overlay.style.display = 'none';
overlay.style.flexDirection = 'column';
overlay.style.justifyContent = 'center';
overlay.style.alignItems = 'center';
overlay.style.color = 'white';
overlay.style.zIndex = '1000';
overlay.innerHTML = `
    <h1 id="winnerText">GAME OVER</h1>
    <button id="playAgainBtn" style="padding: 15px 30px; font-size: 20px; cursor: pointer;">Play Again</button>
`;
document.body.appendChild(overlay);

document.getElementById('playAgainBtn').addEventListener('click', () => {
    socket.emit('resetGame');
    overlay.style.display = 'none';
});

socket.on('gameOver', (data) => {
    document.getElementById('winnerText').innerText = `GAME OVER - ${data.winner} WINS!`;
    overlay.style.display = 'flex';
});

function updateOffers() {
    activeOffersDiv.innerHTML = '';
    localState.activeOffers.forEach(o => {
        const div = document.createElement('div');
        div.style.border = '1px solid white';
        div.style.margin = '2px';
        div.style.padding = '2px';
        
        const offerText = Object.entries(o.offer).map(([k,v]) => `${v} ${k}`).join(', ');
        const reqText = Object.entries(o.request).map(([k,v]) => `${v} ${k}`).join(', ');
        
        div.innerText = `Offer: ${offerText} -> Want: ${reqText}`;
        
        if (o.from === socket.id) {
            const cancelBtn = document.createElement('button');
            cancelBtn.innerText = "Cancel";
            cancelBtn.onclick = () => socket.emit('cancelOffer', { offerId: o.id });
            div.appendChild(cancelBtn);
        } else {
            const acceptBtn = document.createElement('button');
            acceptBtn.innerText = "Accept";
            acceptBtn.onclick = () => socket.emit('acceptTrade', { offerId: o.id });
            div.appendChild(acceptBtn);
        }
        
        activeOffersDiv.appendChild(div);
    });
}

// --- SOCKET EVENTS ---
socket.on('init', (state) => {
    localState.board = state.board;
    localState.buildings = state.buildings;
    localState.roads = state.roads;
    localState.turnOrder = state.turnOrder;
    localState.currentTurnIndex = state.currentTurnIndex;
    localState.phase = state.phase;
    localState.hasRolled = state.hasRolled;
    localState.activeOffers = state.activeOffers || [];
    localState.robber = state.robber;
    localState.ports = state.ports || [];
    render();
    updateUI();
    updateOffers();
});

socket.on('requestDiscard', (data) => {
    const count = data.count;
    alert(`Robber! You must discard ${count} resources.`);
    
    const toDiscard = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 };
    let remaining = count;
    
    while (remaining > 0) {
        const res = prompt(`Discard ${remaining} more. Type resource name (wood, brick, sheep, wheat, ore):`);
        if (res && toDiscard.hasOwnProperty(res)) {
            toDiscard[res]++;
            remaining--;
        }
    }
    
    socket.emit('discardResources', { resources: toDiscard });
});

socket.on('playerUpdate', (players) => {
    localState.players = players; // Store for UI logic
    updateUI(); // Re-check host status
    
    // Update Top Bar Player List
    const playerListDiv = document.getElementById('player-list');
    if (playerListDiv) {
        playerListDiv.innerHTML = '';
        Object.values(players).forEach(p => {
            const badge = document.createElement('div');
            badge.className = 'player-badge';
            badge.style.borderLeft = `5px solid ${p.color}`;
            badge.innerHTML = `
                <span>${p.name}</span>
                <span style="color: gold;">${p.victoryPoints} VP</span>
                <span>🃏 ${Object.values(p.resources).reduce((a,b)=>a+b,0)}</span>
                <span>⚔️ ${p.armySize}</span>
            `;
            playerListDiv.appendChild(badge);
        });
    }
    
    const myId = socket.id;
    if (players[myId]) {
        const myPlayer = players[myId];
        const vpBar = document.getElementById('vp-bar');
        if (vpBar) vpBar.innerText = `${myPlayer.victoryPoints} / 10 VP`;
        
        const handContainer = document.getElementById('hand-container');
        if (handContainer) {
            handContainer.innerHTML = '';
            
            const resourceIcons = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '🪨' };
            
            for (let res in resourceIcons) {
                const count = myPlayer.resources[res] || 0;
                const card = document.createElement('div');
                card.className = 'card';
                card.innerHTML = `
                    <div class="card-icon">${resourceIcons[res]}</div>
                    <div style="font-size: 12px; margin-top: 5px;">${res.toUpperCase()}</div>
                    <div class="card-count">${count}</div>
                `;
                handContainer.appendChild(card);
            }
            
            const cards = myPlayer.devCards || [];
            cards.forEach(cardObj => {
                const cardType = cardObj.type || cardObj; 
                const card = document.createElement('div');
                card.className = 'card';
                card.style.background = '#bdc3c7';
                card.innerHTML = `
                    <div class="card-icon">🃏</div>
                    <div style="font-size: 10px; margin-top: 5px;">${cardType}</div>
                `;
                
                if (cardType === 'knight') {
                    card.onclick = () => socket.emit('playDevCard', { type: 'knight' });
                } else if (cardType === 'yearOfPlenty') {
                    card.onclick = () => {
                        const r1 = prompt("Resource 1 (wood, brick, sheep, wheat, ore):");
                        const r2 = prompt("Resource 2:");
                        if(r1 && r2) socket.emit('playDevCard', { type: 'yearOfPlenty', res1: r1, res2: r2 });
                    };
                } else if (cardType === 'monopoly') {
                    card.onclick = () => {
                        const r = prompt("Resource to monopolize:");
                        if(r) socket.emit('playDevCard', { type: 'monopoly', resource: r });
                    };
                } else if (cardType === 'roadBuilding') {
                    card.onclick = () => socket.emit('playDevCard', { type: 'roadBuilding' });
                }
                
                handContainer.appendChild(card);
            });
        }
    }
});

socket.on('buildingPlaced', (building) => {
    const idx = localState.buildings.findIndex(b => b.vertexId === building.vertexId);
    if (idx !== -1) {
        localState.buildings[idx] = building;
    } else {
        localState.buildings.push(building);
    }
    render();
});

socket.on('roadPlaced', (road) => {
    localState.roads.push(road);
    render();
});

socket.on('diceRolled', (roll) => {});

socket.on('logMessage', (msg) => {
    const p = document.createElement('div');
    p.innerText = msg;
    logDiv.prepend(p);
});

// --- MATH & RENDER ---
function hexToPixel(q, r) {
    const x = HEX_SIZE * (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r);
    const y = HEX_SIZE * (3 / 2 * r);
    return { x: x + CENTER_X, y: y + CENTER_Y };
}

function getHexCorners(center) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i - 30;
        const angle_rad = Math.PI / 180 * angle_deg;
        corners.push({
            x: center.x + HEX_SIZE * Math.cos(angle_rad),
            y: center.y + HEX_SIZE * Math.sin(angle_rad)
        });
    }
    return corners;
}

function getNearestVertex(x, y) {
    let nearest = null;
    let minDistance = Infinity;
    const SNAP_DISTANCE = 20;

    localState.board.forEach(hex => {
        const center = hexToPixel(hex.q, hex.r);
        const corners = getHexCorners(center);
        
        corners.forEach((corner, index) => {
            const dx = x - corner.x;
            const dy = y - corner.y;
            const distance = Math.sqrt(dx*dx + dy*dy);
            
            if (distance < minDistance && distance < SNAP_DISTANCE) {
                minDistance = distance;
                nearest = {
                    x: corner.x,
                    y: corner.y,
                    id: Shared.getCanonicalVertex(hex.q, hex.r, index)
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

    localState.board.forEach(hex => {
        const center = hexToPixel(hex.q, hex.r);
        const corners = getHexCorners(center);
        
        for (let i = 0; i < 6; i++) {
            const c1 = corners[i];
            const c2 = corners[(i+1)%6];
            
            const midX = (c1.x + c2.x) / 2;
            const midY = (c1.y + c2.y) / 2;
            
            const dx = x - midX;
            const dy = y - midY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < minDistance && dist < SNAP_DISTANCE) {
                minDistance = dist;
                nearest = {
                    x: midX,
                    y: midY,
                    id: Shared.getCanonicalEdge(hex.q, hex.r, i)
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
        const angle_rad = Math.PI / 180 * angle_deg;
        ctx.lineTo(center.x + HEX_SIZE * Math.cos(angle_rad), 
                   center.y + HEX_SIZE * Math.sin(angle_rad));
    }
    ctx.closePath();
    const colors = { wood: '#228B22', brick: '#B22222', sheep: '#90EE90', wheat: '#DAA520', ore: '#708090', desert: '#F4A460' };
    ctx.fillStyle = colors[resource] || '#FFF';
    ctx.fill();
    ctx.stroke();
    if (resource !== 'desert') {
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(center.x, center.y, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(number, center.x, center.y);
    }
}

function drawBuilding(vertexId, color, type) {
    const parts = vertexId.split(',').map(Number);
    const q = parts[0], r = parts[1], d = parts[2];
    const center = hexToPixel(q, r);
    const angle_deg = 60 * d - 30;
    const angle_rad = Math.PI / 180 * angle_deg;
    const x = center.x + HEX_SIZE * Math.cos(angle_rad);
    const y = center.y + HEX_SIZE * Math.sin(angle_rad);

    ctx.fillStyle = color;
    ctx.beginPath();
    if (type === 'city') {
        ctx.rect(x - 15, y - 15, 30, 30);
    } else {
        ctx.rect(x - 10, y - 10, 20, 20);
    }
    ctx.fill();
    ctx.stroke();
}

function drawRoad(edgeId, color) {
    const parts = edgeId.replace('E', '').split(',').map(Number);
    const q = parts[0], r = parts[1], d = parts[2];
    const center = hexToPixel(q, r);
    const corners = getHexCorners(center);
    const c1 = corners[d];
    const c2 = corners[(d+1)%6];
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.stroke();
    ctx.lineWidth = 1;
}

function drawRobber() {
    if (!localState.robber) return;
    const center = hexToPixel(localState.robber.q, localState.robber.r);
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(center.x, center.y, 15, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("R", center.x, center.y);
}

function getVertexPixel(vertexId) {
    const parts = vertexId.split(',').map(Number);
    const q = parts[0], r = parts[1], d = parts[2];
    const center = hexToPixel(q, r);
    const angle_deg = 60 * d - 30;
    const angle_rad = Math.PI / 180 * angle_deg;
    return {
        x: center.x + HEX_SIZE * Math.cos(angle_rad),
        y: center.y + HEX_SIZE * Math.sin(angle_rad)
    };
}

function drawPorts() {
    if (!localState.ports) return;
    
    localState.ports.forEach(port => {
        const v1 = port.vertexIds[0];
        const v2 = port.vertexIds[1];
        
        const p1 = getVertexPixel(v1);
        const p2 = getVertexPixel(v2);
        
        if (!p1 || !p2) return;
        
        // Edge Midpoint (Mx, My)
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        
        // Find the Hex Center (Cx, Cy)
        let cx = mx; 
        let cy = my;
        
        // Find hex that shares this edge
        const hex = localState.board.find(h => {
            for (let i = 0; i < 6; i++) {
                const id1 = Shared.getCanonicalVertex(h.q, h.r, i);
                const id2 = Shared.getCanonicalVertex(h.q, h.r, (i+1)%6);
                if ((id1 === v1 && id2 === v2) || (id1 === v2 && id2 === v1)) {
                    return true;
                }
            }
            return false;
        });

        if (hex) {
            const center = hexToPixel(hex.q, hex.r);
            cx = center.x;
            cy = center.y;
        }

        // Vector V = (Mx - Cx, My - Cy)
        const vx = mx - cx;
        const vy = my - cy;
        
        // Normalize and Scale
        const len = Math.sqrt(vx*vx + vy*vy) || 1;
        const scale = HEX_SIZE * 0.6;
        const dx = mx + (vx / len) * scale;
        const dy = my + (vy / len) * scale;
        
        // Draw Stick
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(mx, my);
        ctx.lineTo(dx, dy);
        ctx.stroke();
        
        // Draw Platform
        ctx.fillStyle = 'white';
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(dx, dy, 15, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
        
        // Text
        ctx.fillStyle = '#8B4513';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(port.type, dx, dy);
    });
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    localState.board.forEach(hex => drawHex(hex.q, hex.r, hex.resource, hex.number));
    drawPorts();
    localState.roads.forEach(r => drawRoad(r.edgeId, r.color));
    localState.buildings.forEach(b => drawBuilding(b.vertexId, b.color, b.type));
    drawRobber();
}

canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (localState.phase === 'ROBBER_PLACEMENT') {
        let clickedHex = null;
        localState.board.forEach(hex => {
            const center = hexToPixel(hex.q, hex.r);
            const dx = x - center.x;
            const dy = y - center.y;
            if (Math.sqrt(dx*dx + dy*dy) < HEX_SIZE/2) {
                clickedHex = hex;
            }
        });
        
        if (clickedHex) {
            socket.emit('moveRobber', { q: clickedHex.q, r: clickedHex.r });
        }
        return;
    }

    const snapped = getNearestVertex(x, y);
    if (snapped) {
        const existing = localState.buildings.find(b => b.vertexId === snapped.id);
        if (existing) {
            if (existing.owner === socket.id && existing.type !== 'city') {
                socket.emit('buildCity', { vertexId: snapped.id });
            }
            return;
        }
        socket.emit('buildNode', { vertexId: snapped.id });
        return;
    }

    const snappedEdge = getNearestEdge(x, y);
    if (snappedEdge) {
        socket.emit('buildRoad', { edgeId: snappedEdge.id });
    }
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const snapped = getNearestVertex(x, y);
    const snappedEdge = getNearestEdge(x, y);
    render();
    if (snapped) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(snapped.x, snapped.y, 10, 0, 2 * Math.PI);
        ctx.fill();
    } else if (snappedEdge) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(snappedEdge.x, snappedEdge.y, 10, 0, 2 * Math.PI);
        ctx.fill();
    }
});
