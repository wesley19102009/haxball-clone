const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Permite que qualquer pessoa conecte no seu jogo online
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 500;
const FIELD_MARGIN = 50; const GOAL_WIDTH = 40;
const GOAL_TOP = CANVAS_HEIGHT / 3; const GOAL_BOTTOM = (CANVAS_HEIGHT / 3) * 2;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

let rooms = {};

function createRoomState(durationMinutes, hostId) {
    return {
        adminId: hostId,
        matchActive: false, // Nova flag: Partida começa pausada no Lobby
        players: {},
        score: { red: 0, blue: 0 },
        ball: { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2, vx: 0, vy: 0, radius: 10, friction: 0.98 },
        timeLeft: durationMinutes * 60,
        gameOver: false,
        winner: null,
        password: ""
    };
}

function resetMatch(room) {
    room.ball.x = CANVAS_WIDTH / 2; room.ball.y = CANVAS_HEIGHT / 2;
    room.ball.vx = 0; room.ball.vy = 0;
    for (let id in room.players) {
        let p = room.players[id];
        p.x = p.team === 'red' ? CANVAS_WIDTH / 4 + FIELD_MARGIN : (CANVAS_WIDTH / 4) * 3 - FIELD_MARGIN;
        p.y = CANVAS_HEIGHT / 2;
    }
}

function updateLobby(roomId) {
    let room = rooms[roomId];
    if (!room) return;
    io.to(roomId).emit('lobbyUpdate', {
        players: room.players,
        adminId: room.adminId
    });
}

io.on('connection', (socket) => {
    let currentRoomId = null;

    socket.on('joinOrCreateRoom', (data) => {
        const { roomId, password, name, team, mode, duration } = data;

        if (mode === 'create') {
            if (rooms[roomId]) return socket.emit('roomResponse', { success: false, message: "Esta sala já existe!" });
            rooms[roomId] = createRoomState(duration || 5, socket.id);
            rooms[roomId].password = password || "";
        } else {
            if (!rooms[roomId]) return socket.emit('roomResponse', { success: false, message: "Sala não encontrada!" });
            if (rooms[roomId].password !== "" && rooms[roomId].password !== password) {
                return socket.emit('roomResponse', { success: false, message: "Senha incorreta!" });
            }
        }

        socket.join(roomId);
        currentRoomId = roomId;
        let room = rooms[roomId];

        room.players[socket.id] = {
            id: socket.id,
            name: name,
            team: team,
            color: team === 'red' ? '#ff4d4d' : '#4da6ff',
            radius: 15, speed: 4,
            x: team === 'red' ? CANVAS_WIDTH / 4 + FIELD_MARGIN : (CANVAS_WIDTH / 4) * 3 - FIELD_MARGIN,
            y: CANVAS_HEIGHT / 2,
            isAdmin: socket.id === room.adminId,
            input: { up: false, down: false, left: false, right: false, kick: false }
        };

        socket.emit('roomResponse', { success: true, roomId });
        updateLobby(roomId);
    });

    // Recebe o comando do Host para dar início oficial ao jogo
    socket.on('startMatchSignal', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            let room = rooms[currentRoomId];
            if (socket.id === room.adminId && !room.matchActive) {
                room.matchActive = true;
                io.to(currentRoomId).emit('matchStarted');
            }
        }
    });

    // Evento do Chat do Lobby
    socket.on('sendRoomChat', (msg) => {
        if (currentRoomId && rooms[currentRoomId]) {
            let room = rooms[currentRoomId];
            let senderName = room.players[socket.id] ? room.players[socket.id].name : "Anônimo";
            io.to(currentRoomId).emit('receiveRoomChat', { sender: senderName, message: msg });
        }
    });

    socket.on('playerInput', (inputState) => {
        if (currentRoomId && rooms[currentRoomId]) {
            let room = rooms[currentRoomId];
            if (room.players[socket.id] && room.matchActive && !room.gameOver) {
                room.players[socket.id].input = inputState;
            }
        }
    });

    socket.on('disconnect', () => {
        if (currentRoomId && rooms[currentRoomId]) {
            let room = rooms[currentRoomId];
            delete room.players[socket.id];
            
            if (Object.keys(room.players).length === 0) {
                delete rooms[currentRoomId];
            } else {
                // Se o admin saiu, passa o Host para o próximo da lista
                if (socket.id === room.adminId) {
                    room.adminId = Object.keys(room.players)[0];
                    if (room.players[room.adminId]) room.players[room.adminId].isAdmin = true;
                }
                updateLobby(currentRoomId);
            }
        }
    });
});

// Engine Loop - 60Hz
let frameCount = 0;
setInterval(() => {
    frameCount++;
    const secondPassed = frameCount % 60 === 0;

    for (let roomId in rooms) {
        let room = rooms[roomId];
        if (!room.matchActive) continue; // Pula a física se a partida não começou!

        if (room.gameOver) {
            io.to(roomId).emit('gameState', { players: room.players, ball: room.ball, score: room.score, timeString: "00:00", gameOver: true });
            continue;
        }

        if (secondPassed && room.timeLeft > 0) {
            room.timeLeft--;
            if (room.timeLeft <= 0) {
                room.gameOver = true;
                room.winner = room.score.red > room.score.blue ? 'red' : (room.score.blue > room.score.red ? 'blue' : 'draw');
                io.to(roomId).emit('matchEnded', room.winner);
            }
        }

        let mins = Math.floor(room.timeLeft / 60).toString().padStart(2, '0');
        let secs = (room.timeLeft % 60).toString().padStart(2, '0');
        let timeString = `${mins}:${secs}`;

        // Movimentação
        for (let id in room.players) {
            let p = room.players[id];
            if (p.input.up) p.y -= p.speed; if (p.input.down) p.y += p.speed;
            if (p.input.left) p.x -= p.speed; if (p.input.right) p.x += p.speed;

            if (p.x - p.radius < FIELD_MARGIN) p.x = FIELD_MARGIN + p.radius;
            if (p.x + p.radius > CANVAS_WIDTH - FIELD_MARGIN) p.x = CANVAS_WIDTH - FIELD_MARGIN - p.radius;
            if (p.y - p.radius < 0) p.y = p.radius; if (p.y + p.radius > CANVAS_HEIGHT) p.y = CANVAS_HEIGHT - p.radius;

            let dx = room.ball.x - p.x; let dy = room.ball.y - p.y;
            let distance = Math.sqrt(dx * dx + dy * dy); let minDist = p.radius + room.ball.radius;

            if (distance < minDist) {
                let nx = dx / distance; let ny = dy / distance;
                let pushForce = p.input.kick ? 12 : 3;
                room.ball.vx = nx * pushForce; room.ball.vy = ny * pushForce;
                let overlap = minDist - distance; room.ball.x += nx * overlap; room.ball.y += ny * overlap;
            }
        }

        room.ball.x += room.ball.vx; room.ball.y += room.ball.vy;
        room.ball.vx *= room.ball.friction; room.ball.vy *= room.ball.friction;

        if (room.ball.y - room.ball.radius < 0) { room.ball.y = room.ball.radius; room.ball.vy *= -0.8; }
        if (room.ball.y + room.ball.radius > CANVAS_HEIGHT) { room.ball.y = room.ball.radius; room.ball.vy *= -0.8; }

        if (room.ball.x - room.ball.radius < FIELD_MARGIN) {
            if (room.ball.y < GOAL_TOP || room.ball.y > GOAL_BOTTOM) { room.ball.x = FIELD_MARGIN + room.ball.radius; room.ball.vx *= -0.8; }
            else if (room.ball.x - room.ball.radius <= FIELD_MARGIN - GOAL_WIDTH) { room.score.blue += 1; resetMatch(room); io.to(roomId).emit('goalScored'); }
        }
        if (room.ball.x + room.ball.radius > CANVAS_WIDTH - FIELD_MARGIN) {
            if (room.ball.y < GOAL_TOP || room.ball.y > GOAL_BOTTOM) { room.ball.x = CANVAS_WIDTH - FIELD_MARGIN - room.ball.radius; room.ball.vx *= -0.8; }
            else if (room.ball.x + room.ball.radius >= CANVAS_WIDTH - FIELD_MARGIN + GOAL_WIDTH) { room.score.red += 1; resetMatch(room); io.to(roomId).emit('goalScored'); }
        }

        io.to(roomId).emit('gameState', { players: room.players, ball: room.ball, score: room.score, timeString, gameOver: false });
    }
}, 1000 / 60);

server.listen(PORT, () => console.log(`Servidor rodando em: http://localhost:${PORT}`));
