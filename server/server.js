require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Global Exception Handler - MUST BE FIRST
const logger = require('./utils/logger');
process.on('uncaughtException', (err) => {
    logger.error('❌ [CRITICAL] UNCAUGHT EXCEPTION!');
    logger.error(err.message);
    logger.error(err.stack);
});

const connectDB = require('./config/db');
const socketHandler = require('./socket/socketHandler');
const { initScheduler } = require('./services/schedulerService');
const { initQueues } = require('./services/queueService');

// Route imports
// Route imports (Legacy - to be moved to v1 index)
// const authRoutes = require('./routes/auth');
// const quizRoutes = require('./routes/quiz');
// const responseRoutes = require('./routes/response');
// const aiRoutes = require('./routes/ai');
// const userRoutes = require('./routes/user');
// const adminRoutes = require('./routes/admin');

// Versioned Routes
const v1Router = require('./routes/v1');

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
        "https://kmit-kahoot-backend.onrender.com", // Backend itself
        "https://kmit-kahoot2026.onrender.com", // Actual Render Backend URL
        "https://your-frontend.vercel.app" // Placeholder for Vercel deployment
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
    origin: true, // Reflect request origin to handle CORS for all whitelisted and dynamic origins
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
// Body parsing (MUST BE BEFORE ROUTES)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Security Upgrades (Part 1 Audit) ---
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');

// Parse cookies
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp());

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
// --- 3. Core Health & Test Routes (Priority) ---
app.get("/test", (req, res) => {
    console.log("✅ [TEST ROUTE] Hit!");
    res.json({ success: true, message: "Backend working" });
});

app.get('/api/v1/health', (req, res) => {
    console.log("✅ [HEALTH v1 ROUTE] Hit!");
    res.status(200).json({
        success: true,
        message: 'QuizMaster API v1 is running',
        version: 'v1',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ success: true, message: 'QuizMaster API is online' });
});

app.get("/", (req, res) => {
    res.json({ message: "QuizMaster API is ONLINE", status: "Ready" });
});

app.use('/api/v1', v1Router);

// Aliases for backward compatibility (Optional, logs warning)
app.use('/api', (req, res, next) => {
    if (!req.path.startsWith('/v1')) {
        logger.warn(`Deprecated API Access: ${req.method} ${req.url}. Please use /api/v1/...`);
    }
    next();
});

// For now, keep mounting legacy routes directly to /api as well to prevent client crash
// In a real migration, we'd update client first.
const authRoutes = require('./routes/auth');
const quizRoutes = require('./routes/quiz');
const responseRoutes = require('./routes/response');
const aiRoutes = require('./routes/ai');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');

app.use('/api/auth', authRoutes);
app.use('/api/quiz', quizRoutes); // Renamed from quizzes
app.use('/api/responses', responseRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// --- 4. Global Error Handlers ---

// 404 handler
app.use((req, res) => {
    console.warn(`⚠️ 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({
        success: false,
        message: `Route not found: ${req.method} ${req.url}`
    });
});

// --- 4. Global Error Handler ---
// --- 4. Global Error Handler (Centralized) ---
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

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

// Initialize Background Queues
try {
    initQueues();
} catch (err) {
    console.error('❌ Failed to initialize Background Queues:', err);
}

// Start server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// --- 5. Production Safety: Crash Handlers ---
process.on('unhandledRejection', (err) => {
    console.error('⚠️ UNHANDLED REJECTION! (Logging only, not crashing)', err);
    // Do NOT exit process here. Transient Redis errors should not kill the server.
});

module.exports = { app, server, io };
