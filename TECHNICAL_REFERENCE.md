# QuizMaster Pro - Technical Folder-by-Folder Reference

This document provides a exhaustive guide to the project's architecture, including a breakdown of every key folder and file, explaining their purpose and implementation details.

---

## 📂 Root Directory
- **`README.md`**: The primary project landing page for setup and basic features.
- **`DOCUMENTATION.md`**: A consolidated guide for the 1v1 Battle Arena and AI systems.
- **`SRS.txt`**: Software Requirements Specification; defines the project's goals, anti-cheat mechanisms, and core modules.
- **`deploy.sh`**: A shell script to automate deployment tasks or local environment refreshes.
- **`docker-compose.yml`**: Orchestrates multiple Docker containers (App, MongoDB, Redis) for local development and staging.
- **`docker-compose.prod.yml`**: Production-specific Docker configuration for optimized deployment on servers/Vercel/Render.
- **`nginx.conf` & `nginx.prod.conf`**: Configures the NGINX reverse proxy for load balancing, SSL termination, and serving the frontend.
- **`render.yaml`**: Deployment blueprint specifically for the Render cloud platform.
- **`package.json`**: Manages global scripts and identifies build dependencies for the workspace.

---

## 📂 Server (Backend)

The backend is built as a modular Express server with Domain-Driven Design principles.

### `server/server.js`
- **What it does**: The heart of the application. It initializes the Express app, connects to MongoDB, sets up logging, and registers global middleware.
- **Why**: Centralizing the startup logic ensures that security (Helmet, CORS) and error handling are applied consistently across all routes.

### `server/config/`
- **`db.js`**: Connects the Node.js process to MongoDB Atlas using Mongoose. Crucial for data persistence.
- **`redis.js`**: Configures Redis for caching and background job queuing (BullMQ).

### `server/models/`
*These define the "Shape" of our data using Mongoose.*
- **`User.js`**: Stores profile information, hashed passwords, and competitive rank data.
- **`Quiz.js`**: Core data structure for teacher-created exams, including questions, timers, and pins.
- **`Battle.js`**: Stores active and historical 1v1 match data, player HP, and temporary results.
- **`Response.js`**: Records student quiz attempts for analysis and reporting.

### `server/controllers/`
*Where the business logic lives.*
- **`authController.js`**: Handles user registration, login, and JWT token issuance.
- **`quizController.js`**: Logic for generating, listing, and starting quizzes.
- **`battleAI.controller.js`**: Orchestrates 1v1 matchmaking and result summaries.

### `server/routes/`
- **`api/v1/`**: Versioned REST API endpoints for a modern, backward-compatible interface.
- **`index.js`**: The main route aggregator that directs traffic to specific domains (auth, student, faculty).

### `server/socket/`
*Handles bi-directional, 0.1s real-time events.*
- **`battleHandler.js`**: Manages the life cycle of a 1v1 battle (Matchmaking -> Combat -> Conclusion). Uses an asynchronous "Racing Mode" logic.
- **`quizHandler.js`**: Broadcasts questions to students and tracks live leaderboards.

### `server/services/`
- **`battleAI.service.js`**: High-level integration with the Google Gemini API. Contains the logic for multi-model failover and precise prompt engineering for technical questions.

### `server/middleware/`
- **`auth.js`**: Protects secure routes by verifying JWT tokens and user roles.
- **`errorHandler.js`**: Centralized catch-all for errors to prevent the server from exposing sensitive stack traces to users.
- **`validate.js`**: Generic middleware that uses Joi schemas to "sanitize" incoming user data before it reaches the controllers.

---

## 📂 Client (Frontend)

The frontend is a single-page React app (SPA) optimized for performance and mobile responsiveness.

### `client/src/App.jsx`
- **What it does**: Defines the main routing table and wraps the app in global Providers (Auth, Socket).
- **Why**: Consolidates navigation logic and ensures that session data is available to every page.

### `client/src/context/`
- **`AuthContext.jsx`**: Global state for the current user's login status.
- **`SocketContext.jsx`**: Maintains a single persistent WebSocket connection across the entire application to prevent multiple reconnect overheads.

### `client/src/pages/`
- **`student/BattleArena.jsx`**: The core component for 1v1 matches. Features a real-time reactive UI for questions and "damage" effects.
- **`quiz/PlayQuiz.jsx`**: The main exam interface with anti-cheat (fullscreen lock/tab-switch detection).
- **`faculty/CreateQuiz.jsx`**: An intuitive builder for teachers, including the AI "Quick Generate" trigger.

### `client/src/services/`
- **`api.js`**: A centralized Axios instance with pre-configured headers (Auth tokens) for all backend communication.

---

## 📂 Maintenance Scripts (`server/scripts/`)
- **`add_indexes.js`**: Optimizes MongoDB performance by creating compound indexes for leaderboard queries.
- **`createDemoUsers.js`**: Populates the database with test data for staging.
- **`testGemini.js`**: A standalone tool to verify the health of the AI connections without running the full game server.

---

*This reference was generated to ensure clear onboarding and long-term project maintenance.*
