require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Global Exception Handler - MUST BE FIRST
process.on('uncaughtException', (err) => {
    console.error('❌ UNCAUGHT EXCEPTION! 💥', err);
    // Keep process alive for now to debug, or exit if critical
    // process.exit(1); 
});

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
        // Don't exit immediately, let it fail gracefully or use defaults for dev
    }
});

// Initialize express app
const app = express();
const server = http.createServer(app);

// Request Logger (Debug 404s/CORS)
app.use((req, res, next) => {
    console.log(`📡 [REQUEST] ${req.method} ${req.url} | Origin: ${req.headers.origin || 'Unknown'}`);
    next();
});

// --- 2. CORS Configuration (Dynamic for All Environments) ---
const getAllowedOrigins = () => {
    const whitelistedOrigins = [
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5000",
        "https://kmit-kahoot.vercel.app",
        "https://kahoot-render.onrender.com",
        "https://kahoot.onrender.com",
        "https://kmit-kahoot-backend.onrender.com" // Backend itself
    ];

    // Add custom origins from environment
    if (process.env.CLIENT_URL) {
        whitelistedOrigins.push(process.env.CLIENT_URL);
    }
    if (process.env.ALLOWED_ORIGINS) {
        const customOrigins = process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim());
        whitelistedOrigins.push(...customOrigins);
    }

    return whitelistedOrigins;
};

const corsOptions = {
    origin: (origin, callback) => {
        const allowedOrigins = getAllowedOrigins();

        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
            console.log('✅ [CORS] No origin header (possible mobile app or curl)');
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            // console.log(`✅ [CORS] Allowed origin: ${origin}`);
            callback(null, true);
        } else {
            console.warn(`⚠️ [CORS] Rejected origin: ${origin}. Allowlist: ${JSON.stringify(allowedOrigins)}`);
            // Still allow it for now to debug - CHANGE THIS IN PROD AFTER DEBUGGING
            // callback(new Error('Not allowed by CORS'));
            callback(null, true);
        }
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
    maxAge: 86400
};

// Apply CORS to Express
app.use(cors(corsOptions));
// Use RegExp for wildcard to avoid path-to-regexp parsing errors
app.options(/.*/, cors(corsOptions)); // Handle Preflight explicitly

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Body parsing (MUST BE BEFORE ROUTES)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Socket.io (PURE WEBSOCKETS - NO REDIS)
const ioConfig = {
    cors: {
        origin: "*", // Allow all origins for socket.io temporarily to fix connection issues
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000
};

const io = new Server(server, ioConfig);

// REDIS COMPLETELY DISABLED
console.log('ℹ️ Redis DISABLED. Running in Single-Node mode.');

// Make io accessible to routes
app.set('io', io);

// Connect to MongoDB
connectDB();

// Rate limiting
try {
    const { limiter: defaultLimiter, authLimiter } = require('./middleware/rateLimiter');
    // Use the distributed rate limiter
    app.use('/api/', defaultLimiter);
    app.use('/api/auth/login', authLimiter);  // This will now use MemoryStore
} catch (err) {
    console.error('⚠️ Failed to load rate limiter:', err.message);
}

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
    console.warn(`⚠️ 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.url}`
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

    // CORS Error
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'CORS Blocked'
        });
    }

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

// Initialize Socket.io handlers
try {
    socketHandler(io);
} catch (err) {
    console.error('❌ Failed to initialize Socket.io handlers:', err);
}

// Initialize Quiz Scheduler
try {
    initScheduler(io);
} catch (err) {
    console.error('❌ Failed to initialize Scheduler:', err);
}

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Test route to confirm backend works
app.get("/test", (req, res) => {
    res.json({ message: "Backend working" });
});

// --- 5. Production Safety: Crash Handlers ---
process.on('unhandledRejection', (err) => {
    console.error('⚠️ UNHANDLED REJECTION! (Logging only, not crashing)', err);
    // Do NOT exit process here. Transient Redis errors should not kill the server.
});

module.exports = { app, server, io };
