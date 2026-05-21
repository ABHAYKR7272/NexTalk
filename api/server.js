require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const path         = require('path');
const fs           = require('fs');
const connectDB    = require('./config/database');
const socketManager= require('./socket/socketManager');

connectDB();

const app    = express();
const server = http.createServer(app);

// ── CORS (env-driven) ────────────────────────────────────
const ORIGINS = (process.env.CORS_ORIGINS || '*').split(',').map(s => s.trim());
const corsOpts = ORIGINS.includes('*')
  ? { origin: true, credentials: true }
  : { origin: ORIGINS, credentials: true };

app.use(cors(corsOpts));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const io = new Server(server, {
  cors: { origin: ORIGINS.includes('*') ? '*' : ORIGINS, methods: ['GET','POST'] },
  pingTimeout: 60000, pingInterval: 25000,
});

// ── Uploads dir ──────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir, { maxAge: '30d', etag: true }));

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth',     require('./routes/authRoutes'));
app.use('/api/users',    require('./routes/userRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));

app.get('/api/health', (_, res) => res.json({ ok: true, time: new Date(), version: '2.0.0' }));
app.get('/',           (_, res) => res.json({ name: 'NexTalk API', status: 'running' }));

app.use((_, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, _next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message });
});

socketManager(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀  NexTalk API running on :${PORT}`);
  console.log(`🌐  CORS origins: ${ORIGINS.join(', ')}`);
  console.log(`📡  WebSocket ready\n`);
});
