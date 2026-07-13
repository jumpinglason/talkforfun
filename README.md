# Frequency — anonymous stranger chat & audio calls

No login. Nickname → optional interests → Tune In → matched by shared interest,
or a random stranger if the interest box is left blank. Text chat + optional
one-on-one audio call (no video).

## How matching works
- Interests are split on commas, lowercased, and compared as tags.
- If you share at least one tag with someone waiting, you're matched with them first.
- If nobody shares a tag (or you left interests blank), you're paired with the
  longest-waiting stranger instead — so nobody waits forever.

## Project structure
```
server/   → Node.js + Express + Socket.io (matching, chat relay, call signaling)
public/   → Static frontend (plain HTML/CSS/JS) — this is what goes on InfinityFree/Vercel
```

## Why two folders, and where each one goes

**The `server/` folder needs a host that keeps a live connection open.**
InfinityFree only serves static files/PHP, and Vercel's functions are
serverless (they spin down between requests) — neither can run a real-time
matching server. Use one of these instead (all have free tiers):
- [Render](https://render.com) — easiest, "New Web Service" → point at this repo → done
- [Railway](https://railway.app)
- [Fly.io](https://fly.io)
- [Glitch](https://glitch.com)

**The `public/` folder is plain static HTML/CSS/JS** — this part genuinely
can go on InfinityFree or Vercel, or anywhere else that serves static files.

### Step 1 — Deploy the server
1. Push this project to GitHub.
2. On Render (example): New → Web Service → select the repo → set root
   directory to `server` → build command `npm install` → start command `npm start`.
3. Once deployed you'll get a URL like `https://frequency-server.onrender.com`.
4. (Optional but recommended) Set an environment variable `ALLOWED_ORIGIN` to
   your frontend's URL, so only your site can talk to the server.

### Step 2 — Point the frontend at the server
Open `public/app.js` and set:
```js
const SERVER_URL = "https://frequency-server.onrender.com"; // your Render URL
```

### Step 3 — Deploy the frontend
- **InfinityFree:** upload everything in `public/` via their file manager/FTP.
- **Vercel:** `vercel deploy` from inside the `public/` folder (or connect the
  repo and set the root directory to `public`).

That's it — no database, no build step for the frontend.

## Notes & limitations
- **Calls use a public STUN server only** (no TURN server). This works for most
  home networks, but calls can fail to connect for people behind strict
  corporate/school firewalls. If that matters to you, look into a free-tier
  TURN provider like Metered or Twilio and add it to `ICE_SERVERS` in `app.js`.
- **State is in-memory** — the waiting pool and active pairs live in the
  server's RAM. That's fine for one server instance; if you ever scale to
  multiple server instances you'd need a shared store (e.g. Redis) to match
  people across them.
- **No message history is stored anywhere** — nothing is saved once a chat ends.

## A few things worth adding before you share this publicly
Anonymous, unmoderated chat sites attract abuse if there's no way to get away
from someone or flag bad behavior. Worth adding before a real launch:
- A **"New Stranger"/leave** button is already there — good, keep it prominent.
- Consider a simple **report/block** action that at least disconnects and
  skips that person for future matches.
- Consider a lightweight **profanity/spam filter** on the `chat-message` handler
  in `server.js`.
- Since there's no age gate, consider adding one, or at least a visible content
  policy — this is the biggest reason the original Omegle shut down.
