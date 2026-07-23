// Disordered Order — an emoji Mastermind / permutation puzzle.
// A hidden order of distinct emojis is shuffled into a "blind box". Players know
// WHICH emojis are in play (the palette) but not the order. Each guess is a full
// arrangement; the only feedback is how many sit in the correct position.
//
// Modes: "race" (shipped) — everyone shares one secret, each plays their own
// board, first to crack it wins. The getSecretFor() seam keeps the guess math
// mode-agnostic so co-op (shared board) and solo (per-player secret) can slot in
// later without touching the scoring.

// A pool of visually distinct, easy-to-tell-apart emojis.
const POOL = [
  "🐙", "🦊", "🐸", "🐵", "🦄", "🐶", "🐼", "🦁",
  "🐯", "🦋", "🐝", "🐢", "🚀", "🎸", "🍕", "🌮",
  "🍩", "🎲", "🎈", "🔮", "🌵", "🍉", "🪩", "🎁",
  "⚡", "🌈", "👻", "🍄",
];

const MIN_N = 4;
const MAX_N = 8;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickSet(n) {
  return shuffle(POOL).slice(0, n);
}

function clampN(n) {
  n = parseInt(n, 10);
  if (!Number.isFinite(n)) return 5;
  return Math.max(MIN_N, Math.min(MAX_N, n));
}

// Mode seam: which secret applies to a given player. Race shares one.
function getSecretFor(room /*, socketId */) {
  return room.private.secret;
}

function ensurePlayer(room, socketId) {
  if (!room.game.players[socketId]) {
    room.game.players[socketId] = { attempts: 0, solved: false, solvedAt: null };
  }
  return room.game.players[socketId];
}

function isPermutationOf(order, palette) {
  if (!Array.isArray(order) || order.length !== palette.length) return false;
  const remaining = new Map();
  for (const e of palette) remaining.set(e, (remaining.get(e) || 0) + 1);
  for (const e of order) {
    const count = remaining.get(e);
    if (!count) return false;
    remaining.set(e, count - 1);
  }
  return true;
}

function init(room) {
  const g = room.game;
  if (!g.mode) g.mode = "race";
  if (!g.phase) g.phase = "setup";
  if (typeof g.roundId !== "number") g.roundId = 0;
  if (!g.players) g.players = {};
  if (!("n" in g)) g.n = 5;
  if (!g.palette) g.palette = [];
  if (!("answer" in g)) g.answer = null;
}

function startRound(room, n) {
  const g = room.game;
  g.n = clampN(n);
  const set = pickSet(g.n);
  room.private.secret = shuffle(shuffle(set));
  g.palette = [...set].sort();
  g.roundId += 1;
  g.phase = "playing";
  g.startedAt = Date.now();
  g.answer = null;
  for (const id of Object.keys(g.players)) {
    g.players[id] = { attempts: 0, solved: false, solvedAt: null };
  }
}

function register(io, socket, { room, broadcastState }) {
  const g = room.game;

  // First valid member becomes host; self-heal if the host has gone.
  if (!g.hostId || !room.members.has(g.hostId)) g.hostId = socket.id;
  ensurePlayer(room, socket.id);

  const isHost = () => g.hostId === socket.id;

  socket.on("disordered:start", ({ n } = {}) => {
    if (!isHost()) return;
    startRound(room, n);
    broadcastState();
  });

  socket.on("disordered:newRound", ({ n } = {}) => {
    if (!isHost()) return;
    startRound(room, typeof n === "number" ? n : g.n);
    broadcastState();
  });

  socket.on("disordered:guess", ({ order } = {}) => {
    if (g.phase !== "playing") return;
    const secret = getSecretFor(room, socket.id);
    if (!secret || !isPermutationOf(order, g.palette)) return;

    const p = ensurePlayer(room, socket.id);
    p.attempts += 1;

    let correct = 0;
    for (let i = 0; i < secret.length; i++) {
      if (order[i] === secret[i]) correct += 1;
    }

    const justSolved = correct === g.n && !p.solved;
    if (justSolved) {
      p.solved = true;
      p.solvedAt = Date.now();
    }

    // Private: only the guesser sees their own arrangement + result.
    socket.emit("disordered:feedback", {
      roundId: g.roundId,
      order,
      correct,
      attempts: p.attempts,
      solved: p.solved,
    });

    // Public: leaderboard (attempts / solved) updates for the room.
    broadcastState();

    if (justSolved) {
      io.to(room.code).emit("disordered:solved", { id: socket.id });
    }
  });

  socket.on("disordered:reveal", () => {
    if (!isHost()) return;
    g.phase = "revealed";
    g.answer = room.private.secret || null;
    broadcastState();
  });
}

function onLeave(room, socketId) {
  const g = room.game;
  if (g.players) delete g.players[socketId];
  if (g.hostId === socketId) {
    const next = room.members.keys().next();
    g.hostId = next.done ? null : next.value;
  }
}

module.exports = { id: "disordered", init, register, onLeave };
