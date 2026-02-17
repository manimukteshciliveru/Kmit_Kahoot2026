require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const connectDB = require('./config/db');
const socketHandler = require('./socket/socketHandler');
const { initScheduler } = require('./services/schedulerService');

// Route imports
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const responseRoutes = require('./routes/response');
const aiRoutes = require('./routes/ai');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

// --- 1. Environment Variables Check ---
const requiredEnv = ['MONGODB_URI', 'JWT_SECRET'];
requiredEnv.forEach((key) => {
    if (!process.env[key]) {
        console.error(`❌ CRITICAL ERROR: Missing ${key} environment variable.`);
        process.exit(1);
    }
});

// Initialize express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.io with CORS and Redis Adapter (if configured)
const { createAdapter } = require('@socket.io/redis-adapter');
const { createRedisClient, initRedis } = require('./config/redis');

// --- 2. CORS Configuration (Strict Production Setup) ---
const corsOptions = {
    origin: [
        "https://kmit-kahoot.vercel.app",
        "http://localhost:5173" // Keep local dev working
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"]
};

// Apply CORS to Express
app.use(cors(corsOptions));
// Handle Preflight Requests explicitly
app.options('*', cors(corsOptions));

// --- 3. Socket.io Configuration ---
const ioConfig = {
    cors: corsOptions,
    pingTimeout: 60000,
    pingInterval: 25000
};

const io = new Server(server, ioConfig);

// Configure Redis Adapter for Multi-Node Scaling
const pubClient = createRedisClient();
const subClient = createRedisClient();

if (pubClient && subClient) {
    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis Adapter configured for horizontal scaling.');
    initRedis();
} else {
    console.log('ℹ️ Running in Single-Node mode (Redis not configured). Horizontal scaling disabled.');
}

// Make io accessible to routes
app.set('io', io);

// Connect to MongoDB
connectDB();

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Rate limiting
const { limiter: defaultLimiter, authLimiter } = require('./middleware/rateLimiter');

// Use the distributed rate limiter
app.use('/api/', defaultLimiter);
app.use('/api/auth/login', authLimiter);

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/responses', responseRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'QuizMaster API is running',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// --- 4. Global Error Handler ---
app.use((err, req, res, next) => {
    console.error('GLOBAL ERROR:', err);

    // Multer file size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
            success: false,
            message: 'File too large. Maximum size is 50MB.'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// Initialize Socket.io handlers
socketHandler(io);

// Initialize Quiz Scheduler
initScheduler(io);

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// --- 5. Production Safety: Crash Handlers ---
process.on('unhandledRejection', (err) => {
    console.error('❌ UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    process.exit(1);
});

module.exports = { app, server, io };
