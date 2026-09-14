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

// Elementos de Salas e Abas
const tabCreate = document.getElementById('tab-create');
const tabJoin = document.getElementById('tab-join');
const panelCreate = document.getElementById('panel-create');
const panelJoin = document.getElementById('panel-join');

// Elementos do Lobby e Chat
const lobbyTitle = document.getElementById('lobby-title');
const listRed = document.getElementById('list-red');
const listBlue = document.getElementById('list-blue');
const btnStartMatch = document.getElementById('btn-start-match');
const waitMessage = document.getElementById('wait-message');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

const socket = io();
let clientPlayers = {};
let clientBall = { x: 400, y: 250, radius: 10 };
let goalOverlayActive = false;
let gameOverOverlay = false;
let overlayText = "";

let selectedTeam = 'red';
let currentMode = 'create';

const inputState = { up: false, down: false, left: false, right: false, kick: false };
const FIELD_MARGIN = 50; const GOAL_WIDTH = 40;
const GOAL_TOP = canvas.height / 3; const GOAL_BOTTOM = (canvas.height / 3) * 2;

// Gerenciamento de abas do menu
tabCreate.addEventListener('click', () => { currentMode = 'create'; tabCreate.classList.add('active'); tabJoin.classList.remove('active'); panelCreate.classList.remove('hidden'); panelJoin.classList.add('hidden'); });
tabJoin.addEventListener('click', () => { currentMode = 'join'; tabJoin.classList.add('active'); tabCreate.classList.remove('active'); panelJoin.classList.remove('hidden'); panelCreate.classList.add('hidden'); });
btnRed.addEventListener('click', () => { selectedTeam = 'red'; btnRed.classList.add('active'); btnBlue.classList.remove('active'); });
btnBlue.addEventListener('click', () => { selectedTeam = 'blue'; btnBlue.classList.add('active'); btnRed.classList.remove('active'); });

// Entrar na Sala (Lobby)
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

// Resposta ao tentar entrar na sala
socket.on('roomResponse', (response) => {
    if (response.success) {
        menuContainer.classList.add('hidden');
        lobbyContainer.classList.remove('hidden');
        lobbyTitle.innerText = `Sala: ${response.roomId}`;
    } else {
        alert(response.message);
    }
});

// Atualização do estado do Lobby (Lista de Jogadores e permissões)
socket.on('lobbyUpdate', (data) => {
    listRed.innerHTML = "";
    listBlue.innerHTML = "";
    
    for (let id in data.players) {
        let p = data.players[id];
        let li = document.createElement('li');
        li.innerText = p.name;
        if (p.isAdmin) {
            li.innerHTML += `<span class="admin-badge">HOST</span>`;
        }
        
        if (p.team === 'red') listRed.appendChild(li);
        else listBlue.appendChild(li);
    }

    // Se eu for o Admin (Host) da sala, exibe o botão de Start
    if (data.adminId === socket.id) {
        btnStartMatch.classList.remove('hidden');
        waitMessage.classList.add('hidden');
    } else {
        btnStartMatch.classList.add('hidden');
        waitMessage.classList.remove('hidden');
    }
});

// Ação do Host ao clicar para iniciar a partida
btnStartMatch.addEventListener('click', () => {
    socket.emit('startMatchSignal');
});

// Sinal do servidor para ocultar o Lobby e abrir o Canvas
socket.on('matchStarted', () => {
    lobbyContainer.classList.add('hidden');
    gameContainer.classList.remove('hidden');
    setupInputListeners();
});

// Atualizações da Engine de Jogo
socket.on('gameState', (data) => {
    clientPlayers = data.players;
    clientBall = data.ball;
    gameOverOverlay = data.gameOver;
    
    if (data.score) scoreboard.innerHTML = `🔴 Red ${data.score.red} - ${data.score.blue} Blue 🔵`;
    if (data.timeString) timerDisplay.innerHTML = `⏱️ ${data.timeString}`;
});

// Chat do Lobby
function sendChatMessage() {
    let msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('sendRoomChat', msg);
    chatInput.value = "";
}
btnSendChat.addEventListener('click', sendChatMessage);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChatMessage(); });

socket.on('receiveRoomChat', (data) => {
    let div = document.createElement('div');
    div.className = "chat-msg";
    div.innerHTML = `<strong>${data.sender}:</strong> ${data.message}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

socket.on('goalScored', () => {
    goalOverlayActive = true;
    setTimeout(() => { goalOverlayActive = false; }, 1500);
});

socket.on('matchEnded', (winner) => {
    overlayText = winner === 'draw' ? "FIM DE JOGO: EMPATE!" : `FIM DE JOGO: TIME ${winner.toUpperCase()} VENCEU!`;
    // Opcional: Após alguns segundos do fim, poderia voltar ao lobby.
});

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
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)"; ctx.lineWidth = 4;
    ctx.strokeRect(FIELD_MARGIN, 0, canvas.width - (FIELD_MARGIN * 2), canvas.height);
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, 0); ctx.lineTo(canvas.width / 2, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 80, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = "#ff4d4d";
    ctx.strokeRect(FIELD_MARGIN - GOAL_WIDTH, GOAL_TOP, GOAL_WIDTH, GOAL_BOTTOM - GOAL_TOP);
    ctx.strokeStyle = "#4da6ff";
    ctx.strokeRect(canvas.width - FIELD_MARGIN, GOAL_TOP, GOAL_WIDTH, GOAL_BOTTOM - GOAL_TOP);
    
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#000000"; ctx.lineWidth = 2;
    const posts = [{x: FIELD_MARGIN, y: GOAL_TOP}, {x: FIELD_MARGIN, y: GOAL_BOTTOM}, {x: canvas.width - FIELD_MARGIN, y: GOAL_TOP}, {x: canvas.width - FIELD_MARGIN, y: GOAL_BOTTOM}];
    posts.forEach(post => { ctx.beginPath(); ctx.arc(post.x, post.y, 6, 0, Math.PI * 2); ctx.fill(); stroke(); });
}

function drawPlayers() {
    for (let id in clientPlayers) {
        let p = clientPlayers[id];
        if (!p.name) continue;
        ctx.strokeStyle = p.input && p.input.kick ? '#ffea00' : '#ffffff';
        ctx.lineWidth = p.input && p.input.kick ? 4 : 2; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffffff"; ctx.font = "12px Arial"; ctx.textAlign = "center";
        ctx.strokeStyle = "#000000"; ctx.lineWidth = 3;
        ctx.strokeText(p.name, p.x, p.y - p.radius - 6); ctx.fillText(p.name, p.x, p.y - p.radius - 6);
    }
}

function drawBall() {
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(clientBall.x, clientBall.y, clientBall.radius, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000000'; ctx.stroke();
}

function drawOverlays() {
    if (goalOverlayActive && !gameOverOverlay) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ffea00"; ctx.font = "bold 60px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("¡¡¡ GOOOL !!!", canvas.width / 2, canvas.height / 2);
    }
    if (gameOverOverlay) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#ff3333";
        ctx.font = "bold 40px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(overlayText, canvas.width / 2, canvas.height / 2);
    }
}

function gameLoop() {
    drawField();
    drawPlayers();
    drawBall();
    drawOverlays();
    requestAnimationFrame(gameLoop);
}

gameLoop();
