const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const scoreboard = document.getElementById('scoreboard');
const timerDisplay = document.getElementById('timer');

const menuContainer = document.getElementById('menu-container');
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const nicknameInput = document.getElementById('nickname');
const btnRed = document.getElementById('btn-red');
const btnBlue = document.getElementById('btn-blue');
const btnPlay = document.getElementById('btn-play');

const tabCreate = document.getElementById('tab-create');
const tabJoin = document.getElementById('tab-join');
const panelCreate = document.getElementById('panel-create');
const panelJoin = document.getElementById('panel-join');

const lobbyTitle = document.getElementById('lobby-title');
const listRed = document.getElementById('list-red');
const listBlue = document.getElementById('list-blue');
const btnStartMatch = document.getElementById('btn-start-match');
const waitMessage = document.getElementById('wait-message');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

// Conexão dinâmica e segura com o servidor online do Render
const socket = io(window.location.origin);
let clientPlayers = {};
let clientBall = { x: 800, y: 500, radius: 12 };
let goalOverlayActive = false;
let gameOverOverlay = false;
let overlayText = "";

let selectedTeam = 'red';
let currentMode = 'create';

// Configurações do tamanho real do mapa gigante
const WORLD_WIDTH = 1600;
const WORLD_HEIGHT = 1000;
const FIELD_MARGIN = 100; 
const GOAL_WIDTH = 60;   
const GOAL_TOP = WORLD_HEIGHT / 2 - 150; 
const GOAL_BOTTOM = WORLD_HEIGHT / 2 + 150;

// Controle de posição da câmera
let camera = { x: 0, y: 0 };

const inputState = { up: false, down: false, left: false, right: false, kick: false };

tabCreate.addEventListener('click', () => { currentMode = 'create'; tabCreate.classList.add('active'); tabJoin.classList.remove('active'); panelCreate.classList.remove('hidden'); panelJoin.classList.add('hidden'); });
tabJoin.addEventListener('click', () => { currentMode = 'join'; tabJoin.classList.add('active'); tabCreate.classList.remove('active'); panelJoin.classList.remove('hidden'); panelCreate.classList.add('hidden'); });
btnRed.addEventListener('click', () => { selectedTeam = 'red'; btnRed.classList.add('active'); btnBlue.classList.remove('active'); });
btnBlue.addEventListener('click', () => { selectedTeam = 'blue'; btnBlue.classList.add('active'); btnRed.classList.remove('active'); });

btnPlay.addEventListener('click', () => {
    const name = nicknameInput.value.trim() || "Jogador";
    let roomData = { name, team: selectedTeam, mode: currentMode };
    if (currentMode === 'create') {
        roomData.roomId = document.getElementById('create-room-id').value.trim();
        roomData.password = document.getElementById('create-room-pass').value;
        roomData.duration = parseInt(document.getElementById('match-time').value);
    } else {
        roomData.roomId = document.getElementById('join-room-id').value.trim();
        roomData.password = document.getElementById('join-room-pass').value;
    }
    if (!roomData.roomId) return alert("Por favor, digite o ID da sala.");
    socket.emit('joinOrCreateRoom', roomData);
});

socket.on('roomResponse', (response) => {
    if (response.success) {
        menuContainer.classList.add('hidden');
        lobbyContainer.classList.remove('hidden');
        lobbyTitle.innerText = `Sala: ${response.roomId}`;
    } else {
        alert(response.message);
    }
});

socket.on('lobbyUpdate', (data) => {
    listRed.innerHTML = ""; listBlue.innerHTML = "";
    for (let id in data.players) {
        let p = data.players[id]; let li = document.createElement('li');
        li.innerText = p.name; if (p.isAdmin) li.innerHTML += `<span class="admin-badge">HOST</span>`;
        if (p.team === 'red') listRed.appendChild(li); else listBlue.appendChild(li);
    }
    if (data.adminId === socket.id) { btnStartMatch.classList.remove('hidden'); waitMessage.classList.add('hidden'); } 
    else { btnStartMatch.classList.add('hidden'); waitMessage.classList.remove('hidden'); }
});

btnStartMatch.addEventListener('click', () => { socket.emit('startMatchSignal'); });
socket.on('matchStarted', () => { lobbyContainer.classList.add('hidden'); gameContainer.classList.remove('hidden'); setupInputListeners(); });

socket.on('gameState', (data) => {
    clientPlayers = data.players;
    clientBall = data.ball;
    gameOverOverlay = data.gameOver;
    if (data.score) scoreboard.innerHTML = `🔴 Red ${data.score.red} - ${data.score.blue} Blue 🔵`;
    if (data.timeString) timerDisplay.innerHTML = `⏱️ ${data.timeString}`;
    
    // Foco da câmera no jogador local
    let myPlayer = clientPlayers[socket.id];
    if (myPlayer) {
        camera.x = myPlayer.x - canvas.width / 2;
        camera.y = myPlayer.y - canvas.height / 2;
    } else {
        camera.x = clientBall.x - canvas.width / 2;
        camera.y = clientBall.y - canvas.height / 2;
    }

    // Trava os limites da câmera dentro do estádio
    if (camera.x < 0) camera.x = 0;
    if (camera.y < 0) camera.y = 0;
    if (camera.x > WORLD_WIDTH - canvas.width) camera.x = WORLD_WIDTH - canvas.width;
    if (camera.y > WORLD_HEIGHT - canvas.height) camera.y = WORLD_HEIGHT - canvas.height;
});

function sendChatMessage() {
    let msg = chatInput.value.trim(); if (!msg) return;
    socket.emit('sendRoomChat', msg); chatInput.value = "";
}
btnSendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

socket.on('receiveRoomChat', (data) => {
    let div = document.createElement('div'); div.className = "chat-msg";
    div.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
    chatMessages.appendChild(div); chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('goalScored', () => { goalOverlayActive = true; setTimeout(() => { goalOverlayActive = false; }, 1500); });
socket.on('matchEnded', (winner) => { overlayText = winner === 'draw' ? "FIM DE JOGO: EMPATE!" : `FIM DE JOGO: TIME ${winner.toUpperCase()} VENCEU!`; });

function setupInputListeners() {
    window.addEventListener('keydown', (e) => {
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') inputState.up = true;
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') inputState.down = true;
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') inputState.left = true;
        if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') inputState.right = true;
        if (e.key === ' ' || e.key.toLowerCase() === 'x') inputState.kick = true;
        socket.emit('playerInput', inputState);
    });
    window.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') inputState.up = false;
        if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') inputState.down = false;
        if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') inputState.left = false;
        if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') inputState.right = false;
        if (e.key === ' ' || e.key.toLowerCase() === 'x') inputState.kick = false;
        socket.emit('playerInput', inputState);
    });
}

function drawField() {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; ctx.lineWidth = 4;
    ctx.strokeRect(FIELD_MARGIN, 0, WORLD_WIDTH - (FIELD_MARGIN * 2), WORLD_HEIGHT);

    ctx.beginPath(); ctx.moveTo(WORLD_WIDTH / 2, 0); ctx.lineTo(WORLD_WIDTH / 2, WORLD_HEIGHT); ctx.stroke();
    ctx.beginPath(); ctx.arc(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, 120, 0, Math.PI * 2); ctx.stroke();
    
    ctx.lineWidth = 3; ctx.strokeStyle = "#ff4d4d";
    ctx.strokeRect(FIELD_MARGIN - GOAL_WIDTH, GOAL_TOP, GOAL_WIDTH, GOAL_BOTTOM - GOAL_TOP);
    ctx.strokeStyle = "#4da6ff";
    ctx.strokeRect(WORLD_WIDTH - FIELD_MARGIN, GOAL_TOP, GOAL_WIDTH, GOAL_BOTTOM - GOAL_TOP);
    
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 2;
    const posts = [{x: FIELD_MARGIN, y: GOAL_TOP}, {x: FIELD_MARGIN, y: GOAL_BOTTOM}, {x: WORLD_WIDTH - FIELD_MARGIN, y: GOAL_TOP}, {x: WORLD_WIDTH - FIELD_MARGIN, y: GOAL_BOTTOM}];
    posts.forEach(post => { 
        ctx.beginPath(); 
        ctx.arc(post.x, post.y, 8, 0, Math.PI * 2); 
        ctx.fill(); 
        ctx.stroke(); // Corrigido aqui perfeitamente
    });
}

function drawPlayers() {
    for (let id in clientPlayers) {
        let p = clientPlayers[id]; if (!p.name) continue;
        ctx.strokeStyle = p.input && p.input.kick ? '#ffea00' : '#ffffff';
        ctx.lineWidth = p.input && p.input.kick ? 4 : 2; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.font = "bold 13px Arial"; ctx.textAlign = "center";
        ctx.strokeStyle = "#000000"; ctx.lineWidth = 3;
        ctx.strokeText(p.name, p.x, p.y - p.radius - 6); ctx.fillText(p.name, p.x, p.y - p.radius - 6);
    }
}

function drawBall() {
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(clientBall.x, clientBall.y, clientBall.radius, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000000'; ctx.stroke();
}

function drawStaticOverlays() {
    if (goalOverlayActive && !gameOverOverlay) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffea00"; ctx.font = "bold 60px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("¡¡¡ GOOOL !!!", canvas.width / 2, canvas.height / 2);
        if (gameOverOverlay) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "#ff3333"; 
            ctx.font = "bold 40px Arial"; 
            ctx.textAlign = "center"; 
            ctx.textBaseline = "middle";
            ctx.fillText(overlayText, canvas.width / 2, canvas.height / 2);
        }
    }
}

function gameLoop() {
    ctx.fillStyle = "#4b8b3b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(-camera.x, -camera.y);

    drawField(); 
    drawPlayers(); 
    drawBall();

    ctx.restore();

    drawStaticOverlays();
    requestAnimationFrame(gameLoop);
}

gameLoop();
