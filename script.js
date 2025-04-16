// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 500;
const HIDE_TIME = 30; // 30 seconds to hide
const GAME_TIME = 180; // 3 minutes total game time
const PLAYER_RADIUS = 15;
const HUNTER_SPEED = 3;
const HIDER_SPEED = 2.5;
const CATCH_DISTANCE = 20;

// Game variables
let playerName = '';
let gameCode = '';
let playerId = '';
let players = {};
let currentPlayer = null;
let gameState = 'waiting'; // waiting, hiding, seeking, ended
let gameStartTime = 0;
let lastUpdateTime = 0;
let peer = null;
let hostConnection = null;
let connections = [];
let isHost = false;
let obstacles = [];
let currentScreen = 'start';

// DOM elements
const startScreen = document.getElementById('start-screen');
const lobbyScreen = document.getElementById('lobby-screen');
const gameScreen = document.getElementById('game-screen');
const endScreen = document.getElementById('end-screen');
const playerNameInput = document.getElementById('player-name');
const gameCodeInput = document.getElementById('game-code');
const displayGameCode = document.getElementById('display-game-code');
const playerList = document.getElementById('player-list');
const roleDisplay = document.getElementById('role-display');
const timerDisplay = document.getElementById('timer');
const hidersCount = document.getElementById('hiders-count');
const gameMessage = document.getElementById('game-message');
const winnerDisplay = document.getElementById('winner-display');
const finalStats = document.getElementById('final-stats');

// Initialize the game
function init() {
    // Set up event listeners
    document.getElementById('create-game').addEventListener('click', createGame);
    document.getElementById('join-game').addEventListener('click', showJoinInput);
    document.getElementById('confirm-join').addEventListener('click', joinGame);
    document.getElementById('start-game').addEventListener('click', startGame);
    document.getElementById('play-again').addEventListener('click', resetGame);
    
    // Generate a random player ID
    playerId = generateId(6);
    
    // Initialize p5.js canvas
    new p5(gameSketch, 'game-canvas');
}

// Generate random ID
function generateId(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Create a new game
function createGame() {
    playerName = playerNameInput.value.trim();
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    gameCode = generateId(4);
    isHost = true;
    
    // Initialize PeerJS
    peer = new Peer(`${gameCode}-${playerId}`);
    
    peer.on('open', () => {
        console.log('Host peer connected with ID:', peer.id);
        showScreen('lobby');
        displayGameCode.textContent = gameCode;
        
        // Create player object
        currentPlayer = {
            id: playerId,
            name: playerName,
            role: 'hider', // Host is always first hider
            x: Math.random() * (GAME_WIDTH - 40) + 20,
            y: Math.random() * (GAME_HEIGHT - 40) + 20,
            caught: false,
            color: getRandomColor()
        };
        
        players[playerId] = currentPlayer;
        updatePlayerList();
    });
    
    peer.on('connection', (conn) => {
        console.log('New player connected:', conn.peer);
        connections.push(conn);
        
        conn.on('open', () => {
            // Send current game state to new player
            conn.send({
                type: 'init',
                gameState: gameState,
                players: players,
                gameTime: gameStartTime > 0 ? Math.floor((Date.now() - gameStartTime) / 1000) : 0,
                isHost: false
            });
        });
        
        conn.on('data', (data) => handleData(conn, data));
        conn.on('close', () => handleDisconnect(conn));
    });
    
    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        alert('Connection error: ' + err);
    });
}

// Join an existing game
function joinGame() {
    playerName = playerNameInput.value.trim();
    gameCode = gameCodeInput.value.trim().toUpperCase();
    
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    if (!gameCode || gameCode.length !== 4) {
        alert('Please enter a valid 4-character game code');
        return;
    }
    
    // Initialize PeerJS
    peer = new Peer(playerId);
    
    peer.on('open', () => {
        console.log('Player peer connected with ID:', peer.id);
        
        // Connect to host
        hostConnection = peer.connect(`${gameCode}-host`);
        
        hostConnection.on('open', () => {
            console.log('Connected to host');
            showScreen('lobby');
            
            // Create player object (role will be set by host)
            currentPlayer = {
                id: playerId,
                name: playerName,
                role: 'hunter', // Default to hunter (if game is already in progress)
                x: Math.random() * (GAME_WIDTH - 40) + 20,
                y: Math.random() * (GAME_HEIGHT - 40) + 20,
                caught: false,
                color: getRandomColor()
            };
            
            // Send join request to host
            hostConnection.send({
                type: 'join',
                player: currentPlayer
            });
        });
        
        hostConnection.on('data', (data) => handleData(hostConnection, data));
        hostConnection.on('close', () => handleDisconnect(hostConnection));
    });
    
    peer.on('error', (err) => {
        console.error('PeerJS error:', err);
        alert('Connection error: ' + err);
    });
}

// Handle incoming data
function handleData(conn, data) {
    switch (data.type) {
        case 'init':
            // Initialize game state
            gameState = data.gameState;
            players = data.players;
            currentPlayer = players[playerId];
            
            if (data.gameTime > 0) {
                gameStartTime = Date.now() - data.gameTime * 1000;
            }
            
            updatePlayerList();
            
            if (gameState !== 'waiting') {
                showScreen('game');
                if (gameState === 'hiding') {
                    gameMessage.textContent = `Hide! ${HIDE_TIME - data.gameTime} seconds remaining`;
                } else if (gameState === 'seeking') {
                    gameMessage.textContent = 'Seek! Find the hiders!';
                }
                updateRoleDisplay();
            }
            break;
            
        case 'playerUpdate':
            // Update other players' positions
            players[data.player.id] = data.player;
            break;
            
        case 'gameStart':
            // Game started
            gameState = 'hiding';
            gameStartTime = Date.now();
            showScreen('game');
            gameMessage.textContent = `Hide! ${HIDE_TIME} seconds remaining`;
            updateRoleDisplay();
            break;
            
        case 'startSeeking':
            // Hiding time over, start seeking
            gameState = 'seeking';
            gameMessage.textContent = 'Seek! Find the hiders!';
            break;
            
        case 'playerCaught':
            // A player was caught
            players[data.playerId].caught = true;
            if (data.playerId === playerId) {
                currentPlayer.caught = true;
                gameMessage.textContent = 'You were caught! Now help catch others!';
                roleDisplay.textContent = 'Role: Hunter';
            }
            updatePlayerCount();
            break;
            
        case 'gameOver':
            // Game ended
            gameState = 'ended';
            showScreen('end');
            displayResults(data.winners);
            break;
            
        case 'playerJoined':
            // New player joined
            players[data.player.id] = data.player;
            updatePlayerList();
            if (currentScreen === 'game') {
                updatePlayerCount();
            }
            break;
            
        case 'playerLeft':
            // Player left
            delete players[data.playerId];
            updatePlayerList();
            if (currentScreen === 'game') {
                updatePlayerCount();
            }
            break;
    }
}

// Handle player disconnect
function handleDisconnect(conn) {
    if (isHost) {
        // Find which player disconnected
        const index = connections.indexOf(conn);
        if (index !== -1) {
            connections.splice(index, 1);
            
            // Find player ID
            const peerId = conn.peer.split('-')[1];
            delete players[peerId];
            
            // Notify other players
            broadcast({
                type: 'playerLeft',
                playerId: peerId
            });
            
            updatePlayerList();
            if (currentScreen === 'game') {
                updatePlayerCount();
            }
        }
    } else if (conn === hostConnection) {
        alert('Disconnected from host');
        resetGame();
    }
}

// Show join game input
function showJoinInput() {
    playerName = playerNameInput.value.trim();
    if (!playerName) {
        alert('Please enter your name');
        return;
    }
    
    document.getElementById('game-code-container').classList.remove('hidden');
    document.getElementById('create-game').disabled = true;
    document.getElementById('join-game').disabled = true;
}

// Start the game
function startGame() {
    if (Object.keys(players).length < 1) {
        alert('Need at least 2 players to start');
        return;
    }
    
    gameState = 'hiding';
    gameStartTime = Date.now();
    showScreen('game');
    
    // Generate obstacles
    generateObstacles();
    
    // Broadcast game start
    broadcast({
        type: 'gameStart'
    });
    
    // Start hiding phase
    gameMessage.textContent = `Hide! ${HIDE_TIME} seconds remaining`;
    updateRoleDisplay();
    
    // Set timeout for seeking phase
    setTimeout(() => {
        if (gameState === 'hiding') {
            gameState = 'seeking';
            gameMessage.textContent = 'Seek! Find the hiders!';
            
            // Notify players
            broadcast({
                type: 'startSeeking'
            });
        }
    }, HIDE_TIME * 1000);
    
    // Set timeout for game end
    setTimeout(() => {
        if (gameState === 'seeking') {
            endGame();
        }
    }, GAME_TIME * 1000);
}

// End the game
function endGame() {
    gameState = 'ended';
    
    // Determine winners (hiders not caught)
    const winners = [];
    for (const playerId in players) {
        if (players[playerId].role === 'hider' && !players[playerId].caught) {
            winners.push(players[playerId]);
        }
    }
    
    // If all hiders were caught, hunters win
    const result = winners.length > 0 ? 
        { winners: winners, message: 'Hiders win!' } : 
        { winners: Object.values(players).filter(p => p.role === 'hunter'), message: 'Hunters win!' };
    
    // Show results
    showScreen('end');
    displayResults(result);
    
    // Notify players
    broadcast({
        type: 'gameOver',
        winners: result
    });
}

// Display game results
function displayResults(result) {
    winnerDisplay.textContent = result.message;
    finalStats.innerHTML = '';
    
    // Add winner list
    const winnerTitle = document.createElement('h3');
    winnerTitle.textContent = 'Winners:';
    finalStats.appendChild(winnerTitle);
    
    result.winners.forEach(winner => {
        const winnerItem = document.createElement('div');
        winnerItem.textContent = winner.name;
        winnerItem.style.color = winner.color;
        winnerItem.style.fontWeight = 'bold';
        finalStats.appendChild(winnerItem);
    });
    
    // Add all players stats
    const statsTitle = document.createElement('h3');
    statsTitle.textContent = 'All Players:';
    statsTitle.style.marginTop = '20px';
    finalStats.appendChild(statsTitle);
    
    for (const playerId in players) {
        const player = players[playerId];
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = player.name;
        nameSpan.style.color = player.color;
        
        const roleSpan = document.createElement('span');
        roleSpan.textContent = player.role === 'hider' ? 
            (player.caught ? 'Caught' : 'Survived') : 'Hunter';
        
        statItem.appendChild(nameSpan);
        statItem.appendChild(roleSpan);
        finalStats.appendChild(statItem);
    }
}

// Reset the game
function resetGame() {
    // Reset game state
    gameState = 'waiting';
    gameStartTime = 0;
    players = {};
    connections = [];
    
    if (currentPlayer) {
        players[playerId] = currentPlayer;
        currentPlayer.role = isHost ? 'hider' : 'hunter';
        currentPlayer.caught = false;
    }
    
    // Close connections
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    // Show start screen
    showScreen('start');
}

// Broadcast data to all connected players
function broadcast(data) {
    if (!isHost) return;
    
    connections.forEach(conn => {
        if (conn.open) {
            conn.send(data);
        }
    });
}

// Update the player list display
function updatePlayerList() {
    playerList.innerHTML = '';
    
    for (const playerId in players) {
        const player = players[playerId];
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.textContent = player.name;
        playerElement.style.color = player.color;
        
        if (gameState !== 'waiting') {
            const roleSpan = document.createElement('span');
            roleSpan.textContent = ` (${player.role}${player.caught && player.role === 'hider' ? ' - caught' : ''})`;
            playerElement.appendChild(roleSpan);
        }
        
        playerList.appendChild(playerElement);
    }
}

// Update the role display
function updateRoleDisplay() {
    if (!currentPlayer) return;
    
    roleDisplay.textContent = `Role: ${currentPlayer.role.charAt(0).toUpperCase() + currentPlayer.role.slice(1)}`;
    if (currentPlayer.caught && currentPlayer.role === 'hider') {
        roleDisplay.textContent += ' (Caught)';
    }
}

// Update the player count display
function updatePlayerCount() {
    let hiderCount = 0;
    for (const playerId in players) {
        if (players[playerId].role === 'hider' && !players[playerId].caught) {
            hiderCount++;
        }
    }
    
    hidersCount.textContent = hiderCount;
}

// Show a specific screen
function showScreen(screen) {
    currentScreen = screen;
    startScreen.classList.add('hidden');
    lobbyScreen.classList.add('hidden');
    gameScreen.classList.add('hidden');
    endScreen.classList.add('hidden');
    
    switch (screen) {
        case 'start':
            startScreen.classList.remove('hidden');
            break;
        case 'lobby':
            lobbyScreen.classList.remove('hidden');
            break;
        case 'game':
            gameScreen.classList.remove('hidden');
            updateGameInfo();
            break;
        case 'end':
            endScreen.classList.remove('hidden');
            break;
    }
}

// Update game info (timer, etc.)
function updateGameInfo() {
    if (gameState === 'ended') return;
    
    const now = Date.now();
    if (lastUpdateTime && now - lastUpdateTime < 1000) {
        requestAnimationFrame(updateGameInfo);
        return;
    }
    
    lastUpdateTime = now;
    
    if (gameStartTime > 0) {
        const elapsed = Math.floor((now - gameStartTime) / 1000);
        const remaining = Math.max(0, GAME_TIME - elapsed);
        
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        timerDisplay.textContent = `Time: ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }
    
    requestAnimationFrame(updateGameInfo);
}

// Generate random obstacles
function generateObstacles() {
    obstacles = [];
    const obstacleCount = 10 + Math.floor(Math.random() * 10);
    
    for (let i = 0; i < obstacleCount; i++) {
        obstacles.push({
            x: Math.random() * (GAME_WIDTH - 100) + 50,
            y: Math.random() * (GAME_HEIGHT - 100) + 50,
            width: 20 + Math.random() * 80,
            height: 20 + Math.random() * 80
        });
    }
}

// Get random color for player
function getRandomColor() {
    const colors = [
        '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#d35400', '#34495e', '#7f8c8d', '#27ae60'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// p5.js sketch for game rendering
function gameSketch(p) {
    p.setup = function() {
        p.createCanvas(GAME_WIDTH, GAME_HEIGHT);
        p.noStroke();
    };
    
    p.draw = function() {
        if (currentScreen !== 'game' || !currentPlayer) return;
        
        // Clear canvas
        p.background(236, 240, 241);
        
        // Draw obstacles
        p.fill(189, 195, 199);
        obstacles.forEach(obs => {
            p.rect(obs.x, obs.y, obs.width, obs.height);
        });
        
        // Draw players
        for (const playerId in players) {
            const player = players[playerId];
            
            // Draw player
            p.fill(player.color);
            p.ellipse(player.x, player.y, PLAYER_RADIUS * 2);
            
            // Draw name
            p.fill(0);
            p.textSize(12);
            p.textAlign(p.CENTER);
            p.text(player.name, player.x, player.y + PLAYER_RADIUS + 15);
            
            // Draw role indicator
            if (gameState !== 'waiting') {
                p.textSize(10);
                p.text(player.role.charAt(0).toUpperCase(), player.x, player.y - PLAYER_RADIUS - 5);
            }
        }
        
        // Handle player movement
        if (gameState !== 'waiting' && gameState !== 'ended' && !(currentPlayer.role === 'hider' && currentPlayer.caught)) {
            handleMovement(p);
        }
    };
    
    // Handle player movement
    function handleMovement(p) {
        const speed = currentPlayer.role === 'hunter' ? HUNTER_SPEED : HIDER_SPEED;
        let moved = false;
        
        if (p.keyIsDown(p.LEFT_ARROW)) {
            currentPlayer.x = Math.max(PLAYER_RADIUS, currentPlayer.x - speed);
            moved = true;
        }
        
        if (p.keyIsDown(p.RIGHT_ARROW)) {
            currentPlayer.x = Math.min(GAME_WIDTH - PLAYER_RADIUS, currentPlayer.x + speed);
            moved = true;
        }
        if (p.keyIsDown(p.UP_ARROW)) {
            currentPlayer.y = Math.max(PLAYER_RADIUS, currentPlayer.y - speed);
            moved = true;
        }
        if (p.keyIsDown(p.DOWN_ARROW)) {
            currentPlayer.y = Math.min(GAME_HEIGHT - PLAYER_RADIUS, currentPlayer.y + speed);
            moved = true;
        }
        
        // Check for collisions with obstacles
        obstacles.forEach(obs => {
            // Simple rectangle collision detection
            const closestX = p.constrain(currentPlayer.x, obs.x, obs.x + obs.width);
            const closestY = p.constrain(currentPlayer.y, obs.y, obs.y + obs.height);
            
            const distance = p.dist(currentPlayer.x, currentPlayer.y, closestX, closestY);
            
            if (distance < PLAYER_RADIUS) {
                // Push player out of obstacle
                const angle = p.atan2(currentPlayer.y - closestY, currentPlayer.x - closestX);
                currentPlayer.x = closestX + p.cos(angle) * PLAYER_RADIUS;
                currentPlayer.y = closestY + p.sin(angle) * PLAYER_RADIUS;
            }
        });
        
        // If player moved, update position on server
        if (moved && isHost) {
            broadcast({
                type: 'playerUpdate',
                player: currentPlayer
            });
            
            // Check for catches if hunter
            if (gameState === 'seeking' && currentPlayer.role === 'hunter') {
                checkForCatches();
            }
        } else if (moved && hostConnection && hostConnection.open) {
            hostConnection.send({
                type: 'playerUpdate',
                player: currentPlayer
            });
        }
    }
    
    // Check if hunter caught any hiders
    function checkForCatches() {
        for (const playerId in players) {
            const player = players[playerId];
            
            if (player.role === 'hider' && !player.caught) {
                const distance = p.dist(
                    currentPlayer.x, currentPlayer.y,
                    player.x, player.y
                );
                
                if (distance < CATCH_DISTANCE) {
                    // Caught a hider!
                    player.caught = true;
                    
                    // Notify all players
                    broadcast({
                        type: 'playerCaught',
                        playerId: player.id
                    });
                    
                    // Check if all hiders are caught
                    let allCaught = true;
                    for (const pid in players) {
                        if (players[pid].role === 'hider' && !players[pid].caught) {
                            allCaught = false;
                            break;
                        }
                    }
                    
                    if (allCaught) {
                        setTimeout(() => {
                            if (gameState === 'seeking') {
                                endGame();
                            }
                        }, 1000);
                    }
                }
            }
        }
    }
}

// Initialize the game when page loads
window.addEventListener('DOMContentLoaded', init);
