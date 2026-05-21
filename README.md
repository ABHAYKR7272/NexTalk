# NexTalk v2 — Cyberpunk Edition

Realtime chat + voice/video calls. Express + Socket.io + MongoDB backend, vanilla JS frontend.

## What's new
- 🎨 Cyberpunk RGB neon UI overhaul (animated wordmarks, glow, grid bg)
- ↩ Instagram-style **Unsend** (long-press / right-click own message)
- 📷 **Camera switch** (front/back) in video calls
- ✋ **Draggable** local-video PiP — drag anywhere, tap to swap cams
- 🎛 Call controls no longer overlap video (gradient backdrop + safe-area)
- 🐛 Fix: choosing photo/video no longer auto-goes back on mobile
- 🖼 Profile picture upload (`/api/auth/upload-avatar`)
- ✨ Redesigned welcome page with feature cards
- 📱 Better responsive on small screens
- ⚙ Configurable backend URL at runtime (`web/config.js`)

## Project layout
```
nextalk-v2/
├── api/      ← Express backend  (deploy to Render / Railway / Fly)
└── web/      ← Static frontend  (deploy to Vercel / Netlify)
```

## 1) Deploy the API (Render — free)
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → pick the repo. It reads `api/render.yaml`.
3. Set env vars when prompted:
   - `MONGO_URI` — your MongoDB Atlas connection string
   - `JWT_SECRET` — any long random string
   - `CORS_ORIGINS` — your Vercel URL (e.g. `https://nextalk.vercel.app`) or `*`
4. After deploy, copy the URL (e.g. `https://nextalk-api.onrender.com`).

## 2) Deploy the frontend (Vercel)
1. Vercel → **New Project** → import repo → set **Root Directory** to `web`.
2. Framework preset: **Other**. Build command: empty. Output dir: `.`.
3. Deploy.
4. Open the deployed site and **edit `web/config.js`** to point at your API:
   ```js
   window.__NEXTALK_CONFIG__ = { API_URL: "https://nextalk-api.onrender.com" };
   ```
   Commit & push — Vercel re-deploys in seconds. (config.js has `no-cache` headers so changes show immediately.)

## Local dev
```bash
cd api && npm install && cp .env.example .env  # fill MONGO_URI + JWT_SECRET
npm run dev
# in another terminal
cd web && npx serve -p 3000
```

## MongoDB Atlas (5 min)
1. https://cloud.mongodb.com → free M0 cluster
2. Database Access → add user
3. Network Access → allow `0.0.0.0/0`
4. Connect → drivers → copy the `mongodb+srv://...` URI
5. Paste into Render env var `MONGO_URI`

## Notes
- Calls use WebRTC peer-to-peer with STUN servers only. Behind strict NAT a TURN server may be needed.
- Don't deploy the backend to Vercel — serverless functions can't keep Socket.io WebSocket connections alive.
