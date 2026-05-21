require('dotenv').config();
const express       = require('express');
const http          = require('http');
const { Server }    = require('socket.io');
const cors          = require('cors');
const path          = require('path');
const fs            = require('fs');

const connectDB     = require('./config/database');
const socketManager = require('./socket/socketManager');

connectDB();

const app = express();
const server = http.createServer(app);

// ─────────────────────────────────────────────
// CORS CONFIG
// ─────────────────────────────────────────────

const allowedOrigins = [
  'https://nex-talk-ebon.vercel.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

const corsOptions = {
  origin: function (origin, callback) {

    // allow requests with no origin
    // (mobile apps, postman, curl)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'));
    }
  },

  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
};

// Express CORS
app.use(cors(corsOptions));

// Handle preflight
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({
  extended: true,
  limit: '10mb'
}));

// ─────────────────────────────────────────────
// SOCKET.IO
// ─────────────────────────────────────────────

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },

  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─────────────────────────────────────────────
// UPLOADS
// ─────────────────────────────────────────────

const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(
  '/uploads',
  express.static(uploadDir, {
    maxAge: '30d',
    etag: true,
  })
);

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));

app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    time: new Date(),
    version: '2.0.0',
  });
});

app.get('/', (_, res) => {
  res.json({
    name: 'NexTalk API',
    status: 'running',
  });
});

// ─────────────────────────────────────────────
// ERROR HANDLING
// ─────────────────────────────────────────────

app.use((_, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
  });
});

app.use((err, req, res, _next) => {
  console.error('❌ Error:', err.message);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// ─────────────────────────────────────────────
// SOCKET MANAGER
// ─────────────────────────────────────────────

socketManager(io);

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 NexTalk API running on port ${PORT}`);
  console.log(`🌐 Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log(`📡 WebSocket server ready`);
});
