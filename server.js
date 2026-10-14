const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { startGame, evaluateTrick, checkHandWinner, startHand, getCardPower } = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
const rooms = {};
const disconnectionTimeouts = {};

// ─── Cálculo de MVP da Partida ────────────────────────────────────────────────
function calculateMVP(state, winnerTeam) {
    if (!state || !state.matchStats || !state.matchStats.playerStats) return null;
    const candidates = state.players.filter((_, idx) => (idx % 2) === winnerTeam);
    if (!candidates || candidates.length === 0) return null;

    let bestPlayer = null;
    let maxPoints = -1;

    candidates.forEach(p => {
        const stats = state.matchStats.playerStats[p.id];
        if (!stats) return;
        const mvpScore = (stats.tricksWon * 20) + (stats.decisiveTricksWon * 35) + (stats.trucosWon * 25) + (stats.manilhasPlayed * 10);
        if (mvpScore > maxPoints) {
            maxPoints = mvpScore;
            bestPlayer = {
                id: p.id,
                name: p.name,
                avatar: p.avatar || '🤠',
                title: p.title || 'Campeão',
                mvpScore,
                tricksWon: stats.tricksWon,
                decisiveTricksWon: stats.decisiveTricksWon,
                trucosCalled: stats.trucosCalled,
                trucosWon: stats.trucosWon,
                manilhasPlayed: stats.manilhasPlayed
            };
        }
    });

    return bestPlayer || {
        id: candidates[0].id,
        name: candidates[0].name,
        avatar: candidates[0].avatar || '🤠',
        title: candidates[0].title || 'Campeão',
        mvpScore: 50,
        tricksWon: 1,
        decisiveTricksWon: 1,
        trucosCalled: 0,
        trucosWon: 0,
        manilhasPlayed: 0
    };
}

// ─── Emite o estado do jogo para cada jogador individualmente ─────────────────
function emitGameState(roomCode, state) {
    const room = rooms[roomCode];
    if (!room) return;
    const numPlayers = room.players.length;

    room.players.forEach((player, index) => {
        let partnerHand = [];
        const team = index % 2;

        // Parceiro só existe em 2v2 (4 jogadores)
        if (numPlayers === 4) {
            const partnerIndex = (index + 2) % 4;
            if (state.isMaoDe11 && !state.maoDe11Answered && team === state.maoDe11Team) {
                partnerHand = state.hands[room.players[partnerIndex].id] || [];
            }
        }

        io.to(player.id).emit('updateState', {
            hand:             state.hands[player.id] || [],
            partnerHand:      partnerHand,
            vira:             state.vira,
            turnId:           state.turn,
            score:            state.score,
            trickResults:     state.trickResults,
            handValue:        state.handValue,
            isMaoDe11:        state.isMaoDe11,
            maoDe11Team:      state.maoDe11Team,
            maoDe11Answered:  state.maoDe11Answered,
            trucoLevel:       state.trucoLevel,
            lastTrucoTeam:    state.lastTrucoTeam,
            tableCards:       state.tableCards || [],
            tableCardsCount:  (state.tableCards ? state.tableCards.length : 0),
            manilhaValue:     state.manilhaValue,
            variant:          state.variant,
            gameMode:         state.gameMode
        });
    });
}

// ─── Conexão ──────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {

    // ── Criar sala ────────────────────────────────────────────────────────────
    socket.on('createRoom', ({ playerName, token, gameMode, variant, avatar, title }) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        const mode = gameMode || '2v2';
        const varnt = variant || 'paulista';

        rooms[roomCode] = {
            players: [{
                id: socket.id,
                name: playerName,
                token,
                avatar: avatar || '🤠',
                title: title || 'Truqueiro Raiz',
                disconnected: false
            }],
            gameMode: mode,
            variant: varnt
        };
        socket.join(roomCode);
        socket.emit('roomCreated', { roomCode, playerName, gameMode: mode, variant: varnt });
        console.log(`${playerName} criou a sala ${roomCode} [${mode} / ${varnt}]`);
    });

    // ── Entrar na sala ────────────────────────────────────────────────────────
    socket.on('joinRoom', ({ roomCode, playerName, token, avatar, title }) => {
        const room = rooms[roomCode];
        if (!room) { socket.emit('errorMsg', 'Sala não encontrada.'); return; }

        const maxPlayers = room.gameMode === '1v1' ? 2 : 4;

        // Reconexão de jogador existente
        const existingPlayer = room.players.find(p => p.token === token);
        if (existingPlayer) {
            const oldSocketId = existingPlayer.id;
            existingPlayer.id = socket.id;
            existingPlayer.disconnected = false;
            if (avatar) existingPlayer.avatar = avatar;
            if (title) existingPlayer.title = title;

            socket.join(roomCode);
            if (disconnectionTimeouts[token]) {
                clearTimeout(disconnectionTimeouts[token]);
                delete disconnectionTimeouts[token];
            }
            if (room.gameState) {
                if (room.gameState.turn === oldSocketId) room.gameState.turn = socket.id;
                room.gameState.tableCards.forEach(tc => { if (tc.playerId === oldSocketId) tc.playerId = socket.id; });
                if (room.gameState.hands[oldSocketId]) {
                    room.gameState.hands[socket.id] = room.gameState.hands[oldSocketId];
                    delete room.gameState.hands[oldSocketId];
                }
                const allConnected = room.players.every(p => !p.disconnected);
                if (allConnected) {
                    room.gameState.isProcessing = !room.gameState.maoDe11Answered;
                    io.to(roomCode).emit('playerReconnected', { playerName: existingPlayer.name });
                }
                socket.emit('gameReady', { message: 'Reconectado', players: room.players, gameMode: room.gameMode, variant: room.variant });
                emitGameState(roomCode, room.gameState);
            } else {
                io.to(roomCode).emit('playerJoined', { roomCode, players: room.players, gameMode: room.gameMode, variant: room.variant });
            }
            return;
        }

        // Novo jogador
        if (room.players.length < maxPlayers) {
            room.players.push({
                id: socket.id,
                name: playerName,
                token,
                avatar: avatar || '🤠',
                title: title || 'Truqueiro Raiz',
                disconnected: false
            });
            socket.join(roomCode);
            io.to(roomCode).emit('playerJoined', { roomCode, players: room.players, gameMode: room.gameMode, variant: room.variant });

            if (room.players.length === maxPlayers) {
                io.to(roomCode).emit('gameReady', {
                    message: 'Iniciando jogo...',
                    players: room.players,
                    gameMode: room.gameMode,
                    variant: room.variant
                });
                room.gameState = startGame(room.players, { variant: room.variant, gameMode: room.gameMode });
                setTimeout(() => emitGameState(roomCode, room.gameState), 2000);
            }
        } else {
            socket.emit('errorMsg', 'Sala cheia ou inválida.');
        }
    });

    // ── Sair da sala ──────────────────────────────────────────────────────────
    socket.on('leaveRoom', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;
        socket.leave(roomCode);
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
            const player = room.players[playerIndex];
            room.players.splice(playerIndex, 1);
            io.to(roomCode).emit('playerLeft', { playerId: socket.id, playerName: player.name });
            if (room.players.length === 0) {
                delete rooms[roomCode];
            } else if (room.gameState) {
                io.to(roomCode).emit('errorMsg', `${player.name} saiu da partida.`);
            }
        }
    });

    // ── Sinais Secretos de Dupla (Truco Raiz) ──────────────────────────────────
    socket.on('sendSecretSignal', ({ roomCode, signalId }) => {
        const room = rooms[roomCode];
        if (!room || !room.players || room.players.length !== 4) return;
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return;
        const partnerIndex = (playerIndex + 2) % 4;
        const partner = room.players[partnerIndex];
        const sender = room.players[playerIndex];
        if (partner && partner.id) {
            io.to(partner.id).emit('secretSignalReceived', {
                senderId: socket.id,
                senderName: sender.name,
                signalId
            });
        }
    });

    // ── Status das Salas Recentes e Pontuação ──────────────────────────────────
    socket.on('getRecentRoomsStatus', ({ token, localRoomCodes = [] }) => {
        const list = [];
        const codesToInspect = new Set(localRoomCodes || []);

        // Adiciona todas as salas onde o token deste jogador está registrado
        for (const code in rooms) {
            if (rooms[code].players.some(p => p.token === token)) {
                codesToInspect.add(code);
            }
        }

        codesToInspect.forEach(code => {
            const room = rooms[code];
            if (room) {
                const is1v1 = (room.gameMode === '1v1');
                const teamAName = is1v1 ? (room.players[0]?.name || 'Jogador A') : 'Dupla A';
                const teamBName = is1v1 ? (room.players[1]?.name || 'Jogador B') : 'Dupla B';
                const score = room.gameState ? (room.gameState.score || [0, 0]) : [0, 0];
                const isFinished = room.gameState && (score[0] >= 12 || score[1] >= 12);
                const isPlaying = !!room.gameState && !isFinished;
                const myPlayer = room.players.find(p => p.token === token);

                list.push({
                    roomCode: code,
                    gameMode: room.gameMode || '2v2',
                    variant: room.variant || 'paulista',
                    score,
                    scoreText: `${teamAName} ${score[0]} × ${score[1]} ${teamBName}`,
                    status: isFinished ? 'finished' : (isPlaying ? 'playing' : 'waiting'),
                    playersCount: room.players.length,
                    maxPlayers: is1v1 ? 2 : 4,
                    hasActiveMatch: isPlaying && !!myPlayer,
                    myTeam: myPlayer ? (room.players.indexOf(myPlayer) % 2) : -1
                });
            }
        });

        socket.emit('recentRoomsStatus', list);
    });

    // ── Jogar carta ───────────────────────────────────────────────────────────
    socket.on('playCard', ({ roomCode, card, hidden, slam }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameState) return;
        const state = room.gameState;
        const numPlayers = state.players.length;

        if (state.turn !== socket.id || state.isProcessing || (state.trucoAnsweringTeam !== null && state.trucoAnsweringTeam !== undefined)) {
            socket.emit('playCardRejected', {
                reason: (state.isProcessing || (state.trucoAnsweringTeam !== null && state.trucoAnsweringTeam !== undefined)) ? 'Aguarde a resposta do Truco para jogar!' : 'Não é a sua vez de jogar!'
            });
            emitGameState(roomCode, state);
            return;
        }

        if (hidden && state.trickResults.length === 0) hidden = false;
        if (hidden) card.hidden = true;

        const hand = state.hands[socket.id];
        if (!hand) return;
        const cardIndex = hand.findIndex(c => c.value === card.value && c.suit === card.suit);
        if (cardIndex === -1) {
            socket.emit('playCardRejected', { reason: 'Carta não encontrada na mão!' });
            emitGameState(roomCode, state);
            return;
        }
        hand.splice(cardIndex, 1);

        const cardPower = getCardPower(card, state.manilhaValue, state.variant);
        const isManilha = (cardPower >= 100);
        const isSlam = (!!slam || isManilha);
        if (isManilha && state.matchStats && state.matchStats.playerStats[socket.id]) {
            state.matchStats.playerStats[socket.id].manilhasPlayed++;
        }

        state.tableCards.push({ playerId: socket.id, card });

        // Vaza incompleta — próximo jogador
        if (state.tableCards.length < numPlayers) {
            state.turnIndex = (state.turnIndex + 1) % numPlayers;
            state.turn = state.players[state.turnIndex].id;
            io.to(roomCode).emit('cardPlayed', { playerId: socket.id, card, isManilha, isSlam, nextTurnId: state.turn });
        }
        // Vaza completa — avaliar resultado
        else {
            state.isProcessing = true;
            state.turn = null;
            io.to(roomCode).emit('cardPlayed', { playerId: socket.id, card, isManilha, isSlam, nextTurnId: null });

            const result = evaluateTrick(state.tableCards, state.manilhaValue, state.players, state.variant);
            state.trickResults.push(result.winnerTeam);

            if (result.winnerTeam !== -1 && result.topPlayerId) {
                state.turnIndex = state.players.findIndex(p => p.id === result.topPlayerId);
                if (state.matchStats && state.matchStats.playerStats[result.topPlayerId]) {
                    state.matchStats.playerStats[result.topPlayerId].tricksWon++;
                    if (state.trickResults.length === 3) {
                        state.matchStats.playerStats[result.topPlayerId].decisiveTricksWon++;
                    }
                }
            }

            const handWinner = checkHandWinner(state.trickResults);

            setTimeout(() => {
                try {
                    io.to(roomCode).emit('trickEnded', {
                        trickResults: state.trickResults,
                        winnerTeam: result.winnerTeam,
                        topPlayerId: result.topPlayerId
                    });
                    state.tableCards = [];

                    if (handWinner !== null) {
                        if (state.matchStats) {
                            state.matchStats.handsPlayed++;
                            if (handWinner !== -1 && state.trucoLevel > 0) {
                                state.players.forEach((p, idx) => {
                                    if ((idx % 2) === handWinner && state.matchStats.playerStats[p.id]) {
                                        state.matchStats.playerStats[p.id].trucosWon++;
                                    }
                                });
                            }
                        }

                        if (handWinner === -1) {
                            io.to(roomCode).emit('handEnded', { score: state.score, winnerTeam: -1, message: 'Mão empatada! Ninguém pontua.' });
                            setTimeout(() => { startHand(state); emitGameState(roomCode, state); }, 3000);
                        } else {
                            state.score[handWinner] += state.handValue;
                            io.to(roomCode).emit('handEnded', { score: state.score, winnerTeam: handWinner });
                            if (state.score[handWinner] >= 12) {
                                io.to(roomCode).emit('gameOver', {
                                    winnerTeam: handWinner,
                                    score: state.score,
                                    stats: state.matchStats,
                                    mvp: calculateMVP(state, handWinner)
                                });
                            } else {
                                setTimeout(() => { startHand(state); emitGameState(roomCode, state); }, 3000);
                            }
                        }
                    } else {
                        // Vaza intermediária: aguarda 700ms para a animação de recolhimento antes de liberar a próxima vaza
                        setTimeout(() => {
                            state.turn = state.players[state.turnIndex].id;
                            state.isProcessing = false;
                            emitGameState(roomCode, state);
                        }, 700);
                    }
                } catch (e) {
                    console.error('Erro interno do servidor na rodada:', e);
                    state.isProcessing = false;
                }
            }, 1800);
        }
    });

    // ── Pedir Truco ───────────────────────────────────────────────────────────
    socket.on('callTruco', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameState) return;
        const state = room.gameState;

        const myIndex = state.players.findIndex(p => p.id === socket.id);
        if (myIndex === -1) return;
        const myTeam = myIndex % 2;

        if (state.trucoAnsweringTeam !== null && state.trucoAnsweringTeam !== undefined) {
            socket.emit('errorMsg', 'Já existe um pedido de Truco aguardando resposta!');
            return;
        }

        if (!state.turn || state.isProcessing) {
            socket.emit('errorMsg', 'Aguarde a jogada atual antes de pedir Truco!');
            return;
        }

        // Regra do Truco: só pode pedir truco quando for a vez da sua equipe
        const currentTurnPlayerIndex = state.players.findIndex(p => p.id === state.turn);
        if (currentTurnPlayerIndex !== -1) {
            const currentTurnTeam = currentTurnPlayerIndex % 2;
            if (myTeam !== currentTurnTeam) {
                socket.emit('errorMsg', 'Você só pode pedir Truco na vez da sua equipe!');
                return;
            }
        }

        if (state.lastTrucoTeam === myTeam) {
            socket.emit('errorMsg', 'Sua equipe já aumentou a aposta!');
            return;
        }
        if (state.isMaoDe11 || state.score[0] === 11 || state.score[1] === 11) {
            socket.emit('errorMsg', 'Não é permitido pedir Truco na Mão de 11!');
            return;
        }
        if (state.trucoLevel >= 4) {
            socket.emit('errorMsg', 'A aposta já está no valor máximo (12)!');
            return;
        }

        const values = [1, 3, 6, 9, 12];
        const nextVal = values[state.trucoLevel + 1] || 12;

        if (state.matchStats) {
            state.matchStats.trucosCalledCount++;
            if (state.matchStats.playerStats[socket.id]) {
                state.matchStats.playerStats[socket.id].trucosCalled++;
            }
            if (nextVal > state.matchStats.maxTrucoValue) {
                state.matchStats.maxTrucoValue = nextVal;
            }
        }

        state.lastTrucoTeam = myTeam;
        state.isProcessing = true;
        state.trucoAnsweringTeam = (myTeam === 0 ? 1 : 0);
        state.trucoRunVoters = [];
        state.trucoLevel++;

        io.to(roomCode).emit('trucoRequested', {
            requestedBy: socket.id,
            newValue: values[state.trucoLevel],
            answeringTeam: state.trucoAnsweringTeam
        });
    });

    // ── Responder Truco ───────────────────────────────────────────────────────
    socket.on('respondTruco', ({ roomCode, response }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameState) return;
        const state = room.gameState;

        const myIndex = state.players.findIndex(p => p.id === socket.id);
        const myTeam = myIndex % 2;
        const values = [1, 3, 6, 9, 12];

        if (response === 'accept') {
            state.trucoRunVoters = [];
            state.handValue = values[state.trucoLevel];
            state.isProcessing = false;
            state.trucoAnsweringTeam = null;
            io.to(roomCode).emit('trucoAccepted', { newValue: state.handValue, nextTurnId: state.turn });
            emitGameState(roomCode, state);
        }
        else if (response === 'run') {
            if (!state.trucoRunVoters) state.trucoRunVoters = [];
            if (!state.trucoRunVoters.includes(socket.id)) state.trucoRunVoters.push(socket.id);

            const answeringPlayers = state.players.filter((_, i) => i % 2 === myTeam);
            const allVotedToRun = answeringPlayers.every(p => state.trucoRunVoters.includes(p.id));

            if (allVotedToRun) {
                state.trucoRunVoters = [];
                state.trucoAnsweringTeam = null;
                const winnerTeam = myTeam === 0 ? 1 : 0;
                state.score[winnerTeam] += values[state.trucoLevel - 1];
                io.to(roomCode).emit('trucoCanceled');
                io.to(roomCode).emit('trickEnded', { trickResults: state.trickResults, winnerTeam });
                state.tableCards = [];
                if (state.matchStats) {
                    state.matchStats.handsPlayed++;
                    state.players.forEach((p, idx) => {
                        if ((idx % 2) === winnerTeam && state.matchStats.playerStats[p.id]) {
                            state.matchStats.playerStats[p.id].trucosWon++;
                        }
                    });
                }
                if (state.score[winnerTeam] >= 12) {
                    io.to(roomCode).emit('gameOver', {
                        winnerTeam,
                        score: state.score,
                        stats: state.matchStats,
                        mvp: calculateMVP(state, winnerTeam)
                    });
                } else {
                    setTimeout(() => { startHand(state); emitGameState(roomCode, state); }, 3000);
                }
            } else {
                const voterName = state.players.find(p => p.id === socket.id)?.name || 'Jogador';
                io.to(roomCode).emit('trucoRunVotePending', {
                    votedPlayerId: socket.id,
                    votedPlayerName: voterName,
                    answeringTeam: myTeam,
                    votesCount: state.trucoRunVoters.length,
                    votesNeeded: answeringPlayers.length
                });
            }
        }
        else if (response === 'raise') {
            if (state.lastTrucoTeam === myTeam) return;
            state.trucoRunVoters = [];
            state.lastTrucoTeam = myTeam;
            state.isProcessing = true;
            state.trucoLevel++;
            if (state.trucoLevel > 4) state.trucoLevel = 4;
            state.trucoAnsweringTeam = (myTeam === 0 ? 1 : 0);
            io.to(roomCode).emit('trucoRequested', {
                requestedBy: socket.id,
                newValue: values[state.trucoLevel],
                answeringTeam: state.trucoAnsweringTeam
            });
        }
    });

    // ── Responder Mão de 11 ───────────────────────────────────────────────────
    socket.on('respondMaoDe11', ({ roomCode, response }) => {
        const room = rooms[roomCode];
        if (!room || !room.gameState) return;
        const state = room.gameState;

        if (state.maoDe11Answered || !state.isMaoDe11) return;

        if (response === 'accept') {
            state.maoDe11Answered = true;
            state.isProcessing = false;
            io.to(roomCode).emit('maoDe11Accepted');
            emitGameState(roomCode, state);
        } else if (response === 'run') {
            state.maoDe11Answered = true;
            state.isProcessing = true;
            const winnerTeam = state.maoDe11Team === 0 ? 1 : 0;
            state.score[winnerTeam] += 1;
            io.to(roomCode).emit('trickEnded', { trickResults: state.trickResults, winnerTeam });
            state.tableCards = [];
            if (state.matchStats) state.matchStats.handsPlayed++;
            if (state.score[winnerTeam] >= 12) {
                io.to(roomCode).emit('handEnded', { score: state.score, winnerTeam, message: 'A equipe correu da Mão de 11!' });
                io.to(roomCode).emit('gameOver', {
                    winnerTeam,
                    score: state.score,
                    stats: state.matchStats,
                    mvp: calculateMVP(state, winnerTeam)
                });
                return;
            }
            io.to(roomCode).emit('handEnded', { score: state.score, winnerTeam, message: 'A equipe correu da Mão de 11!' });
            setTimeout(() => { startHand(state); emitGameState(roomCode, state); }, 3000);
        }
    });

    // ── Jogar Novamente (Nova Partida na mesma sala) ───────────────────────────
    socket.on('playAgain', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room) return;

        console.log(`Sala ${roomCode}: reiniciando partida a pedido de ${socket.id}...`);
        room.gameState = startGame(room.players, { variant: room.variant, gameMode: room.gameMode });
        io.to(roomCode).emit('gameRestarted', {
            message: 'Nova partida iniciada!',
            players: room.players,
            gameMode: room.gameMode,
            variant: room.variant
        });
        setTimeout(() => emitGameState(roomCode, room.gameState), 1200);
    });

    // ── Emoji ─────────────────────────────────────────────────────────────────
    socket.on('sendEmoji', ({ roomCode, emoji }) => {
        io.to(roomCode).emit('showEmoji', { playerId: socket.id, emoji });
    });

    // ── Chat em Tempo Real ────────────────────────────────────────────────────
    socket.on('sendChatMessage', ({ roomCode, message }) => {
        const room = rooms[roomCode];
        if (!room || !message) return;

        const cleanMsg = String(message).trim().substring(0, 140);
        if (!cleanMsg) return;

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        const player = room.players[playerIndex];
        const playerName = player ? player.name : 'Jogador';
        const playerTeam = playerIndex !== -1 ? (playerIndex % 2) : 0;

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        io.to(roomCode).emit('chatMessageReceived', {
            playerId: socket.id,
            playerName,
            playerAvatar: player ? (player.avatar || '🤠') : '🤠',
            playerTitle: player ? (player.title || 'Truqueiro') : 'Truqueiro',
            playerTeam,
            message: cleanMsg,
            time: timeStr
        });
    });

    // ── Desconexão ────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
        console.log('Usuário desconectou:', socket.id);
        for (let code in rooms) {
            const room = rooms[code];
            const p = room.players.find(pl => pl.id === socket.id);
            if (p) {
                p.disconnected = true;
                if (room.gameState) {
                    room.gameState.isProcessing = true;
                    io.to(code).emit('playerDisconnected', { playerName: p.name });
                    disconnectionTimeouts[p.token] = setTimeout(() => {
                        io.to(code).emit('errorMsg', 'Jogador não reconectou a tempo. Jogo cancelado.');
                        delete rooms[code];
                    }, 30000);
                }
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));