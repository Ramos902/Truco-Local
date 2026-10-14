const VALUES = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];
const SUITS = ['ouros', 'espadas', 'copas', 'paus'];

function createDeck() {
    let deck = [];
    for (let value of VALUES) {
        for (let suit of SUITS) {
            deck.push({ value, suit });
        }
    }
    return deck;
}

function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// ─── Truco Paulista ───────────────────────────────────────────────────────────
// Manilha definida pela carta seguinte ao vira (wrap-around: 3 -> 4, 2 -> 3).
function getManilhaValue(viraValue) {
    const index = VALUES.indexOf(viraValue);
    return VALUES[(index + 1) % VALUES.length];
}

function getCardPowerPaulista(card, manilhaValue) {
    if (card.hidden) return -1;
    if (card.value === manilhaValue) {
        const suitPower = { 'ouros': 1, 'espadas': 2, 'copas': 3, 'paus': 4 };
        return 100 + suitPower[card.suit];
    }
    return VALUES.indexOf(card.value);
}

// ─── Truco Mineiro ────────────────────────────────────────────────────────────
// Sem vira. As manilhas ("galheiros") são fixas e imutáveis:
//   4♣ (Zap)  >  7♥  >  A♠  >  7♦
// Hierarquia normal (não-galheiro): 4, 5, 6, 7*, Q, J, K, A*, 2, 3
// (* = naipes que não são galheiros)
function getCardPowerMineiro(card) {
    if (card.hidden) return -1;
    // Galheiros fixos
    if (card.value === '4' && card.suit === 'paus')    return 14; // Zap
    if (card.value === '7' && card.suit === 'copas')   return 13; // 7 de Copas
    if (card.value === 'A' && card.suit === 'espadas') return 12; // Espadilha
    if (card.value === '7' && card.suit === 'ouros')   return 11; // 7 de Ouros
    // Cartas normais (índice 0–9)
    return VALUES.indexOf(card.value);
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
function getCardPower(card, manilhaValue, variant = 'paulista') {
    if (variant === 'mineiro') return getCardPowerMineiro(card);
    return getCardPowerPaulista(card, manilhaValue);
}

// ─── Avaliação de Vaza ────────────────────────────────────────────────────────
function evaluateTrick(tableCards, manilhaValue, players, variant = 'paulista') {
    let maxPower = -2;
    let winnerTeam = -1;
    let topPlayerId = null;
    let tie = false;

    tableCards.forEach(tc => {
        const pIndex = players.findIndex(p => p.id === tc.playerId);
        const team = pIndex % 2;
        const power = getCardPower(tc.card, manilhaValue, variant);

        if (power > maxPower) {
            maxPower = power;
            winnerTeam = team;
            topPlayerId = tc.playerId;
            tie = false;
        } else if (power === maxPower && power !== -1) {
            if (winnerTeam !== team) tie = true;
        }
    });

    return {
        winnerTeam: tie ? -1 : winnerTeam,
        topPlayerId: tie ? null : topPlayerId
    };
}

// ─── Verificação de Vencedor da Mão ──────────────────────────────────────────
// Regras oficiais de desempate (Cangada).
function checkHandWinner(trickResults) {
    let winsA = trickResults.filter(r => r === 0).length;
    let winsB = trickResults.filter(r => r === 1).length;

    if (winsA >= 2) return 0;
    if (winsB >= 2) return 1;

    if (trickResults[0] === -1) {
        if (trickResults.length < 2) return null;
        if (trickResults[1] === 0) return 0;
        if (trickResults[1] === 1) return 1;
        if (trickResults[1] === -1) {
            if (trickResults.length < 3) return null;
            if (trickResults[2] === 0) return 0;
            if (trickResults[2] === 1) return 1;
            if (trickResults[2] === -1) return -1;
        }
    } else if (trickResults[0] !== undefined) {
        if (trickResults.length < 2) return null;
        if (trickResults[1] === -1) return trickResults[0];
        if (trickResults.length === 3 && trickResults[2] === -1) return trickResults[0];
    }

    return null;
}

// ─── Início de Mão ────────────────────────────────────────────────────────────
function startHand(state) {
    const numPlayers = state.players.length; // Suporta 2 (1v1) ou 4 (2v2)

    let deck = shuffle(createDeck());
    state.hands = {};

    state.players.forEach(p => {
        state.hands[p.id] = [deck.pop(), deck.pop(), deck.pop()];
    });

    state.vira = deck.pop();

    // Paulista: manilha dinâmica via vira | Mineiro: galheiros fixos (manilhaValue não é usado)
    state.manilhaValue = (state.variant === 'mineiro') ? null : getManilhaValue(state.vira.value);

    // ── Mão de 11 ──
    // 11x11 (Mão de Ferro): jogo obrigatório, sem modal, vale 1 ponto
    if (state.score[0] === 11 && state.score[1] === 11) {
        state.isMaoDe11   = false;
        state.maoDe11Team = -1;
        state.maoDe11Answered = true;
        state.handValue   = 1;
    } else {
        let maoDe11Team = -1;
        if (state.score[0] === 11) maoDe11Team = 0;
        else if (state.score[1] === 11) maoDe11Team = 1;

        state.isMaoDe11       = (maoDe11Team !== -1);
        state.maoDe11Team     = maoDe11Team;
        state.maoDe11Answered = !state.isMaoDe11;
        state.handValue       = state.isMaoDe11 ? 3 : 1;
    }

    state.tableCards    = [];
    state.trickResults  = [];
    state.trucoLevel    = 0;
    state.lastTrucoTeam = -1;
    state.trucoRunVoters = [];
    state.trucoAnsweringTeam = null;

    state.isProcessing = !state.maoDe11Answered;

    // Rotação do primeiro jogador — usa número real de jogadores (2 ou 4)
    state.starterIndex = (state.starterIndex + 1) % numPlayers;
    state.turnIndex    = state.starterIndex;
    state.turn         = state.players[state.turnIndex].id;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
    startGame: (players, options = {}) => {
        const { variant = 'paulista', gameMode = '2v2' } = options;
        let state = {
            players,
            score: [0, 0],
            starterIndex: -1,
            variant,
            gameMode
        };
        startHand(state);
        return state;
    },
    getCardPower,
    evaluateTrick,
    checkHandWinner,
    startHand
};