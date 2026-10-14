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

// ─── Customização de Avatar e Pancada ──────────────────────────────────────────
let selectedAvatar = localStorage.getItem('truco_avatar') || '🤠';
let selectedTitle  = localStorage.getItem('truco_title') || 'Truqueiro Raiz';
let isSlamEnabled  = localStorage.getItem('truco_slam_enabled') !== 'false';
let isSlamNextCard = false;

// ─── Efeitos Sonoros com Web Audio API Imersivo (Truco Raiz) ─────────────────
class SoundFX {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.noiseBuffers = {};
    }
    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) this.ctx = new AudioCtx();
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }
    }
    getNoiseBuffer(duration = 0.1) {
        if (!this.ctx) return null;
        const key = duration.toFixed(2);
        if (this.noiseBuffers[key]) return this.noiseBuffers[key];
        const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * 0.7;
        }
        this.noiseBuffers[key] = buffer;
        return buffer;
    }
    playClick() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(950, now);
            osc.frequency.exponentialRampToValueAtTime(180, now + 0.025);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.025);
        } catch (e) {}
    }
    playCard() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            // 1. Deslize físico de feltro (ruído filtrado)
            const nBuffer = this.getNoiseBuffer(0.09);
            if (nBuffer) {
                const noise = this.ctx.createBufferSource();
                noise.buffer = nBuffer;
                const filter = this.ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(1400, now);
                filter.Q.setValueAtTime(1.8, now);
                const nGain = this.ctx.createGain();
                nGain.gain.setValueAtTime(0.01, now);
                nGain.gain.linearRampToValueAtTime(0.22, now + 0.02);
                nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
                noise.connect(filter);
                filter.connect(nGain);
                nGain.connect(this.ctx.destination);
                noise.start(now);
            }
            // 2. Toque suave de papel cartão no feltro
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now + 0.01);
            osc.frequency.exponentialRampToValueAtTime(45, now + 0.08);
            gain.gain.setValueAtTime(0.18, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + 0.01);
            osc.stop(now + 0.08);
        } catch (e) {}
    }
    playDeal() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        for (let i = 0; i < 3; i++) {
            setTimeout(() => this.playCard(), i * 65);
        }
    }
    playSignal() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            [880, 1174.66].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.09);
                gain.gain.setValueAtTime(0.13, now + idx * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.22);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.09);
                osc.stop(now + idx * 0.09 + 0.22);
            });
        } catch (e) {}
    }
    playTruco() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            // Impacto grave marcante
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.38);
            gain.gain.setValueAtTime(0.75, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(400, now);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.38);

            // Tensão de desafio de Truco
            const horn = this.ctx.createOscillator();
            const hGain = this.ctx.createGain();
            horn.type = 'triangle';
            horn.frequency.setValueAtTime(220, now + 0.03);
            horn.frequency.linearRampToValueAtTime(330, now + 0.12);
            hGain.gain.setValueAtTime(0.01, now + 0.03);
            hGain.gain.linearRampToValueAtTime(0.38, now + 0.1);
            hGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
            horn.connect(hGain);
            hGain.connect(this.ctx.destination);
            horn.start(now + 0.03);
            horn.stop(now + 0.42);
        } catch (e) {}
    }
    playSlam() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            // Pancada sub-bass na madeira
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.exponentialRampToValueAtTime(30, now + 0.3);
            gain.gain.setValueAtTime(0.95, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.32);

            // Estalo de impacto de madeira
            const nBuffer = this.getNoiseBuffer(0.12);
            if (nBuffer) {
                const noise = this.ctx.createBufferSource();
                noise.buffer = nBuffer;
                const nFilter = this.ctx.createBiquadFilter();
                nFilter.type = 'lowpass';
                nFilter.frequency.setValueAtTime(750, now);
                const nGain = this.ctx.createGain();
                nGain.gain.setValueAtTime(0.65, now);
                nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
                noise.connect(nFilter);
                nFilter.connect(nGain);
                nGain.connect(this.ctx.destination);
                noise.start(now);
            }

            const snap = this.ctx.createOscillator();
            const snapGain = this.ctx.createGain();
            snap.type = 'triangle';
            snap.frequency.setValueAtTime(340, now);
            snap.frequency.exponentialRampToValueAtTime(60, now + 0.08);
            snapGain.gain.setValueAtTime(0.45, now);
            snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            snap.connect(snapGain);
            snapGain.connect(this.ctx.destination);
            snap.start(now);
            snap.stop(now + 0.08);
        } catch (e) {}
    }
    playWin() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + idx * 0.09);
                gain.gain.setValueAtTime(0.25, now + idx * 0.09);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.28);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + idx * 0.09);
                osc.stop(now + idx * 0.09 + 0.28);
            });
        } catch (e) {}
    }
    playChat() {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(480, now);
            osc.frequency.exponentialRampToValueAtTime(920, now + 0.07);
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.07);
        } catch (e) {}
    }
}
const sfx = new SoundFX();

// ─── Sinais Secretos & Histórico da Rodada ──────────────────────────────────────
const SECRET_SIGNALS = {
    piscar:      { emoji: '😉', name: 'Piscou o olho',        meaning: 'Zap / Manilha Maior',          color: 'text-amber-400' },
    biquinho:    { emoji: '😗', name: 'Fez biquinho',          meaning: '7 de Copas / Segunda Manilha', color: 'text-red-400' },
    sobrancelha: { emoji: '🤨', name: 'Ergueu a sobrancelha',  meaning: 'Espadilha / Terceira Manilha', color: 'text-sky-400' },
    nariz:       { emoji: '👃', name: 'Coçou o nariz',         meaning: '7 de Ouros / Pica-fumo',       color: 'text-yellow-400' },
    bocejo:      { emoji: '🥱', name: 'Bocejou',               meaning: 'Tô liso / Sem carta boa',      color: 'text-zinc-400' },
    peito:       { emoji: '✊', name: 'Bateu no peito',        meaning: 'Pede Truco que eu garanto!',   color: 'text-emerald-400' }
};

let currentHandLog = {
    handNumber: 1,
    vira: null,
    handValue: 1,
    tricks: [
        { plays: [], winnerTeam: null, isTie: false, decisivePlayer: null },
        { plays: [], winnerTeam: null, isTie: false, decisivePlayer: null },
        { plays: [], winnerTeam: null, isTie: false, decisivePlayer: null }
    ],
    trucoEvents: [],
    handWinner: null,
    endMessage: null
};

let signalToastTimer = null;

function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ─── Efeito Visual & Sonoro "Tapa na Mesa" (Pancada) ─────────────────────────
function triggerTableSlam(playerId) {
    if (!isSlamEnabled) return;
    sfx.playSlam();

    if (window.Truco3D) {
        Truco3D.onTableSlam(playerId || socket.id);
    }

    const tableContainer = document.getElementById('game-main-container');
    if (tableContainer) {
        tableContainer.classList.remove('table-slam-shake');
        void tableContainer.offsetWidth;
        tableContainer.classList.add('table-slam-shake');
        setTimeout(() => tableContainer.classList.remove('table-slam-shake'), 380);
    }

    const playedCardsArea = document.getElementById('played-cards');
    if (playedCardsArea) {
        const shockwave = document.createElement('div');
        shockwave.className = 'slam-shockwave';
        playedCardsArea.appendChild(shockwave);
        setTimeout(() => shockwave.remove(), 480);
    }
}

// ─── Limpeza Segura de Timers ─────────────────────────────────────────────────
function clearTrickCleanTimer() {
    if (trickCleanTimer) {
        clearTimeout(trickCleanTimer);
        trickCleanTimer = null;
    }
}

// ─── Escolha de Avatar & Título no Lobby ──────────────────────────────────────
const avatarDisplay = document.getElementById('selected-avatar-display');
const titleSelect   = document.getElementById('playerTitle');
if (avatarDisplay) avatarDisplay.textContent = selectedAvatar;
if (titleSelect)   titleSelect.value = selectedTitle;

document.querySelectorAll('.avatar-btn').forEach(btn => {
    if (btn.dataset.avatar === selectedAvatar) {
        btn.classList.add('active-avatar');
    } else {
        btn.classList.remove('active-avatar');
    }
    btn.addEventListener('click', () => {
        selectedAvatar = btn.dataset.avatar;
        localStorage.setItem('truco_avatar', selectedAvatar);
        document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('active-avatar'));
        btn.classList.add('active-avatar');
        if (avatarDisplay) avatarDisplay.textContent = selectedAvatar;
    });
});

if (titleSelect) {
    titleSelect.addEventListener('change', () => {
        selectedTitle = titleSelect.value;
        localStorage.setItem('truco_title', selectedTitle);
    });
}

// ─── Nome do Jogador (Persistência) ───────────────────────────────────────────
const playerNameInput = document.getElementById('playerName');
if (playerNameInput) {
    playerNameInput.value = localStorage.getItem('truco_player_name') || '';
    playerNameInput.addEventListener('input', () => {
        localStorage.setItem('truco_player_name', playerNameInput.value.trim());
    });
}

// ─── Navegação de Abas do Lobby ───────────────────────────────────────────────
const tabBtnCreate   = document.getElementById('tab-btn-create');
const tabBtnJoin     = document.getElementById('tab-btn-join');
const tabBtnSettings = document.getElementById('tab-btn-settings');

const tabContentCreate   = document.getElementById('tab-content-create');
const tabContentJoin     = document.getElementById('tab-content-join');
const tabContentSettings = document.getElementById('tab-content-settings');

function switchLobbyTab(tab) {
    [tabBtnCreate, tabBtnJoin, tabBtnSettings].forEach(b => { if (b) b.classList.remove('active-tab'); });
    [tabContentCreate, tabContentJoin, tabContentSettings].forEach(c => { if (c) c.classList.add('hidden'); });

    if (tab === 'create') {
        if (tabBtnCreate) tabBtnCreate.classList.add('active-tab');
        if (tabContentCreate) tabContentCreate.classList.remove('hidden');
    } else if (tab === 'join') {
        if (tabBtnJoin) tabBtnJoin.classList.add('active-tab');
        if (tabContentJoin) tabContentJoin.classList.remove('hidden');
        requestRecentRooms();
    } else if (tab === 'settings') {
        if (tabBtnSettings) tabBtnSettings.classList.add('active-tab');
        if (tabContentSettings) tabContentSettings.classList.remove('hidden');
        updateLobbySettingsUI();
    }
}

if (tabBtnCreate)   tabBtnCreate.addEventListener('click', () => switchLobbyTab('create'));
if (tabBtnJoin)     tabBtnJoin.addEventListener('click', () => switchLobbyTab('join'));
if (tabBtnSettings) tabBtnSettings.addEventListener('click', () => switchLobbyTab('settings'));

// ─── Configurações no Lobby ───────────────────────────────────────────────────
const lobbyToggleSound = document.getElementById('lobby-toggle-sound');
const lobbyToggleSlam  = document.getElementById('lobby-toggle-slam');
const lobbyBtnRules    = document.getElementById('lobby-btn-rules');

function updateLobbySettingsUI() {
    if (lobbyToggleSound) {
        lobbyToggleSound.textContent = sfx.enabled ? 'Ativado' : 'Silenciado';
        lobbyToggleSound.className = sfx.enabled
            ? 'font-bold px-3 py-1 rounded-lg bg-green-600 text-white transition-colors'
            : 'font-bold px-3 py-1 rounded-lg bg-zinc-700 text-zinc-300 transition-colors';
    }
    if (lobbyToggleSlam) {
        lobbyToggleSlam.textContent = isSlamEnabled ? 'Ativado' : 'Desativado';
        lobbyToggleSlam.className = isSlamEnabled
            ? 'font-bold px-3 py-1 rounded-lg bg-green-600 text-white transition-colors'
            : 'font-bold px-3 py-1 rounded-lg bg-zinc-700 text-zinc-300 transition-colors';
    }
}

if (lobbyToggleSound) {
    lobbyToggleSound.addEventListener('click', () => {
        sfx.enabled = !sfx.enabled;
        updateSoundUI();
        updateLobbySettingsUI();
        showNotification(sfx.enabled ? "Sons Ativados" : "Sons Silenciados", "border-blue-500 text-blue-400");
    });
}

if (lobbyToggleSlam) {
    lobbyToggleSlam.addEventListener('click', () => {
        isSlamEnabled = !isSlamEnabled;
        localStorage.setItem('truco_slam_enabled', isSlamEnabled);
        updateSlamUI();
        updateLobbySettingsUI();
        showNotification(isSlamEnabled ? "Pancadas Ativadas!" : "Pancadas Desativadas", "border-amber-500 text-amber-400");
    });
}

if (lobbyBtnRules) {
    lobbyBtnRules.addEventListener('click', () => {
        const rulesModal = document.getElementById('rules-modal');
        if (rulesModal) rulesModal.classList.remove('hidden');
    });
}

// ─── Histórico de Salas Recentes & Pontuação ──────────────────────────────────
function getStoredRecentRooms() {
    try {
        const raw = localStorage.getItem('truco_recent_rooms');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

function saveRecentRoom(roomCode, info = {}) {
    if (!roomCode) return;
    let list = getStoredRecentRooms();
    const existingIndex = list.findIndex(r => r.roomCode === roomCode);
    const updatedItem = {
        roomCode,
        gameMode: info.gameMode || (existingIndex !== -1 ? list[existingIndex].gameMode : selectedGameMode),
        variant: info.variant || (existingIndex !== -1 ? list[existingIndex].variant : selectedVariant),
        scoreText: info.scoreText || (existingIndex !== -1 ? list[existingIndex].scoreText : 'Equipe A 0 × 0 Equipe B'),
        score: info.score || (existingIndex !== -1 ? list[existingIndex].score : [0, 0]),
        status: info.status || (existingIndex !== -1 ? list[existingIndex].status : 'waiting'),
        updatedAt: Date.now()
    };

    if (existingIndex !== -1) {
        list[existingIndex] = { ...list[existingIndex], ...updatedItem };
    } else {
        list.unshift(updatedItem);
    }
    list = list.slice(0, 10);
    localStorage.setItem('truco_recent_rooms', JSON.stringify(list));
}

function updateRecentRoomScore(roomCode, score) {
    if (!roomCode || !score) return;
    const is1v1 = (currentGameMode === '1v1');
    const teamA = is1v1 ? (globalPlayers[0]?.name || 'Jogador A') : 'Dupla A';
    const teamB = is1v1 ? (globalPlayers[1]?.name || 'Jogador B') : 'Dupla B';
    const isFinished = (score[0] >= 12 || score[1] >= 12);
    const scoreText = `${teamA} ${score[0]} × ${score[1]} ${teamB}`;
    
    saveRecentRoom(roomCode, {
        score,
        scoreText,
        status: isFinished ? 'finished' : 'playing',
        gameMode: currentGameMode,
        variant: currentVariant
    });
}

function requestRecentRooms() {
    const list = getStoredRecentRooms();
    const localCodes = list.map(r => r.roomCode);
    const activeRoom = localStorage.getItem('truco_current_room');
    if (activeRoom && !localCodes.includes(activeRoom)) {
        localCodes.unshift(activeRoom);
    }
    socket.emit('getRecentRoomsStatus', { token: userToken, localRoomCodes: localCodes });
}

function renderRecentRooms(serverRooms = []) {
    const container = document.getElementById('recent-rooms-list');
    if (!container) return;

    // Sincroniza informações retornadas pelo servidor
    serverRooms.forEach(sr => {
        saveRecentRoom(sr.roomCode, {
            gameMode: sr.gameMode,
            variant: sr.variant,
            scoreText: sr.scoreText,
            score: sr.score,
            status: sr.status
        });
    });

    const stored = getStoredRecentRooms();

    if (stored.length === 0) {
        container.innerHTML = `
            <div class="text-center py-4 bg-black/20 rounded-xl border border-zinc-800/80">
                <p class="text-zinc-400 text-xs font-medium">Nenhuma sala recente.</p>
                <p class="text-zinc-500 text-[10px] mt-0.5">Crie uma nova sala ou entre com um código acima!</p>
            </div>
        `;
        return;
    }

    container.innerHTML = stored.map(r => {
        let statusBadge = '<span class="text-[9px] font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">⏳ Aguardando</span>';
        if (r.status === 'playing') {
            statusBadge = '<span class="text-[9px] font-bold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-600/40 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Em andamento</span>';
        } else if (r.status === 'finished') {
            statusBadge = '<span class="text-[9px] font-bold text-amber-300 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-600/40">🏁 Finalizada</span>';
        }

        const variantBadge = r.variant === 'mineiro' ? 'Mineiro' : 'Paulista';
        const modeBadge = r.gameMode === '1v1' ? '1v1' : '2v2';

        return `
            <div class="p-2.5 bg-black/40 rounded-xl border border-zinc-700/60 hover:border-zinc-500 flex items-center justify-between gap-2.5 transition-all">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span class="font-mono font-black text-amber-400 text-xs tracking-wider bg-black/50 px-1.5 py-0.5 rounded border border-zinc-700">${escapeHTML(r.roomCode)}</span>
                        <span class="text-[9px] font-bold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">${modeBadge} · ${variantBadge}</span>
                        ${statusBadge}
                    </div>
                    <div class="text-xs font-black text-zinc-200 truncate flex items-center gap-1.5">
                        <i class="ph ph-trophy text-amber-400 text-sm"></i>
                        <span>${escapeHTML(r.scoreText || '0 × 0')}</span>
                    </div>
                </div>
                <button type="button" class="btn-quick-join bg-gradient-to-r from-emerald-600 to-green-500 hover:from-emerald-500 hover:to-green-400 text-white font-extrabold text-xs px-3 py-1.5 rounded-lg shadow transition-all active:scale-95 shrink-0" data-code="${r.roomCode}">
                    ${r.status === 'playing' ? 'Reconectar' : 'Entrar'}
                </button>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-quick-join').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const code = e.currentTarget.dataset.code;
            if (code) {
                document.getElementById('roomCode').value = code;
                socket.emit('joinRoom', {
                    roomCode: code,
                    playerName: document.getElementById('playerName').value || 'Jogador',
                    token: userToken,
                    avatar: selectedAvatar,
                    title: selectedTitle
                });
            }
        });
    });
}

socket.on('recentRoomsStatus', (roomsList) => {
    renderRecentRooms(roomsList);

    const activeMatch = roomsList.find(r => r.hasActiveMatch);
    const activeBanner = document.getElementById('active-match-banner');
    const activeInfo   = document.getElementById('active-match-info');

    if (activeMatch && activeBanner) {
        activeBanner.classList.remove('hidden');
        if (activeInfo) {
            activeInfo.textContent = `Sala: ${activeMatch.roomCode} · ${activeMatch.scoreText}`;
        }
        const btnReconnect = document.getElementById('btn-reconnect-active');
        if (btnReconnect) {
            btnReconnect.onclick = () => {
                document.getElementById('roomCode').value = activeMatch.roomCode;
                socket.emit('joinRoom', {
                    roomCode: activeMatch.roomCode,
                    playerName: document.getElementById('playerName').value || 'Jogador',
                    token: userToken,
                    avatar: selectedAvatar,
                    title: selectedTitle
                });
            };
        }
        const btnDismiss = document.getElementById('btn-dismiss-active');
        if (btnDismiss) {
            btnDismiss.onclick = () => {
                activeBanner.classList.add('hidden');
            };
        }
    } else if (activeBanner) {
        activeBanner.classList.add('hidden');
    }
});

const btnRefreshRecent = document.getElementById('btn-refresh-recent');
if (btnRefreshRecent) {
    btnRefreshRecent.addEventListener('click', () => {
        requestRecentRooms();
        showNotification("Atualizando salas...", "border-blue-500 text-blue-400");
    });
}

// Inicializa listagem recente e verifica partida ativa ao carregar
requestRecentRooms();
renderRecentRooms();

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
    localStorage.setItem('truco_current_room', code);
    saveRecentRoom(code, { gameMode: currentGameMode, variant: currentVariant });
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

let notificationTimer = null;
function showNotification(msg, color = 'border-yellow-500 text-yellow-400') {
    const banner = document.getElementById('notification-banner');
    if (!banner) return;
    banner.textContent = msg;
    banner.className = `absolute top-16 md:top-6 left-1/2 transform -translate-x-1/2 glass-modal border-l-4 ${color} font-bold text-sm md:text-base px-6 py-3 rounded-2xl shadow-2xl z-[80] pointer-events-none transition-all duration-300`;
    banner.classList.remove('hidden');
    
    if (notificationTimer) clearTimeout(notificationTimer);
    notificationTimer = setTimeout(() => {
        banner.classList.add('hidden');
        notificationTimer = null;
    }, 3000);
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
        variant: selectedVariant,
        avatar: selectedAvatar,
        title: selectedTitle
    });
});

document.getElementById('btnJoin').addEventListener('click', () => {
    socket.emit('joinRoom', {
        roomCode: document.getElementById('roomCode').value.toUpperCase(),
        playerName: document.getElementById('playerName').value || 'Jogador',
        token: userToken,
        avatar: selectedAvatar,
        title: selectedTitle
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
    const cardKey = `${playerId}_${card.value}_${card.suit}`;

    // Evita duplicar se a carta já estiver renderizada
    const existing = tableCards.querySelector(`[data-card-key="${cardKey}"]`);
    if (existing) return;

    const cardEl = document.createElement('div');
    cardEl.className = "absolute table-card-shadow z-20 pointer-events-none";
    cardEl.dataset.cardKey = cardKey;

    const myIndex = globalPlayers.findIndex(p => p.id === socket.id);
    const pIndex  = globalPlayers.findIndex(p => p.id === playerId);
    const is1v1   = globalPlayers.length === 2;

    let relativePos;
    if (is1v1) {
        relativePos = (playerId === socket.id) ? 0 : 2; // Em 1v1 o oponente é sempre topo (2)
    } else {
        relativePos = (pIndex - myIndex + 4) % 4;
    }

    // Rotação determinística e estável (não treme nem muda a cada updateState)
    const cardSeed = ((playerId.charCodeAt(0) || 7) * 13 + (card.value.charCodeAt(0) || 3) * 7 + (card.suit.charCodeAt(0) || 1)) % 11;
    const randomTilt = cardSeed - 5; // varia de -5deg a +5deg de forma fixa

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
        const p = globalPlayers[idx];
        const el = document.getElementById(id);
        if (!p || !el) return;
        const pAvatar = p.avatar || '🤠';
        const pTitle  = p.title  || 'Truqueiro';
        el.dataset.id = p.id;
        el.className  = `text-white font-bold px-3 py-1 md:px-5 md:py-1.5 rounded-full text-xs md:text-sm player-tag relative flex items-center gap-1.5 md:gap-2 shadow-lg ${(idx % 2 === 0) ? 'team-a-border' : 'team-b-border'}`;
        el.innerHTML  = `
            <span class="text-base md:text-lg leading-none select-none">${pAvatar}</span>
            <div class="flex flex-col text-left leading-tight">
                <span class="font-extrabold truncate max-w-[85px] md:max-w-[125px]">${escapeHTML(p.name)}</span>
                <span class="text-[9px] md:text-[10px] text-zinc-300 font-normal truncate max-w-[85px] md:max-w-[125px] opacity-80">${escapeHTML(pTitle)}</span>
            </div>
        `;
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

    // Controle de exibição de Sinais Secretos (2v2 apenas)
    const signalsContainer = document.getElementById('signals-container');
    if (signalsContainer) {
        signalsContainer.style.display = is1v1 ? 'none' : 'inline-block';
    }

    // Detecção e inicialização de nova mão no Histórico de Vazas (Truco Raiz)
    const isNewHand = !state.trickResults || state.trickResults.every(r => r === undefined);
    if (isNewHand && (!currentHandLog.vira || currentHandLog.vira.value !== state.vira?.value || currentHandLog.vira.suit !== state.vira?.suit || (state.hand && state.hand.length === 3 && currentHandLog.tricks[0].plays.length > 0))) {
        currentHandLog = {
            handNumber: (currentHandLog.handNumber || 0) + 1,
            vira: state.vira,
            handValue: state.handValue || 1,
            tricks: [
                { plays: [], winnerTeam: null, isTie: false, decisivePlayer: null },
                { plays: [], winnerTeam: null, isTie: false, decisivePlayer: null },
                { plays: [], winnerTeam: null, isTie: false, decisivePlayer: null }
            ],
            trucoEvents: [],
            handWinner: null,
            endMessage: null
        };
    } else if (state.vira) {
        currentHandLog.vira = state.vira;
        currentHandLog.handValue = state.handValue || 1;
    }

    // ── Placar ───────────────────────────────────────────────────────────────
    document.getElementById('sidebar-score-teamA').textContent = state.score[0];
    document.getElementById('mobile-score-teamA').textContent  = state.score[0];
    document.getElementById('sidebar-score-teamB').textContent = state.score[1];
    document.getElementById('mobile-score-teamB').textContent  = state.score[1];
    document.getElementById('sidebar-hand-value').textContent  = state.handValue;
    document.getElementById('mobile-hand-value').textContent   = state.handValue;

    if (state.score && currentRoomCode) {
        updateRecentRoomScore(currentRoomCode, state.score);
    }

    if (window.Truco3D) {
        Truco3D.updatePlayers(globalPlayers, socket.id);
    }

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

    // ── Reconciliação Inteligente das Cartas na Mesa (Sem Glitches) ──────────
    const tableCardsContainer = document.getElementById('played-cards');
    if (!state.tableCards || state.tableCards.length === 0) {
        tableCardsContainer.innerHTML = '';
    } else {
        const currentKeys = state.tableCards.map(tc => `${tc.playerId}_${tc.card.value}_${tc.card.suit}`);
        // Remove cartas que não estão mais na mesa
        Array.from(tableCardsContainer.children).forEach(el => {
            if (el.dataset.cardKey && !currentKeys.includes(el.dataset.cardKey)) {
                el.remove();
            }
        });
        // Adiciona cartas que ainda não foram renderizadas sem tocar nas já existentes
        state.tableCards.forEach(tc => {
            const cardKey = `${tc.playerId}_${tc.card.value}_${tc.card.suit}`;
            if (!tableCardsContainer.querySelector(`[data-card-key="${cardKey}"]`)) {
                renderPlayedCard(tc.playerId, tc.card, false);
            }
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
            if (!isSlamNextCard) {
                sfx.playCard();
            }

            // Marca a carta como enviando (SEM REMOVER DO DOM AINDA)
            wrap.classList.add('opacity-40', 'pointer-events-none', 'scale-95');

            // Safety timeout: se por qualquer razão a jogada não for respondida em 2.5s, restaura o estado
            setTimeout(() => {
                if (isPlayingCard) {
                    isPlayingCard = false;
                    wrap.classList.remove('opacity-40', 'pointer-events-none', 'scale-95');
                }
            }, 2500);

            socket.emit('playCard', {
                roomCode: currentRoomCode,
                card,
                hidden: isHidingNextCard,
                slam: isSlamNextCard
            });
            isHidingNextCard = false;
            document.getElementById('btn-hide-card').classList.remove('bg-yellow-600');

            if (isSlamNextCard) {
                isSlamNextCard = false;
                const bSlam = document.getElementById('btn-slam');
                if (bSlam) {
                    bSlam.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-600');
                }
            }
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

    // Registra no Histórico da Rodada (Truco Raiz)
    const currentTrickIdx = Math.min(2, Math.max(0, currentHandLog.tricks.findIndex(t => t.winnerTeam === null && !t.isTie)));
    const playerObj = globalPlayers.find(p => p.id === data.playerId);
    const pName = playerObj ? playerObj.name : 'Jogador';
    if (currentHandLog.tricks[currentTrickIdx]) {
        currentHandLog.tricks[currentTrickIdx].plays.push({
            playerId: data.playerId,
            playerName: pName,
            card: data.card,
            isManilha: data.isManilha,
            isSlam: data.isSlam,
            hidden: data.card?.hidden
        });
    }

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
    }

    if (data.isSlam || data.isManilha) {
        triggerTableSlam(data.playerId);
    } else if (data.playerId !== socket.id) {
        sfx.playCard();
    }

    if (window.Truco3D) {
        Truco3D.onCardPlayed(data);
    }

    renderPlayedCard(data.playerId, data.card, true);
    updateTurnUI(data.nextTurnId);
});

// ─── Fim da Vaza (Recolhimento Suave de Cartas) ────────────────────────────────
socket.on('trickEnded', (data) => {
    clearTrickCleanTimer();

    // Atualiza vencedor no Histórico da Rodada (Truco Raiz)
    const endedTrickIdx = Math.min(2, Math.max(0, currentHandLog.tricks.findIndex(t => t.winnerTeam === null && !t.isTie)));
    if (currentHandLog.tricks[endedTrickIdx]) {
        if (data.winnerTeam === -1) {
            currentHandLog.tricks[endedTrickIdx].isTie = true;
        } else {
            currentHandLog.tricks[endedTrickIdx].winnerTeam = data.winnerTeam;
            if (data.topPlayerId) {
                const topP = globalPlayers.find(p => p.id === data.topPlayerId);
                currentHandLog.tricks[endedTrickIdx].decisivePlayer = topP ? topP.name : null;
            }
        }
    }

    if (window.Truco3D) {
        Truco3D.onTrickEnded();
    }

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

    if (window.Truco3D) {
        Truco3D.clearTable();
    }

    // Registra desfecho da mão no Histórico da Rodada
    currentHandLog.handWinner = data.winnerTeam;
    currentHandLog.endMessage = data.message;

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

    if (window.Truco3D) {
        Truco3D.onGameOver(data.winnerTeam);
    }

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

    // Destaque MVP
    const mvpCard = document.getElementById('go-mvp-card');
    if (data.mvp) {
        if (mvpCard) mvpCard.classList.remove('hidden');
        const goMvpAvatar = document.getElementById('go-mvp-avatar');
        const goMvpName = document.getElementById('go-mvp-name');
        const goMvpTitle = document.getElementById('go-mvp-title');
        const goMvpTricks = document.getElementById('go-mvp-tricks');
        const goMvpDecisive = document.getElementById('go-mvp-decisive');
        const goMvpTrucos = document.getElementById('go-mvp-trucos');

        if (goMvpAvatar) goMvpAvatar.textContent = data.mvp.avatar || '👑';
        if (goMvpName) goMvpName.textContent = data.mvp.name || 'Jogador';
        if (goMvpTitle) goMvpTitle.textContent = data.mvp.title || 'Mestre do Truco';
        if (goMvpTricks) goMvpTricks.textContent = data.mvp.tricksWon || 0;
        if (goMvpDecisive) goMvpDecisive.textContent = data.mvp.decisiveTricksWon || 0;
        if (goMvpTrucos) goMvpTrucos.textContent = data.mvp.trucosWon || 0;
    } else if (mvpCard) {
        mvpCard.classList.add('hidden');
    }

    // Estatísticas da partida
    if (data.stats) {
        const handsEl = document.getElementById('go-stat-hands');
        const trucosEl = document.getElementById('go-stat-trucos');
        const maxValEl = document.getElementById('go-stat-maxval');
        if (handsEl) handsEl.textContent = data.stats.handsPlayed || 0;
        if (trucosEl) trucosEl.textContent = data.stats.trucosCalledCount || 0;
        if (maxValEl) maxValEl.textContent = `${data.stats.maxTrucoValue || 1} pt${(data.stats.maxTrucoValue || 1) > 1 ? 's' : ''}`;
    }

    if (data.score && currentRoomCode) {
        updateRecentRoomScore(currentRoomCode, data.score);
    }

    modal.classList.remove('hidden');
});

// ─── Reiniciar Partida (Rematch) ──────────────────────────────────────────────
document.getElementById('btn-play-again').addEventListener('click', () => {
    socket.emit('playAgain', { roomCode: currentRoomCode });
    document.getElementById('game-over-modal').classList.add('hidden');
});

document.getElementById('btn-back-lobby').addEventListener('click', () => {
    localStorage.removeItem('truco_current_room');
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

const btnSlam = document.getElementById('btn-slam');
if (btnSlam) {
    btnSlam.addEventListener('click', () => {
        isSlamNextCard = !isSlamNextCard;
        btnSlam.classList.toggle('ring-2', isSlamNextCard);
        btnSlam.classList.toggle('ring-amber-400', isSlamNextCard);
        btnSlam.classList.toggle('bg-amber-600', isSlamNextCard);
        if (isSlamNextCard) {
            showNotification("💥 Pancada Armada! A mesa vai tremer!", "border-amber-500 text-amber-400");
        }
    });
}

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

    if (window.Truco3D) {
        Truco3D.onTrucoRequested(data.newValue, data.answeringTeam, data.requestedBy);
    }

    // Registra pedido de Truco no Histórico da Rodada (Truco Raiz)
    currentHandLog.trucoEvents.push({
        text: `${data.requestedByName || 'Jogador'} pediu ${data.newValue === 3 ? 'TRUCO' : (data.newValue === 6 ? 'SEIS' : (data.newValue === 9 ? 'NOVE' : 'DOZE'))}! (Vale ${data.newValue} pts)`,
        newValue: data.newValue
    });
    currentHandLog.handValue = data.newValue;

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

    // Registra aceitação de Truco no Histórico da Rodada (Truco Raiz)
    currentHandLog.trucoEvents.push({
        text: `Truco Aceito! Rodada valendo ${data.newValue} pontos.`,
        newValue: data.newValue
    });
    currentHandLog.handValue = data.newValue;
    
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

socket.on('trucoCanceled', (data) => {
    const runningTeam = (data && data.runningTeam !== undefined) ? data.runningTeam : currentTrucoAnsweringTeam;
    iVotedToRun = false;
    currentTrucoAnsweringTeam = -1;
    isPlayingCard = false;
    document.getElementById('truco-modal').classList.add('hidden');

    if (window.Truco3D) {
        Truco3D.onPlayerRun(runningTeam);
    }

    // Registra recusa de Truco no Histórico da Rodada (Truco Raiz)
    currentHandLog.trucoEvents.push({
        text: `Equipe adversária correu do Truco!`,
        newValue: currentHandLog.handValue
    });

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

socket.on('chatMessageReceived', (data) => {
    if (!chatMessages) return;

    const isMe = (data.playerId === socket.id);
    const msgWrapper = document.createElement('div');
    msgWrapper.className = `flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`;

    const teamColor = data.playerTeam === 0 ? 'text-blue-400' : 'text-red-400';
    const pAvatar = data.playerAvatar || '🤠';
    const senderDisplay = isMe 
        ? `<span class="text-emerald-400 font-bold flex items-center gap-1"><span class="text-xs select-none">${pAvatar}</span> Você</span>` 
        : `<span class="flex items-center gap-1"><span class="text-xs select-none">${pAvatar}</span><span class="${teamColor} font-bold">${escapeHTML(data.playerName)}</span></span>`;

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

// ─── Histórico da Rodada / Vazas (Truco Raiz) ─────────────────────────────────
function renderHandLogModal() {
    const modal = document.getElementById('hand-log-modal');
    if (!modal) return;

    // Vira
    const viraEl = document.getElementById('hand-log-vira');
    if (currentHandLog.vira) {
        const style = getCardStyle(currentHandLog.vira.suit);
        viraEl.innerHTML = `<span class="font-black ${style.color}">${currentHandLog.vira.value}${style.symbol}</span>`;
    } else {
        viraEl.textContent = currentVariant === 'mineiro' ? 'Mineiro Fixo' : '—';
    }

    // Valor da mão
    document.getElementById('hand-log-value').textContent = `${currentHandLog.handValue || 1} pt(s)`;

    // Placar atual
    const scoreA = document.getElementById('sidebar-score-teamA')?.textContent || '0';
    const scoreB = document.getElementById('sidebar-score-teamB')?.textContent || '0';
    document.getElementById('hand-log-score').textContent = `${scoreA} × ${scoreB}`;

    // Entries
    const entriesDiv = document.getElementById('hand-log-entries');
    entriesDiv.innerHTML = '';

    let hasAnyPlays = false;
    currentHandLog.tricks.forEach((trick, idx) => {
        if (trick.plays.length === 0 && trick.winnerTeam === null && !trick.isTie) return;
        hasAnyPlays = true;

        const trickCard = document.createElement('div');
        trickCard.className = 'p-3 bg-zinc-900/90 rounded-2xl border border-zinc-800 flex flex-col gap-2';

        let statusBadge = '<span class="text-[10px] text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded font-bold">Em disputa</span>';
        if (trick.isTie) {
            statusBadge = '<span class="text-[10px] text-amber-300 bg-amber-950/60 border border-amber-600/40 px-2 py-0.5 rounded font-black">Embuchou / Cangada ⚔️</span>';
        } else if (trick.winnerTeam !== null) {
            const teamColor = trick.winnerTeam === 0 ? 'text-blue-400 bg-blue-950/60 border-blue-600/40' : 'text-red-400 bg-red-950/60 border-red-600/40';
            const teamLabel = trick.winnerTeam === 0 ? 'Equipe A' : 'Equipe B';
            const winnerInfo = trick.decisivePlayer ? ` (${trick.decisivePlayer})` : '';
            statusBadge = `<span class="text-[10px] ${teamColor} border px-2 py-0.5 rounded font-black">Vitória: ${teamLabel}${winnerInfo}</span>`;
        }

        let playsHTML = '';
        trick.plays.forEach(p => {
            let cardLabel = '';
            if (p.hidden) {
                cardLabel = '<span class="bg-zinc-800 text-zinc-400 border border-zinc-700 px-2 py-0.5 rounded text-[11px] font-mono">🙈 Oculta</span>';
            } else if (p.card) {
                const style = getCardStyle(p.card.suit);
                const manilhaTag = p.isManilha ? '<span class="text-[9px] bg-amber-500 text-black px-1.5 py-0.2 rounded font-black uppercase tracking-wider ml-1">Manilha</span>' : '';
                const slamTag = p.isSlam ? '<span class="text-[9px] bg-red-600 text-white px-1.5 py-0.2 rounded font-black uppercase tracking-wider ml-1">💥 Pancada</span>' : '';
                cardLabel = `<span class="bg-black/50 ${style.color} border border-zinc-700 px-2 py-0.5 rounded text-[11px] font-bold font-mono">${p.card.value}${style.symbol}</span>${manilhaTag}${slamTag}`;
            }
            playsHTML += `
                <div class="flex items-center justify-between py-1 border-b border-zinc-800/60 last:border-0">
                    <span class="text-zinc-200 font-semibold flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-zinc-500"></span>
                        ${escapeHTML(p.playerName)}
                    </span>
                    <div>${cardLabel}</div>
                </div>
            `;
        });

        trickCard.innerHTML = `
            <div class="flex items-center justify-between pb-1 border-b border-zinc-800">
                <span class="font-black text-xs uppercase tracking-wider text-amber-400">${idx + 1}ª Vaza</span>
                ${statusBadge}
            </div>
            <div class="flex flex-col">
                ${playsHTML || '<span class="text-zinc-500 italic text-[11px]">Aguardando jogadas...</span>'}
            </div>
        `;
        entriesDiv.appendChild(trickCard);
    });

    // Truco events banner if any
    if (currentHandLog.trucoEvents.length > 0) {
        const trucoCard = document.createElement('div');
        trucoCard.className = 'p-2.5 bg-red-950/40 rounded-xl border border-red-500/40 flex flex-col gap-1';
        let eventsHTML = '';
        currentHandLog.trucoEvents.forEach(te => {
            eventsHTML += `<div class="text-[11px] font-bold text-red-300 flex items-center gap-1.5"><i class="ph ph-fire text-amber-400"></i> ${escapeHTML(te.text)}</div>`;
        });
        trucoCard.innerHTML = `
            <div class="font-extrabold text-[10px] uppercase tracking-wider text-amber-400">Aumentos de Aposta (Truco)</div>
            ${eventsHTML}
        `;
        entriesDiv.appendChild(trucoCard);
    }

    if (!hasAnyPlays && currentHandLog.trucoEvents.length === 0) {
        entriesDiv.innerHTML = `
            <div class="text-center text-zinc-500 py-6 italic text-xs">
                Nenhuma carta jogada nesta mão ainda. As vazas aparecerão aqui em tempo real!
            </div>
        `;
    }
}

// ─── Sinais Secretos de Dupla (Truco Raiz) ─────────────────────────────────────
function setupSecretSignals() {
    const btnSignals = document.getElementById('btn-signals');
    const signalsMenu = document.getElementById('signals-menu');
    if (!btnSignals || !signalsMenu) return;

    btnSignals.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx.playClick();
        signalsMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('.signal-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const signalId = btn.dataset.signal;
            const sig = SECRET_SIGNALS[signalId];
            signalsMenu.classList.add('hidden');

            if (!currentRoomCode || !sig) return;

            sfx.playClick();
            socket.emit('sendSecretSignal', { roomCode: currentRoomCode, signalId });
            if (window.Truco3D) {
                Truco3D.onSecretSignal(socket.id, signalId);
            }
            showNotification(`🤫 Você fez o sinal: ${sig.name} (${sig.meaning})`, 'border-amber-400 text-amber-300');
        });
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        if (!signalsMenu.contains(e.target) && e.target !== btnSignals) {
            signalsMenu.classList.add('hidden');
        }
    });
}
setupSecretSignals();

socket.on('secretSignalReceived', (data) => {
    const sig = SECRET_SIGNALS[data.signalId];
    if (!sig) return;

    sfx.playSignal();

    if (window.Truco3D) {
        Truco3D.onSecretSignal(data.senderId, data.signalId);
    }

    const toast = document.getElementById('secret-signal-toast');
    const toastIcon = document.getElementById('secret-signal-icon');
    const toastText = document.getElementById('secret-signal-text');

    if (toast && toastIcon && toastText) {
        toastIcon.textContent = sig.emoji;
        toastText.innerHTML = `${escapeHTML(data.senderName || 'Parceiro')} fez o sinal: <b>${sig.name}</b> <span class="block ${sig.color} text-[11px] font-bold">(${sig.meaning})</span>`;

        toast.classList.remove('hidden');

        if (signalToastTimer) clearTimeout(signalToastTimer);
        signalToastTimer = setTimeout(() => {
            toast.classList.add('hidden');
            signalToastTimer = null;
        }, 4000);
    }

    // Mini balão secreto sobre o parceiro na mesa
    const partnerNameEl = document.getElementById('partner-name');
    if (partnerNameEl) {
        const bubble = document.createElement('div');
        bubble.className = 'chat-speech-bubble bg-amber-950/90 text-amber-300 border-amber-500/60';
        bubble.innerHTML = `${sig.emoji} <span class="font-black">${sig.name}</span>`;
        partnerNameEl.appendChild(bubble);
        setTimeout(() => bubble.remove(), 3500);
    }
});

// ─── Controles de Modais & Menus ──────────────────────────────────────────────
const btnHandLog        = document.getElementById('btn-hand-log');
const btnMenuHandLog    = document.getElementById('btn-menu-hand-log');
const handLogModal      = document.getElementById('hand-log-modal');
const btnCloseHandLog   = document.getElementById('btn-close-hand-log');
const btnDismissHandLog = document.getElementById('btn-dismiss-hand-log');

function openHandLog() {
    sfx.playClick();
    renderHandLogModal();
    if (gameMenuModal) gameMenuModal.classList.add('hidden');
    if (handLogModal)  handLogModal.classList.remove('hidden');
}

function closeHandLog() {
    sfx.playClick();
    if (handLogModal) handLogModal.classList.add('hidden');
}

if (btnHandLog)        btnHandLog.addEventListener('click', openHandLog);
if (btnMenuHandLog)    btnMenuHandLog.addEventListener('click', openHandLog);
if (btnCloseHandLog)   btnCloseHandLog.addEventListener('click', closeHandLog);
if (btnDismissHandLog) btnDismissHandLog.addEventListener('click', closeHandLog);

// ─── Game Menu, Regras & Tecla Escape ─────────────────────────────────────────
const btnGameMenu      = document.getElementById('btn-game-menu');
const gameMenuModal    = document.getElementById('game-menu-modal');
const btnCloseGameMenu = document.getElementById('btn-close-game-menu');
const btnMenuResume    = document.getElementById('btn-menu-resume');
const toggleSlamBtn    = document.getElementById('toggle-slam-btn');
const btnMenuRules     = document.getElementById('btn-menu-rules');
const rulesModal       = document.getElementById('rules-modal');
const btnCloseRules    = document.getElementById('btn-close-rules');
const btnMenuSettings  = document.getElementById('btn-menu-settings');
const btnMenuLeave     = document.getElementById('btn-menu-leave');

function updateSlamUI() {
    if (!toggleSlamBtn) return;
    if (isSlamEnabled) {
        toggleSlamBtn.textContent = 'Ativado';
        toggleSlamBtn.className = 'font-bold px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors';
    } else {
        toggleSlamBtn.textContent = 'Desativado';
        toggleSlamBtn.className = 'font-bold px-3 py-1 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors';
    }
}
updateSlamUI();

if (btnGameMenu)      btnGameMenu.addEventListener('click', () => { sfx.playClick(); gameMenuModal.classList.remove('hidden'); });
if (btnCloseGameMenu) btnCloseGameMenu.addEventListener('click', () => { sfx.playClick(); gameMenuModal.classList.add('hidden'); });
if (btnMenuResume)    btnMenuResume.addEventListener('click', () => { sfx.playClick(); gameMenuModal.classList.add('hidden'); });

if (toggleSlamBtn) {
    toggleSlamBtn.addEventListener('click', () => {
        sfx.playClick();
        isSlamEnabled = !isSlamEnabled;
        localStorage.setItem('truco_slam_enabled', isSlamEnabled);
        updateSlamUI();
        showNotification(isSlamEnabled ? "Pancadas Ativadas!" : "Pancadas Desativadas", "border-amber-500 text-amber-400");
    });
}

if (btnMenuRules) {
    btnMenuRules.addEventListener('click', () => {
        sfx.playClick();
        gameMenuModal.classList.add('hidden');
        rulesModal.classList.remove('hidden');
    });
}
if (btnCloseRules) btnCloseRules.addEventListener('click', () => { sfx.playClick(); rulesModal.classList.add('hidden'); });

if (btnMenuSettings) {
    btnMenuSettings.addEventListener('click', () => {
        sfx.playClick();
        gameMenuModal.classList.add('hidden');
        settingsModal.classList.remove('hidden');
    });
}

if (btnMenuLeave) {
    btnMenuLeave.addEventListener('click', () => {
        sfx.playClick();
        if (confirm('Tem certeza de que deseja sair da partida e retornar ao lobby?')) {
            localStorage.removeItem('truco_current_room');
            socket.emit('leaveRoom', { roomCode: currentRoomCode });
            location.reload();
        }
    });
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const signalsMenu = document.getElementById('signals-menu');
        if (signalsMenu && !signalsMenu.classList.contains('hidden')) {
            signalsMenu.classList.add('hidden');
        } else if (handLogModal && !handLogModal.classList.contains('hidden')) {
            handLogModal.classList.add('hidden');
        } else if (rulesModal && !rulesModal.classList.contains('hidden')) {
            rulesModal.classList.add('hidden');
        } else if (settingsModal && !settingsModal.classList.contains('hidden')) {
            settingsModal.classList.add('hidden');
        } else if (isChatOpen()) {
            closeChat();
        } else if (gameMenuModal) {
            gameMenuModal.classList.toggle('hidden');
        }
    }
});

socket.on('playerLeft', (data) => {
    showNotification(`${data.playerName} saiu da partida.`, 'border-red-500 text-red-400');
});

// ─── Inicialização e Controles do Visualizador 3D Ragdoll de Boteco ───────────
const canvas3dEl = document.getElementById('canvas-3d-container');
if (window.Truco3D && canvas3dEl) {
    Truco3D.init(canvas3dEl);
}

function update3DButtonsUI() {
    const is3D = window.Truco3D ? (Truco3D.getMode() === '3d') : false;
    ['settings-toggle-3d-btn', 'menu-toggle-3d-btn'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.textContent = is3D ? 'Ativado' : 'Desativado';
        btn.className = is3D
            ? 'text-xs font-bold px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors'
            : 'text-xs font-bold px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors';
    });
}
update3DButtonsUI();

const btnToggleViewMode = document.getElementById('btn-toggle-view-mode');
if (btnToggleViewMode) {
    btnToggleViewMode.addEventListener('click', () => {
        sfx.playClick();
        if (window.Truco3D) {
            Truco3D.toggleMode();
            update3DButtonsUI();
            const mode = Truco3D.getMode();
            showNotification(
                mode === '3d' ? "🎲 Modo 3D Ragdoll Ativado!" : "🃏 Modo 2D Clássico Ativado!",
                "border-emerald-500 text-emerald-400"
            );
        }
    });
}

['settings-toggle-3d-btn', 'menu-toggle-3d-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', () => {
        sfx.playClick();
        if (window.Truco3D) {
            Truco3D.toggleMode();
            update3DButtonsUI();
            const mode = Truco3D.getMode();
            showNotification(
                mode === '3d' ? "🎲 Modo 3D Ragdoll Ativado!" : "🃏 Modo 2D Clássico Ativado!",
                "border-emerald-500 text-emerald-400"
            );
        }
    });
});

const btnResetCam = document.getElementById('btn-reset-cam');
if (btnResetCam) {
    btnResetCam.addEventListener('click', (e) => {
        e.stopPropagation();
        sfx.playClick();
        if (window.Truco3D) {
            Truco3D.resetCamera();
            showNotification('🎥 Câmera 3D redefinida!', 'border-amber-400 text-amber-300');
        }
    });
}