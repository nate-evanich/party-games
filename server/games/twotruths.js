// Three Truths & a Lie.
//
// Everyone submits 4 statements (3 truths + 1 lie; server shuffles them so the
// lie's position is random) and marks the lie. Then one player at a time is
// "featured": everyone
// else votes which statement is the lie. Correct guessers score; the featured
// player scores for every guesser they fool.
//
// Identity is name-keyed (refresh-proof) like Beopardy. Lie indices, other
// players' statements, and in-flight votes live in room.private and never
// appear in public state until the reveal.

function nameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function keyOf(room, socketId) {
  const m = room.members.get(socketId);
  return m ? nameKey(m.name) : null;
}

function presentKeys(room) {
  return new Set([...room.members.values()].map((m) => nameKey(m.name)));
}

function ensurePlayer(room, name) {
  const key = nameKey(name);
  if (!key) return null;
  if (!room.game.players[key]) room.game.players[key] = { name: String(name).trim(), score: 0 };
  return key;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function init(room) {
  const g = room.game;
  if (!g.phase) g.phase = "collect";
  if (!g.players) g.players = {};
  if (!g.submitted) g.submitted = [];
  if (!room.private.statements) room.private.statements = {};
  if (!room.private.lies) room.private.lies = {};
}

function startRound(room, idx) {
  const g = room.game;
  g.roundIdx = idx;
  g.featuredKey = g.order[idx];
  g.statements = room.private.statements[g.featuredKey];
  g.voted = [];
  g.reveal = null;
  room.private.votes = {};
  g.phase = "guess";
}

function doReveal(room) {
  const g = room.game;
  const lieIndex = room.private.lies[g.featuredKey];
  const choices = { ...room.private.votes };
  const counts = [0, 0, 0, 0];
  let fooled = 0;
  for (const [k, c] of Object.entries(choices)) {
    counts[c] += 1;
    const p = g.players[k];
    if (!p) continue;
    if (c === lieIndex) p.score += 100;
    else fooled += 1;
  }
  const featured = g.players[g.featuredKey];
  if (featured) featured.score += 50 * fooled;
  g.reveal = { lieIndex, choices, counts, fooled };
  g.phase = "reveal";
}

function maybeBegin(room) {
  const g = room.game;
  if (g.phase !== "collect") return;
  const present = [...presentKeys(room)];
  if (present.length < 2 || g.submitted.length < 2) return;
  if (!present.every((k) => g.submitted.includes(k))) return;
  g.order = shuffle(g.submitted);
  startRound(room, 0);
}

function maybeRevealAllVoted(room) {
  const g = room.game;
  if (g.phase !== "guess") return;
  const eligible = [...presentKeys(room)].filter((k) => k !== g.featuredKey);
  if (eligible.length > 0 && eligible.every((k) => g.voted.includes(k))) {
    doReveal(room);
  }
}

function register(io, socket, { room, broadcastState }) {
  const g = room.game;

  if (!g.hostId || !room.members.has(g.hostId)) g.hostId = socket.id;
  const myName = room.members.get(socket.id)?.name;
  if (myName) ensurePlayer(room, myName);

  const myKey = () => keyOf(room, socket.id);
  const isHost = () => socket.id === g.hostId;

  socket.on("tt:submit", ({ statements, lieIndex } = {}) => {
    if (g.phase !== "collect") return;
    const key = myKey();
    if (!key || g.submitted.includes(key)) return;
    if (!Array.isArray(statements) || statements.length !== 4) return;
    const clean = statements.map((s) => String(s || "").trim().slice(0, 140));
    if (clean.some((s) => !s)) return;
    const li = Number(lieIndex);
    if (![0, 1, 2, 3].includes(li)) return;
    // Shuffle so the lie's position can't be inferred from input order.
    const perm = shuffle([0, 1, 2, 3]);
    room.private.statements[key] = perm.map((i) => clean[i]);
    room.private.lies[key] = perm.indexOf(li);
    ensurePlayer(room, myName);
    g.submitted.push(key);
    maybeBegin(room);
    broadcastState();
  });

  socket.on("tt:begin", () => {
    if (!isHost() || g.phase !== "collect") return;
    if (g.submitted.length < 1 || room.members.size < 2) return;
    g.order = shuffle(g.submitted);
    startRound(room, 0);
    broadcastState();
  });

  socket.on("tt:vote", ({ choice } = {}) => {
    if (g.phase !== "guess") return;
    const key = myKey();
    if (!key || key === g.featuredKey || g.voted.includes(key)) return;
    const c = Number(choice);
    if (![0, 1, 2, 3].includes(c)) return;
    ensurePlayer(room, myName);
    room.private.votes[key] = c;
    g.voted.push(key);
    maybeRevealAllVoted(room);
    broadcastState();
  });

  socket.on("tt:force", () => {
    if (!isHost() || g.phase !== "guess") return;
    doReveal(room);
    broadcastState();
  });

  socket.on("tt:next", () => {
    if (!isHost() || g.phase !== "reveal") return;
    if (g.roundIdx + 1 < g.order.length) startRound(room, g.roundIdx + 1);
    else g.phase = "gameover";
    broadcastState();
  });

  socket.on("tt:newGame", () => {
    if (!isHost()) return;
    g.phase = "collect";
    g.players = {};
    g.submitted = [];
    g.order = null;
    g.roundIdx = 0;
    g.featuredKey = null;
    g.statements = null;
    g.voted = [];
    g.reveal = null;
    room.private.statements = {};
    room.private.lies = {};
    room.private.votes = {};
    for (const m of room.members.values()) ensurePlayer(room, m.name);
    broadcastState();
  });
}

function onLeave(room, socketId) {
  const g = room.game;
  if (g.hostId === socketId) {
    const next = room.members.keys().next();
    g.hostId = next.done ? null : next.value;
  }
  const present = presentKeys(room);
  if (g.phase === "guess") {
    if (g.featuredKey && !present.has(g.featuredKey)) {
      doReveal(room); // featured player vanished: reveal with votes so far
    } else {
      maybeRevealAllVoted(room); // a leaver may have been the last holdout
    }
  } else if (g.phase === "collect") {
    maybeBegin(room);
  }
}

module.exports = { id: "two-truths", init, register, onLeave };
