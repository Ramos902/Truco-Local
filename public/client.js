const socket = io();

let globalPlayers       = [];
let currentRoomCode     = '';
let isMyTurn            = false;
let isPlayingCard       = false;
let isHidingNextCard    = false;
let myTeam              = -1;
let currentGameMode     = '2v2';      // '2v2' | '1v1'
let currentVariant      = 'paulista'; // 'paulista' | 'mineiro'
let currentManilha      = null;
let selectedGameMode    = '2v2';
let selectedVariant     = 'paulista';
let trickCleanTimer     = null;

let userToken = sessionStorage.getItem('trucoToken');
if (!userToken) {
    userToken = Math.random().toString(36).substr(2);
    sessionStorage.setItem('trucoToken', userToken);
}

// ─── Efeitos Sonoros com Web Audio API ─────────────────────────────────────────
class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }
    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
    playCard() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    }
    playTruco() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(130, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.35);
        gain.gain.setValueAtTime(0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
    }
    playWin() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            gain.gain.setValueAtTime(0.25, now + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.09 + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.25);
        });
    }
    playDeal() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.06);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.06);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.06);
    }
    playChat() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    }
}
const sfx = new SoundFX();

// ─── Limpeza Segura de Timers ─────────────────────────────────────────────────
function clearTrickCleanTimer() {
    if (trickCleanTimer) {
        clearTimeout(trickCleanTimer);
        trickCleanTimer = null;
    }
}

// ─── Toggle de Modo / Variante no Lobby ─────────────────────────────────────
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active-mode'));
        btn.classList.add('active-mode');
        selectedGameMode = btn.dataset.mode;
    });
});

document.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active-variant'));
        btn.classList.add('active-variant');
        selectedVariant = btn.dataset.variant;
    });
});

function showGameScreen(code) {
    currentRoomCode = code;
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');
    document.getElementById('displayRoomCode').textContent = code;
}

function getCardStyle(suit) {
    switch (suit) {
        case 'ouros':   return { symbol: '♦', color: 'text-red-600' };
        case 'espadas': return { symbol: '♠', color: 'text-zinc-900' };
        case 'copas':   return { symbol: '♥', color: 'text-red-600' };
        case 'paus':    return { symbol: '♣', color: 'text-zinc-900' };
        default:        return { symbol: '♠', color: 'text-zinc-900' };
    }
}

// ─── Detecção de Manilha ──────────────────────────────────────────────────────
function checkIsManilha(card, manilhaVal, variant) {
    if (!card || card.hidden) return { isManilha: false, label: '' };
    if (variant === 'mineiro') {
        if (card.value === '4' && card.suit === 'paus')    return { isManilha: true, label: 'ZAP' };
        if (card.value === '7' && card.suit === 'copas')   return { isManilha: true, label: '7 COPAS' };
        if (card.value === 'A' && card.suit === 'espadas') return { isManilha: true, label: 'ESPADILHA' };
        if (card.value === '7' && card.suit === 'ouros')   return { isManilha: true, label: '7 OUROS' };
        return { isManilha: false, label: '' };
    }
    if (manilhaVal && card.value === manilhaVal) {
        let label = 'MANILHA';
        if (card.suit === 'paus') label = 'ZAP ♣';
        else if (card.suit === 'copas') label = 'COPAS ♥';
        else if (card.suit === 'espadas') label = 'ESPADAS ♠';
        else if (card.suit === 'ouros') label = 'OUROS ♦';
        return { isManilha: true, label };
    }
    return { isManilha: false, label: '' };
}

function createCardHTML(value, suit, isHidden = false, isSmall = false, isManilha = false, manilhaLabel = '') {
    if (isHidden) {
        const sizeClasses = isSmall ? 'w-14 h-20 md:w-20 md:h-28' : 'w-16 h-24 md:w-24 md:h-36';
        return `<div class="card-back-style ${sizeClasses} rounded-lg shadow-md flex items-center justify-center"><i class="ph ph-spades text-white/30 text-xl md:text-3xl"></i></div>`;
    }
    const { symbol, color } = getCardStyle(suit);
    const sizeClasses = isSmall ? 'w-14 h-20 md:w-20 md:h-28 text-sm md:text-lg' : 'w-16 h-24 md:w-24 md:h-36 text-lg md:text-2xl';
    const manilhaClass = isManilha ? 'manilha-glow ring-2 ring-amber-400' : 'border-zinc-300';
    const badgeHTML = (isManilha && manilhaLabel) ? `<span class="manilha-badge">${manilhaLabel}</span>` : '';

    return `
        <div class="relative bg-white ${sizeClasses} rounded-lg shadow-2xl border ${manilhaClass} flex flex-col justify-between p-1.5 md:p-2 select-none ${color}">
            ${badgeHTML}
            <div class="font-extrabold self-start leading-none tracking-tight">${value}</div>
            <div class="text-2xl md:text-4xl self-center flex-grow flex items-center justify-center font-serif leading-none drop-shadow-sm">${symbol}</div>
            <div class="font-extrabold self-end rotate-180 leading-none tracking-tight">${value}</div>
        </div>
    `;
}

function createFaceDownCardHTML(isHorizontal = false) {
    const sizeClasses = isHorizontal ? 'w-16 h-12 md:w-24 md:h-16' : 'w-12 h-16 md:w-16 md:h-24';
    return `<div class="card-back-style ${sizeClasses} rounded-lg shadow-md"></div>`;
}

function showNotification(msg, color = 'border-yellow-500 text-yellow-400') {
    const banner = document.getElementById('notification-banner');
    banner.textContent = msg;
    banner.className = `absolute top-10 right-10 glass-modal border-l-4 ${color} font-bold text-base md:text-lg px-6 py-4 rounded-xl shadow-2xl z-[80] translate-x-0 transition-all`;
    banner.classList.remove('hidden');
    
    setTimeout(() => {
        banner.classList.add('hidden');
    }, 3200);
}

function updateTurnUI(turnId) {
    isMyTurn = (turnId === socket.id);
    const actionButtons = document.getElementById('action-buttons');
    actionButtons.style.display = isMyTurn ? 'flex' : 'none';

    const turnIndicator = document.getElementById('my-turn-indicator');
    if (isMyTurn) {
        turnIndicator.classList.remove('hidden');
    } else {
        turnIndicator.classList.add('hidden');
    }

    document.querySelectorAll('.player-tag').forEach(el => el.classList.remove('player-turn-active'));
    if (!turnId) return;

    let turnElementId = null;
    if (turnId === socket.id) turnElementId = 'my-name';
    else if (document.getElementById('right-name').dataset.id === turnId) turnElementId = 'right-name';
    else if (document.getElementById('left-name').dataset.id === turnId) turnElementId = 'left-name';
    else if (document.getElementById('partner-name').dataset.id === turnId) turnElementId = 'partner-name';

    if (turnElementId) document.getElementById(turnElementId).classList.add('player-turn-active');
}

// ─── Settings Modal & Áudio ───────────────────────────────────────────────────
const btnSettings       = document.getElementById('btn-settings');
const settingsModal     = document.getElementById('settings-modal');
const btnCloseSettings  = document.getElementById('btn-close-settings');
const colorSelectors    = document.querySelectorAll('.color-selector');
const toggleSoundBtn    = document.getElementById('toggle-sound-btn');
const btnSoundQuick     = document.getElementById('btn-sound-quick');
const iconSoundQuick    = document.getElementById('icon-sound-quick');

btnSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

function updateSoundUI() {
    if (sfx.enabled) {
        toggleSoundBtn.textContent = 'Ativado';
        toggleSoundBtn.className = 'text-xs font-bold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors';
        iconSoundQuick.className = 'ph ph-speaker-high text-xl';
        btnSoundQuick.classList.remove('text-zinc-500');
        btnSoundQuick.classList.add('text-amber-400');
    } else {
        toggleSoundBtn.textContent = 'Silenciado';
        toggleSoundBtn.className = 'text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors';
        iconSoundQuick.className = 'ph ph-speaker-slash text-xl';
        btnSoundQuick.classList.remove('text-amber-400');
        btnSoundQuick.classList.add('text-zinc-500');
    }
}

toggleSoundBtn.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    updateSoundUI();
});

btnSoundQuick.addEventListener('click', () => {
    sfx.enabled = !sfx.enabled;
    updateSoundUI();
    showNotification(sfx.enabled ? "Sons Ativados" : "Sons Silenciados", "border-blue-500 text-blue-400");
});

colorSelectors.forEach(btn => {
    btn.addEventListener('click', (e) => {
        const colorClass = e.target.dataset.color;
        const screens = [document.getElementById('lobby-screen'), document.getElementById('game-screen')];
        screens.forEach(s => {
            s.classList.remove('table-green', 'table-blue', 'table-red');
            s.classList.add(colorClass);
        });
    });
});

// ─── Criação e Entrada na Sala ───────────────────────────────────────────────
document.getElementById('btnCreate').addEventListener('click', () => {
    socket.emit('createRoom', {
        playerName: document.getElementById('playerName').value || 'Jogador',
        token: userToken,
        gameMode: selectedGameMode,
        variant: selectedVariant
    });
});

document.getElementById('btnJoin').addEventListener('click', () => {
    socket.emit('joinRoom', {
        roomCode: document.getElementById('roomCode').value.toUpperCase(),
        playerName: document.getElementById('playerName').value || 'Jogador',
        token: userToken
    });
});

socket.on('roomCreated', data => {
    currentGameMode = data.gameMode || '2v2';
    currentVariant  = data.variant  || 'paulista';
    showGameScreen(data.roomCode);
});

socket.on('playerJoined', data => {
    currentGameMode = data.gameMode || '2v2';
    currentVariant  = data.variant  || 'paulista';
    showGameScreen(data.roomCode);
    const maxPlayers = currentGameMode === '1v1' ? 2 : 4;
    document.getElementById('game-status').textContent =
        `Aguardando jogadores... (${data.players.length}/${maxPlayers})`;
});

socket.on('gameReady', data => {
    globalPlayers   = data.players;
    currentGameMode = data.gameMode || '2v2';
    currentVariant  = data.variant  || 'paulista';

    const myIndex = globalPlayers.findIndex(p => p.id === socket.id);
    myTeam = myIndex % 2;
    const is1v1 = globalPlayers.length === 2;

    document.getElementById('sidebar-label-teamA').textContent = is1v1 ? 'Jogador A' : 'Dupla A';
    document.getElementById('sidebar-label-teamB').textContent = is1v1 ? 'Jogador B' : 'Dupla B';

    if (is1v1) {
        document.getElementById('sidebar-names-teamA').textContent = globalPlayers[0].name;
        document.getElementById('sidebar-names-teamB').textContent = globalPlayers[1].name;
    } else {
        document.getElementById('sidebar-names-teamA').textContent = [globalPlayers[0].name, globalPlayers[2].name].join(' & ');
        document.getElementById('sidebar-names-teamB').textContent = [globalPlayers[1].name, globalPlayers[3].name].join(' & ');
    }

    const modeLabel    = is1v1 ? '1v1' : '2v2';
    const variantLabel = currentVariant === 'mineiro' ? 'Mineiro' : 'Paulista';
    document.getElementById('sidebar-mode-badge').textContent = `${modeLabel} · ${variantLabel}`;

    sfx.playDeal();
});

// ─── Renderiza Carta Jogada na Mesa ──────────────────────────────────────────
function renderPlayedCard(playerId, card, animate = true) {
    const tableCards = document.getElementById('played-cards');
    const cardEl = document.createElement('div');
    cardEl.className = "absolute table-card-shadow z-20 pointer-events-none";

    const myIndex = globalPlayers.findIndex(p => p.id === socket.id);
    const pIndex  = globalPlayers.findIndex(p => p.id === playerId);
    const is1v1   = globalPlayers.length === 2;

    let relativePos;
    if (is1v1) {
        relativePos = (playerId === socket.id) ? 0 : 2; // Em 1v1 o oponente é sempre topo (2)
    } else {
        relativePos = (pIndex - myIndex + 4) % 4;
    }

    // Leve rotação física realista para cartas jogadas na mesa
    const randomTilt = Math.floor(Math.random() * 12) - 6;

    let originX = '0px', originY = '0px';
    if (relativePos === 0) { 
        cardEl.style.bottom = "12px"; cardEl.style.left = "50%";
        cardEl.style.transform = `translateX(-50%) rotate(${randomTilt}deg)`;
        originX = '0px'; originY = '240px';
    } else if (relativePos === 1) { 
        cardEl.style.right = "12px"; cardEl.style.top = "50%";
        cardEl.style.transform = `translateY(-50%) rotate(${90 + randomTilt}deg)`;
        originX = '240px'; originY = '0px';
    } else if (relativePos === 2) { 
        cardEl.style.top = "12px"; cardEl.style.left = "50%";
        cardEl.style.transform = `translateX(-50%) rotate(${180 + randomTilt}deg)`;
        originX = '0px'; originY = '-240px';
    } else if (relativePos === 3) { 
        cardEl.style.left = "12px"; cardEl.style.top = "50%";
        cardEl.style.transform = `translateY(-50%) rotate(${-90 + randomTilt}deg)`;
        originX = '-240px'; originY = '0px';
    }

    const manilhaInfo = checkIsManilha(card, currentManilha, currentVariant);
    cardEl.innerHTML = createCardHTML(card.value, card.suit, card.hidden, true, manilhaInfo.isManilha, manilhaInfo.label);
    tableCards.appendChild(cardEl);

    if (animate) {
        const finalTransform = cardEl.style.transform;
        cardEl.animate([
            { transform: `translate(${originX}, ${originY}) scale(0.6)`, opacity: 0 },
            { transform: finalTransform, opacity: 1 }
        ], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
    }
}

// ─── Atualização do Estado do Jogo ───────────────────────────────────────────
socket.on('updateState', (state) => {
    clearTrickCleanTimer();
    isPlayingCard = false;

    document.getElementById('waiting-area').classList.add('hidden');
    document.getElementById('table-area').classList.remove('hidden');

    const myIndex   = globalPlayers.findIndex(p => p.id === socket.id);
    const is1v1     = globalPlayers.length === 2;
    currentVariant  = state.variant || currentVariant;
    currentManilha  = state.manilhaValue || null;
    const isMineiro = currentVariant === 'mineiro';

    const setPlayerInfo = (id, idx) => {
        const el = document.getElementById(id);
        el.textContent = globalPlayers[idx].name;
        el.dataset.id  = globalPlayers[idx].id;
        el.className   = `text-white font-bold px-4 py-1 md:px-6 md:py-2 rounded-full text-xs md:text-base player-tag relative ${(idx % 2 === 0) ? 'team-a-border' : 'team-b-border'}`;
    };

    // ── Layout de Jogadores ──────────────────────────────────────────────────
    if (is1v1) {
        setPlayerInfo('my-name', myIndex);
        setPlayerInfo('partner-name', (myIndex + 1) % 2);
        document.getElementById('left-name').parentElement.style.display  = 'none';
        document.getElementById('right-name').parentElement.style.display = 'none';
        document.getElementById('partner-cards').innerHTML = Array(state.hand.length).fill(createFaceDownCardHTML(false)).join('');
        document.getElementById('left-cards').innerHTML  = '';
        document.getElementById('right-cards').innerHTML = '';
    } else {
        setPlayerInfo('my-name',      myIndex);
        setPlayerInfo('right-name',   (myIndex + 1) % 4);
        setPlayerInfo('partner-name', (myIndex + 2) % 4);
        setPlayerInfo('left-name',    (myIndex + 3) % 4);
        document.getElementById('left-name').parentElement.style.display  = '';
        document.getElementById('right-name').parentElement.style.display = '';
        document.getElementById('partner-cards').innerHTML = Array(state.hand.length).fill(createFaceDownCardHTML(false)).join('');
        document.getElementById('left-cards').innerHTML   = Array(state.hand.length).fill(createFaceDownCardHTML(true)).join('');
        document.getElementById('right-cards').innerHTML  = Array(state.hand.length).fill(createFaceDownCardHTML(true)).join('');
    }

    // ── Placar ───────────────────────────────────────────────────────────────
    document.getElementById('sidebar-score-teamA').textContent = state.score[0];
    document.getElementById('mobile-score-teamA').textContent  = state.score[0];
    document.getElementById('sidebar-score-teamB').textContent = state.score[1];
    document.getElementById('mobile-score-teamB').textContent  = state.score[1];
    document.getElementById('sidebar-hand-value').textContent  = state.handValue;
    document.getElementById('mobile-hand-value').textContent   = state.handValue;

    // ── Indicadores de Vaza ──────────────────────────────────────────────────
    ['sidebar-round-indicators', 'mobile-round-indicators'].forEach(containerId => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const indicators = container.children;
        for (let i = 0; i < 3; i++) {
            indicators[i].className = 'w-3 h-3 md:w-4 md:h-4 rounded-full border border-zinc-400 transition-all duration-300';
            if (state.trickResults[i] !== undefined) {
                if (state.trickResults[i] === -1) indicators[i].classList.add('bg-yellow-500', 'shadow-[0_0_8px_#eab308]');
                else if (state.trickResults[i] === 0) indicators[i].classList.add('bg-blue-500', 'shadow-[0_0_8px_#3b82f6]');
                else indicators[i].classList.add('bg-red-500', 'shadow-[0_0_8px_#ef4444]');
            } else {
                indicators[i].classList.add('bg-zinc-700');
            }
        }
    });

    // ── Reconciliação das Cartas na Mesa ─────────────────────────────────────
    const tableCardsContainer = document.getElementById('played-cards');
    if (!state.tableCards || state.tableCards.length === 0) {
        tableCardsContainer.innerHTML = '';
    } else {
        tableCardsContainer.innerHTML = '';
        state.tableCards.forEach(tc => {
            renderPlayedCard(tc.playerId, tc.card, false);
        });
    }

    // ── Cartas do Jogador (em leque com destaque de Manilha) ─────────────────
    const myCardsDiv = document.getElementById('my-cards');
    myCardsDiv.innerHTML = '';
    const totalCards = state.hand.length;
    const fanAngles = totalCards === 1 ? [0] : (totalCards === 2 ? [-4, 4] : [-6, 0, 6]);

    state.hand.forEach((card, i) => {
        const wrap = document.createElement('div');
        const angle = fanAngles[i] || 0;
        wrap.className = 'cursor-pointer hand-card-fan deal-animation origin-bottom';
        wrap.style.setProperty('--deal-origin-x', '0px');
        wrap.style.setProperty('--deal-origin-y', '-260px');
        wrap.style.animationDelay = `${i * 0.12}s`;
        wrap.style.transform = `rotate(${angle}deg)`;

        const manilhaInfo = checkIsManilha(card, currentManilha, currentVariant);
        wrap.innerHTML = createCardHTML(card.value, card.suit, false, false, manilhaInfo.isManilha, manilhaInfo.label);
        wrap.dataset.value = card.value;
        wrap.dataset.suit  = card.suit;

        wrap.addEventListener('click', () => {
            if (!isMyTurn || isPlayingCard) return;
            if (currentTrucoAnsweringTeam !== -1) {
                showNotification("Aguarde a resposta do Truco para jogar!", "border-red-500 text-red-400");
                return;
            }
            isPlayingCard = true;
            sfx.playCard();

            // Marca a carta como enviando (SEM REMOVER DO DOM AINDA)
            wrap.classList.add('opacity-40', 'pointer-events-none', 'scale-95');

            // Safety timeout: se por qualquer razão a jogada não for respondida em 2.5s, restaura o estado
            setTimeout(() => {
                if (isPlayingCard) {
                    isPlayingCard = false;
                    wrap.classList.remove('opacity-40', 'pointer-events-none', 'scale-95');
                }
            }, 2500);

            socket.emit('playCard', { roomCode: currentRoomCode, card, hidden: isHidingNextCard });
            isHidingNextCard = false;
            document.getElementById('btn-hide-card').classList.remove('bg-yellow-600');
        });
        myCardsDiv.appendChild(wrap);
    });

    // ── Vira / Galheiros Mineiro ─────────────────────────────────────────────
    const viraContainer = document.getElementById('vira-container');
    if (isMineiro) {
        viraContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full p-1 text-center bg-zinc-900 rounded-lg">
                <div class="text-amber-400 font-black text-[9px] mb-0.5 tracking-widest">MINEIRO</div>
                <div class="text-zinc-200 text-[8px] leading-tight font-bold">4♣ &gt; 7♥</div>
                <div class="text-zinc-200 text-[8px] leading-tight font-bold">A♠ &gt; 7♦</div>
            </div>`;
        document.getElementById('vira-flipper').classList.add('flip-card-reveal');
    } else {
        viraContainer.innerHTML = createCardHTML(state.vira.value, state.vira.suit, false, true, false);
        if (state.trickResults.length === 0 && (!state.tableCards || state.tableCards.length === 0)) {
            document.getElementById('vira-flipper').classList.remove('flip-card-reveal');
            setTimeout(() => { document.getElementById('vira-flipper').classList.add('flip-card-reveal'); }, 400);
        } else {
            document.getElementById('vira-flipper').classList.add('flip-card-reveal');
        }
    }

    updateTurnUI(state.turnId);

    // Botão Ocultar Carta
    const btnHideCard = document.getElementById('btn-hide-card');
    if (state.trickResults.length === 0) {
        btnHideCard.classList.add('hidden');
        isHidingNextCard = false;
        btnHideCard.classList.remove('bg-yellow-600');
    } else {
        btnHideCard.classList.remove('hidden');
    }

    // Botão Truco
    const btnTruco = document.getElementById('btn-truco');
    if (state.trucoLevel >= 4 || state.lastTrucoTeam === myTeam || state.isMaoDe11 || state.score[0] === 11 || state.score[1] === 11) {
        btnTruco.classList.add('hidden');
    } else {
        btnTruco.classList.remove('hidden');
    }

    // Modal Mão de 11
    const modal11 = document.getElementById('mao-11-modal');
    if (state.isMaoDe11 && !state.maoDe11Answered) {
        if (state.maoDe11Team === myTeam && state.partnerHand) {
            document.getElementById('mao-11-my-cards').innerHTML = state.hand.map(c => {
                const m = checkIsManilha(c, currentManilha, currentVariant);
                return createCardHTML(c.value, c.suit, false, false, m.isManilha, m.label);
            }).join('');
            document.getElementById('mao-11-partner-cards').innerHTML = state.partnerHand.map(c => {
                const m = checkIsManilha(c, currentManilha, currentVariant);
                return createCardHTML(c.value, c.suit, false, false, m.isManilha, m.label);
            }).join('');
            document.getElementById('mao-11-vira').innerHTML = createCardHTML(state.vira.value, state.vira.suit);
            
            document.getElementById('mao-11-response-buttons').innerHTML = `
                <button onclick="respondMao11('accept')" class="bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 font-black px-6 py-2.5 rounded-xl text-lg shadow-lg">Aceitar (Vale 3)</button>
                <button onclick="respondMao11('run')" class="bg-zinc-700 hover:bg-zinc-600 font-bold px-6 py-2.5 rounded-xl text-lg shadow-lg border border-zinc-600">Correr</button>
            `;
            document.getElementById('mao-11-waiting-msg').classList.add('hidden');
            document.getElementById('mao-11-response-buttons').classList.remove('hidden');
        } else {
            document.getElementById('mao-11-my-cards').innerHTML = '';
            document.getElementById('mao-11-partner-cards').innerHTML = '';
            document.getElementById('mao-11-vira').innerHTML = '';
            document.getElementById('mao-11-response-buttons').classList.add('hidden');
            document.getElementById('mao-11-waiting-msg').classList.remove('hidden');
        }
        modal11.classList.remove('hidden');
    } else {
        modal11.classList.add('hidden');
    }
});

socket.on('maoDe11Accepted', () => {
    document.getElementById('mao-11-modal').classList.add('hidden');
    showNotification("Mão de 11 Aceita! Vale 3", "border-red-500 text-red-500");
});

window.respondMao11 = function(resp) {
    socket.emit('respondMaoDe11', { roomCode: currentRoomCode, response: resp });
};

// ─── Rejeição de Jogada de Carta ─────────────────────────────────────────────
socket.on('playCardRejected', (data) => {
    isPlayingCard = false;
    showNotification(data.reason || "Jogada não permitida no momento!", "border-red-500 text-red-400");
    const myCardsDiv = document.getElementById('my-cards');
    if (myCardsDiv) {
        Array.from(myCardsDiv.children).forEach(el => {
            el.classList.remove('opacity-40', 'pointer-events-none', 'scale-95');
        });
    }
});

// ─── Carta Jogada na Mesa ─────────────────────────────────────────────────────
socket.on('cardPlayed', (data) => {
    clearTrickCleanTimer();
    isPlayingCard = false;

    if (data.playerId === socket.id) {
        // Encontra e remove a carta que acabou de ser jogada da mão do jogador
        const myCardsDiv = document.getElementById('my-cards');
        const found = Array.from(myCardsDiv.children).find(el => 
            el.dataset.value === data.card.value && el.dataset.suit === data.card.suit
        );
        if (found) {
            found.remove();
        } else if (myCardsDiv.firstElementChild) {
            myCardsDiv.firstElementChild.remove();
        }
    } else {
        ['left-cards', 'right-cards', 'partner-cards'].forEach(id => {
            const el = document.getElementById(id);
            if (document.getElementById(id.replace('-cards', '-name')).dataset.id === data.playerId && el.firstElementChild) {
                el.firstElementChild.remove();
            }
        });
        sfx.playCard();
    }

    renderPlayedCard(data.playerId, data.card, true);
    updateTurnUI(data.nextTurnId);
});

// ─── Fim da Vaza (Recolhimento Suave de Cartas) ────────────────────────────────
socket.on('trickEnded', (data) => {
    clearTrickCleanTimer();

    // Desativa turno imediatamente durante a transição
    isMyTurn = false;
    document.getElementById('my-turn-indicator').classList.add('hidden');
    document.getElementById('action-buttons').style.display = 'none';
    document.querySelectorAll('.player-tag').forEach(el => el.classList.remove('player-turn-active'));

    // Aplica animação de recolhimento nas cartas jogadas
    const tableCards = document.getElementById('played-cards');
    Array.from(tableCards.children).forEach((child) => {
        child.classList.add('collect-cards-animation');
    });

    // Limpa a mesa no tempo exato da transição (450ms)
    trickCleanTimer = setTimeout(() => {
        tableCards.innerHTML = '';
        trickCleanTimer = null;
    }, 450);
});

// ─── Fim da Mão ───────────────────────────────────────────────────────────────
socket.on('handEnded', (data) => {
    clearTrickCleanTimer();
    isMyTurn = false;
    document.getElementById('my-turn-indicator').classList.add('hidden');
    document.getElementById('action-buttons').style.display = 'none';
    document.querySelectorAll('.player-tag').forEach(el => el.classList.remove('player-turn-active'));
    document.getElementById('played-cards').innerHTML = '';

    const isWinner = (data.winnerTeam === myTeam);
    if (isWinner) sfx.playWin();

    let msg = data.message || `Equipe ${data.winnerTeam === 0 ? 'A' : (data.winnerTeam === 1 ? 'B' : 'Ninguém')} venceu a mão!`;
    const colorClass = (data.winnerTeam === -1) ? 'border-yellow-500 text-yellow-400' :
                       (isWinner ? 'border-green-500 text-green-400' : 'border-red-500 text-red-400');
    showNotification(msg, colorClass);
});

// ─── Fim de Jogo (Game Over / Campeão) ────────────────────────────────────────
socket.on('gameOver', (data) => {
    clearTrickCleanTimer();
    document.getElementById('played-cards').innerHTML = '';

    const modal = document.getElementById('game-over-modal');
    const isWinner = (data.winnerTeam === myTeam);
    sfx.playWin();

    const titleEl = document.getElementById('game-over-title');
    const descEl  = document.getElementById('game-over-desc');
    const is1v1   = globalPlayers.length === 2;

    const teamAName = is1v1 ? (globalPlayers[0] ? globalPlayers[0].name : 'Jogador A') : 'Dupla A';
    const teamBName = is1v1 ? (globalPlayers[1] ? globalPlayers[1].name : 'Jogador B') : 'Dupla B';

    document.getElementById('go-team-a-name').textContent = teamAName;
    document.getElementById('go-team-b-name').textContent = teamBName;
    document.getElementById('go-team-a-score').textContent = (data.score && data.score[0] !== undefined) ? data.score[0] : (data.winnerTeam === 0 ? 12 : '');
    document.getElementById('go-team-b-score').textContent = (data.score && data.score[1] !== undefined) ? data.score[1] : (data.winnerTeam === 1 ? 12 : '');

    if (isWinner) {
        titleEl.textContent = '🏆 VOCÊS VENCERAM!';
        descEl.textContent  = 'Parabéns! Sua equipe conquistou os 12 pontos e venceu a partida!';
    } else {
        titleEl.textContent = 'FIM DE JOGO!';
        descEl.textContent  = `${data.winnerTeam === 0 ? teamAName : teamBName} venceu a partida!`;
    }

    modal.classList.remove('hidden');
});

// ─── Reiniciar Partida (Rematch) ──────────────────────────────────────────────
document.getElementById('btn-play-again').addEventListener('click', () => {
    socket.emit('playAgain', { roomCode: currentRoomCode });
    document.getElementById('game-over-modal').classList.add('hidden');
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
    location.reload();
});

socket.on('gameRestarted', (data) => {
    clearTrickCleanTimer();
    document.getElementById('game-over-modal').classList.add('hidden');
    document.getElementById('played-cards').innerHTML = '';
    showNotification("Nova partida iniciada! Embaralhando...", "border-green-500 text-green-400");
    sfx.playDeal();
});

document.getElementById('btn-hide-card').addEventListener('click', (e) => {
    isHidingNextCard = !isHidingNextCard;
    e.currentTarget.classList.toggle('bg-yellow-600', isHidingNextCard);
});

document.getElementById('btn-truco').addEventListener('click', () => {
    if (currentTrucoAnsweringTeam !== -1) {
        showNotification("Aguarde a resposta do Truco em andamento!", "border-red-500 text-red-400");
        return;
    }
    if (!isMyTurn) {
        showNotification("Você só pode pedir Truco na sua vez!", "border-red-500 text-red-400");
        return;
    }
    socket.emit('callTruco', { roomCode: currentRoomCode });
});

// ─── Anúncio Splash de Truco ──────────────────────────────────────────────────
function triggerTrucoSplash(val) {
    const splash = document.getElementById('truco-splash-banner');
    const textEl = document.getElementById('truco-splash-text');
    const mainContainer = document.getElementById('game-main-container');

    let label = 'TRUCO!';
    if (val === 6) label = 'SEIS!';
    else if (val === 9) label = 'NOVE!';
    else if (val === 12) label = 'DOZE!';

    textEl.textContent = label;
    splash.classList.remove('hidden');
    textEl.classList.remove('animate-truco-pop');
    void textEl.offsetWidth; // reativa animação
    textEl.classList.add('animate-truco-pop');

    mainContainer.classList.add('shake-animation');
    setTimeout(() => mainContainer.classList.remove('shake-animation'), 450);
    setTimeout(() => splash.classList.add('hidden'), 1100);

    sfx.playTruco();
}

let currentTrucoAnsweringTeam = -1;
let iVotedToRun = false;

socket.on('trucoRequested', (data) => {
    currentTrucoAnsweringTeam = data.answeringTeam;
    iVotedToRun = false;
    isPlayingCard = false;
    triggerTrucoSplash(data.newValue);

    // Bloqueia cartas da mão durante a decisão do truco
    const myCardsDiv = document.getElementById('my-cards');
    if (myCardsDiv) {
        myCardsDiv.classList.add('pointer-events-none', 'opacity-60');
    }
    const actionButtons = document.getElementById('action-buttons');
    if (actionButtons) {
        actionButtons.style.display = 'none';
    }
    const turnIndicator = document.getElementById('my-turn-indicator');
    if (turnIndicator) {
        turnIndicator.classList.add('hidden');
    }

    const modal = document.getElementById('truco-modal');
    document.getElementById('truco-new-value').textContent = data.newValue;
    const btnContainer = document.getElementById('truco-response-buttons');
    btnContainer.innerHTML = '';

    if (myTeam === data.answeringTeam) {
        let nextValue = '';
        if (data.newValue === 3) nextValue = '6';
        else if (data.newValue === 6) nextValue = '9';
        else if (data.newValue === 9) nextValue = '12';

        let raiseBtn = '';
        if (nextValue) {
            raiseBtn = `<button onclick="respondTruco('raise')" class="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 font-black py-2.5 rounded-xl border border-red-500 shadow-lg text-sm md:text-base">Pedir ${nextValue}</button>`;
        }

        btnContainer.innerHTML = `
            <div class="grid grid-cols-2 gap-2 w-full">
                <button onclick="respondTruco('accept')" class="bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 font-black py-2.5 rounded-xl text-sm md:text-base shadow-lg">Aceitar</button>
                <button onclick="respondTruco('run')" class="bg-zinc-700 hover:bg-zinc-600 font-bold py-2.5 rounded-xl text-sm md:text-base shadow-lg border border-zinc-600">Correr</button>
            </div>
            ${raiseBtn}
        `;
    } else {
        btnContainer.innerHTML = `<p class="text-zinc-300 text-sm font-medium animate-pulse">Aguardando resposta adversária...</p>`;
    }
    modal.classList.remove('hidden');
});

socket.on('trucoRunVotePending', (data) => {
    const btnContainer = document.getElementById('truco-response-buttons');

    if (data.votedPlayerId === socket.id) {
        iVotedToRun = true;
        btnContainer.innerHTML = `
            <div class="text-center py-2">
                <p class="text-amber-400 font-bold mb-1 text-sm">⚠️ Você votou para correr</p>
                <p class="text-zinc-300 text-xs animate-pulse">Aguardando seu parceiro decidir...</p>
            </div>
        `;
    } else if (myTeam === data.answeringTeam) {
        let nextValue = '';
        const currentVal = parseInt(document.getElementById('truco-new-value').textContent);
        if (currentVal === 3) nextValue = '6';
        else if (currentVal === 6) nextValue = '9';
        else if (currentVal === 9) nextValue = '12';

        let raiseBtn = '';
        if (nextValue) {
            raiseBtn = `<button onclick="respondTruco('raise')" class="w-full bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-500 hover:to-rose-600 font-black py-2 rounded-xl border border-red-500 shadow text-sm">Pedir ${nextValue}</button>`;
        }

        btnContainer.innerHTML = `
            <div class="w-full text-center mb-2 py-1.5 px-3 bg-amber-950/60 rounded-xl border border-amber-500/50">
                <p class="text-amber-300 font-bold text-xs">⚠️ ${data.votedPlayerName} quer correr! Você decide:</p>
            </div>
            <div class="grid grid-cols-2 gap-2 w-full mb-1">
                <button onclick="respondTruco('accept')" class="bg-green-600 hover:bg-green-500 font-bold py-2 rounded-xl text-sm shadow">Aceitar</button>
                <button onclick="respondTruco('run')" class="bg-zinc-700 hover:bg-zinc-600 font-bold py-2 rounded-xl text-sm shadow">Correr Também</button>
            </div>
            ${raiseBtn}
        `;
    } else {
        btnContainer.innerHTML = `<p class="text-zinc-300 text-sm animate-pulse">Adversários deliberando... (${data.votesCount}/${data.votesNeeded} votos)</p>`;
    }
});

socket.on('trucoAccepted', (data) => {
    iVotedToRun = false;
    currentTrucoAnsweringTeam = -1;
    isPlayingCard = false;
    document.getElementById('truco-modal').classList.add('hidden');
    
    // Restaura interatividade da mão do jogador
    const myCardsDiv = document.getElementById('my-cards');
    if (myCardsDiv) {
        myCardsDiv.classList.remove('pointer-events-none', 'opacity-60');
        Array.from(myCardsDiv.children).forEach(el => {
            el.classList.remove('opacity-40', 'pointer-events-none', 'scale-95');
        });
    }

    document.getElementById('sidebar-hand-value').textContent = data.newValue;
    document.getElementById('mobile-hand-value').textContent = data.newValue;
    
    updateTurnUI(data.nextTurnId);
    showNotification(`Truco Aceito! Vale ${data.newValue} pontos.`, 'border-red-500 text-red-400');
});

socket.on('trucoCanceled', () => {
    iVotedToRun = false;
    currentTrucoAnsweringTeam = -1;
    isPlayingCard = false;
    document.getElementById('truco-modal').classList.add('hidden');

    const myCardsDiv = document.getElementById('my-cards');
    if (myCardsDiv) {
        myCardsDiv.classList.remove('pointer-events-none', 'opacity-60');
        Array.from(myCardsDiv.children).forEach(el => {
            el.classList.remove('opacity-40', 'pointer-events-none', 'scale-95');
        });
    }
});

socket.on('errorMsg', (msg) => {
    isPlayingCard = false;
    showNotification(msg, 'border-red-500 text-red-400');
    const myCardsDiv = document.getElementById('my-cards');
    if (myCardsDiv) {
        myCardsDiv.classList.remove('pointer-events-none', 'opacity-60');
        Array.from(myCardsDiv.children).forEach(el => {
            el.classList.remove('opacity-40', 'pointer-events-none', 'scale-95');
        });
    }
});

window.respondTruco = function(resp) {
    socket.emit('respondTruco', { roomCode: currentRoomCode, response: resp });
};

// ─── Emojis ───────────────────────────────────────────────────────────────────
const btnEmoji  = document.getElementById('btn-toggle-emoji');
const menuEmoji = document.getElementById('emoji-menu');
btnEmoji.addEventListener('click', () => {
    menuEmoji.classList.toggle('hidden');
});

window.sendEmoji = function(emoji) {
    socket.emit('sendEmoji', { roomCode: currentRoomCode, emoji });
    menuEmoji.classList.add('hidden');
};

socket.on('showEmoji', (data) => {
    let targetId = '';
    if (data.playerId === socket.id) targetId = 'my-name';
    else if (document.getElementById('right-name').dataset.id === data.playerId) targetId = 'right-name';
    else if (document.getElementById('left-name').dataset.id === data.playerId) targetId = 'left-name';
    else if (document.getElementById('partner-name').dataset.id === data.playerId) targetId = 'partner-name';

    if (targetId) {
        const parent = document.getElementById(targetId);
        const emojiEl = document.createElement('div');
        emojiEl.className = 'emoji-float';
        emojiEl.textContent = data.emoji;
        parent.appendChild(emojiEl);
        setTimeout(() => emojiEl.remove(), 1500);
    }
});

// ─── Reconexão ────────────────────────────────────────────────────────────────
socket.on('playerDisconnected', (data) => {
    document.getElementById('reconnect-banner').textContent = `Aguardando ${data.playerName} reconectar... (30s)`;
    document.getElementById('reconnect-banner').classList.remove('hidden');
});

socket.on('playerReconnected', (data) => {
    document.getElementById('reconnect-banner').classList.add('hidden');
    showNotification(`${data.playerName} reconectou!`, 'border-blue-500 text-blue-400');
});

// ─── Chat em Tempo Real ───────────────────────────────────────────────────────
const btnToggleChat    = document.getElementById('btn-toggle-chat');
const btnCloseChat     = document.getElementById('btn-close-chat');
const chatWindow       = document.getElementById('chat-window');
const chatInput        = document.getElementById('chat-input');
const btnSendChat      = document.getElementById('btn-send-chat');
const chatMessages     = document.getElementById('chat-messages');
const chatUnreadBadge  = document.getElementById('chat-unread-badge');
const btnToggleTaunts  = document.getElementById('btn-toggle-taunts');
const chatTauntsPanel  = document.getElementById('chat-taunts-panel');

let unreadChatCount = 0;

function isChatOpen() {
    return chatWindow && !chatWindow.classList.contains('hidden');
}

function openChat() {
    if (!chatWindow) return;
    chatWindow.classList.remove('hidden');
    unreadChatCount = 0;
    if (chatUnreadBadge) {
        chatUnreadBadge.classList.add('hidden');
        chatUnreadBadge.textContent = '0';
    }
    if (chatInput) chatInput.focus();
    if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
}

function closeChat() {
    if (chatWindow) chatWindow.classList.add('hidden');
}

if (btnToggleChat) {
    btnToggleChat.addEventListener('click', () => {
        if (isChatOpen()) closeChat();
        else openChat();
    });
}

if (btnCloseChat) btnCloseChat.addEventListener('click', closeChat);

if (btnToggleTaunts && chatTauntsPanel) {
    btnToggleTaunts.addEventListener('click', () => {
        chatTauntsPanel.classList.toggle('hidden');
    });
}

document.querySelectorAll('.chat-taunt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const msg = e.currentTarget.dataset.msg;
        sendChatMessage(msg);
    });
});

function sendChatMessage(text) {
    const msg = (text !== undefined ? text : (chatInput ? chatInput.value : '')).trim();
    if (!msg || !currentRoomCode) return;

    socket.emit('sendChatMessage', { roomCode: currentRoomCode, message: msg });
    if (chatInput) chatInput.value = '';
}

if (btnSendChat) {
    btnSendChat.addEventListener('click', () => sendChatMessage());
}

if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendChatMessage();
        }
    });
}

function showPlayerSpeechBubble(playerId, message) {
    let targetId = '';
    if (playerId === socket.id) targetId = 'my-name';
    else if (document.getElementById('right-name').dataset.id === playerId) targetId = 'right-name';
    else if (document.getElementById('left-name').dataset.id === playerId) targetId = 'left-name';
    else if (document.getElementById('partner-name').dataset.id === playerId) targetId = 'partner-name';

    if (targetId) {
        const parent = document.getElementById(targetId);
        if (!parent) return;

        // Remove balão anterior do mesmo jogador se existir
        const oldBubble = parent.querySelector('.chat-speech-bubble');
        if (oldBubble) oldBubble.remove();

        const bubble = document.createElement('div');
        bubble.className = 'chat-speech-bubble';
        bubble.textContent = message;
        parent.appendChild(bubble);

        setTimeout(() => {
            bubble.style.transition = 'opacity 0.35s ease, transform 0.35s ease';
            bubble.style.opacity = '0';
            bubble.style.transform = 'translateX(-50%) translateY(-6px)';
            setTimeout(() => bubble.remove(), 350);
        }, 3200);
    }
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

socket.on('chatMessageReceived', (data) => {
    if (!chatMessages) return;

    const isMe = (data.playerId === socket.id);
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`;

    const teamColor = data.playerTeam === 0 ? 'text-blue-400' : 'text-red-400';
    const senderDisplay = isMe 
        ? '<span class="text-emerald-400 font-bold">Você</span>' 
        : `<span class="${teamColor} font-bold">${escapeHTML(data.playerName)}</span>`;

    const bubbleBg = isMe 
        ? 'bg-emerald-950/70 border-emerald-600/40 text-emerald-100' 
        : 'bg-zinc-800/90 border-zinc-700/70 text-zinc-200';

    msgWrapper.innerHTML = `
        <div class="flex items-center gap-1.5 mb-0.5 text-[10px]">
            ${senderDisplay}
            <span class="text-zinc-500">${data.time || ''}</span>
        </div>
        <div class="px-2.5 py-1.5 rounded-xl border text-xs shadow-md break-words max-w-[90%] ${bubbleBg}">
            ${escapeHTML(data.message)}
        </div>
    `;

    chatMessages.appendChild(msgWrapper);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Som de mensagem recebida
    sfx.playChat();

    // Balão flutuante na mesa
    showPlayerSpeechBubble(data.playerId, data.message);

    // Se chat estiver fechado e não for mensagem própria, incrementa badge
    if (!isChatOpen() && !isMe) {
        unreadChatCount++;
        if (chatUnreadBadge) {
            chatUnreadBadge.textContent = unreadChatCount > 9 ? '9+' : unreadChatCount;
            chatUnreadBadge.classList.remove('hidden');
        }
    }
});