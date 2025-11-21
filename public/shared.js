(function(exports) {

    // Helper to get the 3 hexes that share a vertex
    function getEquivalents(q, r, dir) {
        const equivalents = [{q, r, d: dir}];
        if (dir === 0) { equivalents.push({q: q+1, r: r-1, d: 2}, {q: q+1, r: r, d: 4}); }
        else if (dir === 1) { equivalents.push({q: q+1, r: r, d: 3}, {q: q, r: r+1, d: 5}); }
        else if (dir === 2) { equivalents.push({q: q, r: r+1, d: 0}, {q: q-1, r: r+1, d: 4}); }
        else if (dir === 3) { equivalents.push({q: q-1, r: r+1, d: 5}, {q: q-1, r: r, d: 1}); }
        else if (dir === 4) { equivalents.push({q: q-1, r: r, d: 0}, {q: q, r: r-1, d: 2}); }
        else if (dir === 5) { equivalents.push({q: q, r: r-1, d: 1}, {q: q+1, r: r-1, d: 3}); }
        return equivalents;
    }

    exports.getCanonicalVertex = function(q, r, dir) {
        // Normalize direction to 0-5
        dir = (dir % 6 + 6) % 6;
        
        let candidates = getEquivalents(q, r, dir);
        
        // Sort: q asc, r asc, d asc
        candidates.sort((a, b) => {
            if (a.q !== b.q) return a.q - b.q;
            if (a.r !== b.r) return a.r - b.r;
            return a.d - b.d;
        });
        
        const best = candidates[0];
        return `${best.q},${best.r},${best.d}`;
    };
    
    exports.getCanonicalEdge = function(q, r, dir) {
        dir = (dir % 6 + 6) % 6;
        const equivalents = [{q, r, d: dir}];
        
        // Neighbors sharing edges (Pointy Top)
        if (dir === 0) equivalents.push({q: q+1, r: r, d: 3});
        else if (dir === 1) equivalents.push({q: q, r: r+1, d: 4});
        else if (dir === 2) equivalents.push({q: q-1, r: r+1, d: 5});
        else if (dir === 3) equivalents.push({q: q-1, r: r, d: 0});
        else if (dir === 4) equivalents.push({q: q, r: r-1, d: 1});
        else if (dir === 5) equivalents.push({q: q+1, r: r-1, d: 2});
        
        equivalents.sort((a, b) => {
            if (a.q !== b.q) return a.q - b.q;
            if (a.r !== b.r) return a.r - b.r;
            return a.d - b.d;
        });
        
        const best = equivalents[0];
        return `E${best.q},${best.r},${best.d}`;
    };

    exports.getVerticesOfEdge = function(edgeId) {
        const parts = edgeId.replace('E', '').split(',').map(Number);
        const q = parts[0], r = parts[1], d = parts[2];
        
        const v1 = exports.getCanonicalVertex(q, r, d);
        const v2 = exports.getCanonicalVertex(q, r, (d+1)%6);
        
        return [v1, v2];
    };
    
    exports.getEdgesOfVertex = function(vertexId) {
        const parts = vertexId.split(',').map(Number);
        const q = parts[0], r = parts[1], d = parts[2];
        
        const equivalents = getEquivalents(q, r, d);
        const edges = new Set();
        
        equivalents.forEach(eq => {
            const dMinus = (eq.d - 1 + 6) % 6;
            edges.add(exports.getCanonicalEdge(eq.q, eq.r, eq.d));
            edges.add(exports.getCanonicalEdge(eq.q, eq.r, dMinus));
        });
        
        return Array.from(edges);
    };

    exports.hasConnectedInfrastructure = function(edgeId, playerId, gameState) {
        const vertices = exports.getVerticesOfEdge(edgeId);
        
        // 1. Check for buildings at either end
        const hasBuilding = vertices.some(vId => 
            gameState.buildings.some(b => b.vertexId === vId && b.owner === playerId)
        );
        if (hasBuilding) return true;
        
        // 2. Check for connected roads
        for (let vId of vertices) {
            const connectedEdges = exports.getEdgesOfVertex(vId);
            const hasRoad = connectedEdges.some(eId => 
                eId !== edgeId && 
                gameState.roads.some(r => r.edgeId === eId && r.owner === playerId)
            );
            if (hasRoad) return true;
        }
        
        return false;
    };
    
    exports.getAdjacentVertices = function(vertexId) {
        // vertexId is "q,r,d"
        const parts = vertexId.split(',').map(Number);
        const q = parts[0], r = parts[1], d = parts[2];
        
        const equivalents = getEquivalents(q, r, d);
        const neighbors = new Set();
        
        equivalents.forEach(eq => {
            // For each hex sharing this vertex, the neighbors on that hex are d-1 and d+1
            const dMinus = (eq.d - 1 + 6) % 6;
            const dPlus = (eq.d + 1) % 6;
            
            neighbors.add(exports.getCanonicalVertex(eq.q, eq.r, dMinus));
            neighbors.add(exports.getCanonicalVertex(eq.q, eq.r, dPlus));
        });
        
        return Array.from(neighbors);
    };

    exports.COSTS = {
        road: { wood: 1, brick: 1 },
        settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
        city: { wheat: 2, ore: 3 },
        devCard: { sheep: 1, wheat: 1, ore: 1 }
    };

    exports.LIMITS = {
        MAX_SETTLEMENTS: 5,
        MAX_CITIES: 4,
        MAX_ROADS: 15,
        MIN_LONGEST_ROAD: 5,
        MIN_LARGEST_ARMY: 3,
        VICTORY_POINTS_TO_WIN: 10
    };

    exports.canAfford = function(resources, cost) {
        for (let key in cost) {
            if ((resources[key] || 0) < cost[key]) return false;
        }
        return true;
    };

    exports.getPlayerTradeRatio = function(playerId, resourceType, gameState) {
        let ratio = 4;
        if (!gameState.ports) return ratio;
        
        const playerBuildings = gameState.buildings.filter(b => b.owner === playerId);
        
        for (let b of playerBuildings) {
            const port = gameState.ports.find(p => p.vertexIds.includes(b.vertexId));
            if (port) {
                if (port.type === '3:1') {
                    if (ratio > 3) ratio = 3;
                } else if (port.type === resourceType) {
                    return 2; // Best possible
                }
            }
        }
        return ratio;
    };

    exports.calculateLongestRoad = function(playerId, roads, buildings) {
        const playerRoads = roads.filter(r => r.owner === playerId);
        if (playerRoads.length === 0) return 0;
        
        // Build adjacency: Vertex -> [Vertex]
        const adj = {};
        
        playerRoads.forEach(r => {
            const [v1, v2] = exports.getVerticesOfEdge(r.edgeId);
            if (!adj[v1]) adj[v1] = [];
            if (!adj[v2]) adj[v2] = [];
            adj[v1].push({ node: v2, edgeId: r.edgeId });
            adj[v2].push({ node: v1, edgeId: r.edgeId });
        });
        
        let maxLen = 0;
        
        function dfs(u, visitedEdges, currentLen) {
            if (currentLen > maxLen) maxLen = currentLen;
            
            // Edge Breaking Rule: Cannot pass through opponent's settlement
            const building = buildings.find(b => b.vertexId === u);
            if (building && building.owner !== playerId) {
                return;
            }
            
            const neighbors = adj[u] || [];
            neighbors.forEach(n => {
                if (!visitedEdges.has(n.edgeId)) {
                    visitedEdges.add(n.edgeId);
                    dfs(n.node, visitedEdges, currentLen + 1);
                    visitedEdges.delete(n.edgeId);
                }
            });
        }
        
        for (let v in adj) {
            dfs(v, new Set(), 0);
        }
        
        return maxLen;
    };

})(typeof exports === 'undefined' ? this.Shared = {} : exports);
