# 🎲 Party Games

Quick, real-time multiplayer mini-games. Pick a game, share the room code, and
play together in seconds — all from one tiny server.

This is an **open-source starter template**. Clone it, run one command, and you
have a working real-time multiplayer app you can learn from, remix, and ship.

Built with **Next.js (App Router) + TypeScript** and a custom **Socket.IO**
server. Everything runs in **a single Node process** with **no database** — game
rooms live in memory — so there's nothing to set up.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Start a game, then open the room link in a second
browser tab (or on your phone, on the same network) to play along.

> Requires Node 20+. That's the only prerequisite — no database, no Docker, no
> external services.

## Games included

| Game | What it is |
| --- | --- |
| 🎡 Random Picker | Spin the wheel to pick who goes next. |
| 🔀 Disordered Order | Crack the hidden emoji order, Mastermind-style. |
| 🧠 Beopardy | Buzz-in trivia with Daily Doubles and a final round. |
| 🕵️ Three Truths & a Lie | Submit four statements, the room guesses the lie. |
| 🎤 Punchline | One prompt, your funniest answer, the room votes. |
| 🟦 Buzzword Bingo | _(stub — wire it up as your first contribution)_ |

## How it works

```
server.js                 # Next.js + Socket.IO — the single process that runs everything
server/
  rooms.js                # in-memory room store (ephemeral, single-instance)
  games/
    index.js              # server-side game registry
    <game>.js             # authoritative game logic — the server decides, clients sync
src/
  games/
    catalog.json          # game metadata shared by client + server
    catalog.ts            # typed accessor for the catalog
    registry.tsx          # client-side gameId -> React component map
    <game>/<Game>.tsx     # the game UI
  lib/socket.ts           # shared socket.io-client connection
  lib/code.ts             # room code generation
  app/
    page.tsx              # home: game grid + join-by-code
    room/[code]/page.tsx  # room shell: name gate, player list, mounts the game
```

The server is **authoritative**: it owns each room's state, decides outcomes
(who wins a spin, whether an answer is right), and broadcasts a public snapshot
to every client. Secret state (answers, who wrote what) lives in `room.private`
and is never sent to clients until it should be revealed.

## Add your own game

1. Add an entry to `src/games/catalog.json` (set `"status": "live"` when ready).
2. Create the server logic in `server/games/<id>.js` exporting
   `{ id, init(room), register(io, socket, ctx) }` and register it in
   `server/games/index.js`.
3. Build the UI component and add it to `src/games/registry.tsx`.

The room shell, player list, and link-sharing all work for free — you only write
the game.

## Deploying

Because it's a single Node process with no database, it deploys anywhere that
runs Node:

```bash
npm run build
npm run start   # honors the PORT env var (defaults to 3000)
```

A `railway.json` is included as one example (build: `npm run build`, start:
`npm run start`). Any Node host works — just keep it to a **single instance**,
since rooms live in memory.

## License

MIT — see [LICENSE](./LICENSE). Use it, fork it, ship it.
