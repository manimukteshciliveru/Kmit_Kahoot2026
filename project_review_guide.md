# 📚 Smart Quiz Arena — Complete Project Study Guide
### Your Project Review is on **28-03-2026** (in ~2 days). Read this fully!

---

## 🟢 PART 1: What is This Project? (The Big Picture)

Your project is called **"Smart Quiz Arena"** (also referred to as KMIT Kahoot). It is a **real-time online examination and quiz platform** built specifically for college environments like KMIT.

Think of it as a **supercharged version of Kahoot** — but built from scratch and packed with features:
- Teachers can **create quizzes** (manually or using **AI**)
- Students can **join and play quizzes live** in real-time
- There's a **1v1 Battle Arena** where students compete head-to-head
- Advanced **anti-cheat** features (fullscreen lock, tab-switch detection)
- **Flashcards** for self-study
- A **leaderboard and ranking system** (Bronze → Silver → Gold → Platinum → Diamond → Heroic → Grandmaster)
- **Detailed analytics** with charts for both students and teachers

---

## 🟢 PART 2: The Three Types of Users (Roles)

This is the MOST important thing to explain in a review.

| Role | Who are they? | What can they do? |
|---|---|---|
| **Admin** | System administrator (like HOD/Lab In-charge) | Manages all users, views all analytics, bulk uploads students, system settings |
| **Faculty** | Teacher / Lecturer | Creates quizzes (manual + AI), hosts live quizzes, views results & analytics |
| **Student** | Student | Joins quizzes using a code, plays 1v1 battles, uses flashcards, views their own history |

> **Key point for review:** When you log in, the system automatically sends you to the correct dashboard based on your role. This is handled by the [DashboardRoute](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/client/src/App.jsx#71-85) component in [App.jsx](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/client/src/App.jsx).

---

## 🟢 PART 3: The Technology Stack (What Was Used to Build It)

This is called the **"Tech Stack"**. Know this by heart.

```
Frontend (What the user SEES):
  → React.js (Vite) — JavaScript framework for building the UI
  → React Router — For navigating between pages
  → Socket.io Client — For real-time live communication
  → CSS (Vanilla) — For styling and design

Backend (The SERVER — the brain behind everything):
  → Node.js — JavaScript runtime environment
  → Express.js — Web framework (handles all API requests)
  → Socket.io — For real-time two-way communication
  → JWT (JSON Web Token) — For login/authentication security
  → bcrypt — For encrypting/hashing passwords

Database (Where all DATA is STORED):
  → MongoDB Atlas — Cloud database (NoSQL)
  → Mongoose — The library that connects Node.js to MongoDB

AI Integration:
  → Google Gemini AI — For auto-generating quiz questions
  → OpenAI / Mistral AI — Alternative AI providers

Security:
  → Helmet.js — HTTP security headers
  → express-mongo-sanitize — Prevents NoSQL injections
  → xss-clean — Prevents cross-site scripting attacks
  → Rate Limiting — Prevents spam/brute-force attacks

Deployment:
  → Render.com — Backend hosting
  → Vercel — Frontend hosting
  → Docker — For containerized deployment
```

---

## 🟢 PART 4: The Architecture (How It All Fits Together)

```
Browser (Student/Faculty/Admin)
         │
         ▼
  [React Frontend - Vite]
  kmit-kahoot2026.vercel.app
         │
         │ HTTP (API calls) + WebSocket (real-time)
         ▼
  [Node.js + Express Backend]
  kmit-kahoot2026.onrender.com
         │
         ├── REST API (/api/v1/...)
         │       ├── Auth Routes
         │       ├── Quiz Routes
         │       ├── User Routes
         │       ├── AI Routes
         │       └── Admin Routes
         │
         ├── Socket.io (Real-time Events)
         │       ├── socketHandler.js (Quiz events)
         │       └── battleHandler.js (1v1 Battle events)
         │
         └── MongoDB Atlas (Database)
                 ├── Users Collection
                 ├── Quizzes Collection
                 ├── Responses Collection
                 ├── Battles Collection
                 └── Flashcards Collection
```

**Simple explanation:** The browser talks to the server using two methods:
1. **HTTP (REST API)** — For one-time requests like "login", "create quiz", "get my results"
2. **WebSocket (Socket.io)** — For live/real-time events like "student joined", "next question", "score update"

---

## 🟢 PART 5: The Database — What Data is Stored

Your database has **7 collections (tables)**:

### 1️⃣ User Model ([User.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/User.js))
Stores all user information:
- `name`, `email`, `password` (encrypted), `role` (student/faculty/admin)
- Student-specific: `rollNumber`, `department`, `year`, `section`
- Faculty-specific: `employeeId`, `designation`, `subjects`
- `stats`: quizzesAttended, averageScore, totalPoints
- **Ranking**: `rank.points`, `rank.tier` (Bronze/Silver/Gold...), `rank.winStreak`

### 2️⃣ Quiz Model ([Quiz.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/Quiz.js))
Stores all quiz information:
- `title`, `subject`, `description`
- `code` — A unique 6-character code students use to join (auto-generated)
- `status` — Can be: `draft` → `scheduled` → `waiting` → `active` → `finished`
- `questions` — Array of questions, each with: text, type (mcq/fill-blank/qa), options, correctAnswer, points, timeLimit
- `settings` — shuffleQuestions, shuffleOptions, showInstantFeedback, anti-cheat settings
- `accessControl` — Can restrict quiz to specific branches/sections

### 3️⃣ Response Model ([Response.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/Response.js))
Stores a student's answers for a quiz attempt.

### 4️⃣ Battle Model ([Battle.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/Battle.js))
Stores 1v1 battle data (both players, their answers, final scores, winner).

### 5️⃣ Flashcard Model ([Flashcard.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/Flashcard.js))
Stores AI-generated flashcards for student self-study.

### 6️⃣ QuizResult Model ([QuizResult.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/QuizResult.js))
Stores the final calculated results/scores.

### 7️⃣ AILog Model ([AILog.js](file:///c:/Users/manim/OneDrive/Desktop/Kahoot%21/server/models/AILog.js))
Logs all AI API calls (for tracking and debugging).

---

## 🟢 PART 6: Key Features — Explained Simply

### 🔐 Authentication (Login System)
- Uses **JWT tokens** (access token + refresh token)
- Passwords are hashed with **bcrypt** (never stored in plain text)
- When you log in → server gives you a token → you send that token with every API request to prove who you are
- **Refresh tokens** allow you to stay logged in without re-entering password

### 🎯 Creating a Quiz (Faculty)
1. Faculty goes to `Create Quiz` page
2. Can add questions **manually** OR click **"Generate with AI"**
3. AI (Google Gemini) receives the topic and generates MCQ questions automatically
4. Faculty sets: time per question, difficulty, anti-cheat settings, who can join
5. Quiz is saved to MongoDB as `status: "draft"`

### 🟢 Hosting a Live Quiz (Faculty)
1. Faculty opens the quiz and clicks **"Host Live"**
2. A **WebSocket room** is created on the server for this quiz
3. Students join using the unique **quiz code**
4. Faculty clicks "Start" → server broadcasts `question_start` event to ALL students simultaneously
5. Students answer → server collects answers → broadcasts leaderboard
6. After all questions → quiz ends, results saved

### 📱 Student Joining a Quiz
1. Student enters the **6-character quiz code** on the Join Quiz page
2. Server verifies the code and adds student to the quiz room
3. Student sees questions appear in real-time (pushed by the server, same time for everyone)
4. Answers are auto-saved every second (using **IndexedDB/localStorage**) — so even if Wi-Fi cuts, answers are not lost

### ⚔️ 1v1 Battle Arena
- Students can challenge each other to a head-to-head quiz battle
- Uses **ELO ranking system** (same as chess) to calculate points won/lost
- Questions are AI-generated on selected topics
- Both students answer independently (async racing format)
- Winner gets ELO points, loser loses points
- Ranks go: Bronze I → Bronze II → Bronze III → Silver I → ... → Grandmaster

### 🧠 AI Flashcards
- Students can type any topic
- AI generates a set of question-answer flashcards
- Stored in MongoDB, accessible anytime for revision

### 🛡️ Anti-Cheat System
- **Fullscreen Lock**: If a student exits fullscreen → warning is shown
- **Tab Switch Detection**: If a student switches to another tab → it's logged. Too many switches = quiz terminated
- **No Copy/Paste**: Right-click and keyboard shortcuts disabled during quiz
- These are enforced in the `PlayQuiz.jsx` component

### 📊 Analytics
- **Faculty**: Sees how each student performed, which questions were hardest, score distribution
- **Admin**: Sees platform-wide stats — total users, quizzes, average scores per department
- Charts are rendered using chart libraries (Recharts)

---

## 🟢 PART 7: The Folder Structure — Know Where Everything Is

```
Kahoot!/
├── server/              ← The BACKEND (Node.js + Express)
│   ├── server.js        ← ENTRY POINT: Starts the server
│   ├── config/          ← Database connection (db.js)
│   ├── models/          ← Database schemas (User, Quiz, Response...)
│   ├── controllers/     ← Business logic for each feature
│   │   ├── authController.js      ← Login, Register, Logout
│   │   ├── quizController.js      ← Create, Edit, Host quiz
│   │   ├── responseController.js  ← Submit/save answers
│   │   ├── aiController.js        ← AI question generation
│   │   ├── adminController.js     ← Admin actions
│   │   └── userController.js      ← User profile, ranking
│   ├── routes/          ← URL paths (maps URL → controller)
│   ├── middleware/       ← Auth check, rate limiting, error handling
│   ├── services/         ← AI generator, email, scheduler
│   ├── socket/           ← Real-time Socket.io handlers
│   │   ├── socketHandler.js  ← Quiz room events
│   │   └── battleHandler.js  ← 1v1 Battle events
│   └── utils/            ← Logger, helpers
│
└── client/              ← The FRONTEND (React + Vite)
    └── src/
        ├── App.jsx       ← All page routes defined here
        ├── context/      ← Shared state (Auth, Socket, Theme)
        ├── pages/
        │   ├── auth/          ← Login page
        │   ├── admin/         ← Admin Dashboard, UserManagement, Analytics
        │   ├── faculty/       ← CreateQuiz, HostQuiz, QuizResults, MyQuizzes
        │   ├── student/       ← StudentDashboard, JoinQuiz, BattleArena, Flashcards
        │   ├── quiz/          ← PlayQuiz (the actual quiz-taking screen)
        │   └── common/        ← Profile, shared pages
        └── services/     ← API call functions (talk to backend)
```

---

## 🟢 PART 8: How a Request Works (Request Lifecycle)

**Example: A student submits an answer**

```
1. Student clicks an answer in PlayQuiz.jsx (React)
   ↓
2. The answer is sent via Socket.io emit('submit_answer', data)
   ↓
3. socketHandler.js on the server receives it
   ↓
4. It validates the answer, calculates score, saves to MongoDB
   ↓
5. It emits back to ALL students in the room: 'leaderboard_update'
   ↓
6. Every student's screen updates simultaneously with new rankings
```

---

## 🟢 PART 9: Security Features (Say This — It Impresses Reviewers!)

| Feature | What It Does |
|---|---|
| **JWT Authentication** | Every API request is verified — only logged-in users can access data |
| **Password Hashing (bcrypt)** | Passwords are never stored as plain text |
| **Rate Limiting** | Prevents someone from trying 1000 passwords per second (brute force) |
| **Helmet.js** | Sets secure HTTP headers to prevent browser-level attacks |
| **NoSQL Injection Prevention** | Sanitizes inputs so hackers can't manipulate database queries |
| **XSS Prevention** | Strips harmful HTML from user inputs |
| **CORS Policy** | Only whitelisted domains can talk to the backend |
| **Role-based Access Control** | Students can't access faculty routes, and vice versa |

---

## 🟢 PART 10: Common Interview Questions & Answers

**Q: What is your project about?**
> My project is "Smart Quiz Arena" — a real-time online examination platform for colleges. It allows faculty to create AI-powered quizzes and host them live, while students join using a unique code, answer questions in real-time, and compete on a live leaderboard. It also includes a 1v1 Battle Arena with an ELO ranking system, AI-generated flashcards, and advanced anti-cheat mechanisms.

**Q: What technology did you use?**
> Frontend: React.js with Vite. Backend: Node.js with Express.js. Real-time communication: Socket.io. Database: MongoDB Atlas with Mongoose. AI: Google Gemini API. Authentication: JWT tokens. Security: Helmet, bcrypt, rate limiting, XSS protection.

**Q: How does real-time work in your project?**
> We use Socket.io, which establishes a persistent WebSocket connection between the browser and server. When a faculty member advances to the next question, the server instantly emits an event to all connected students in that quiz room, so everyone sees the question at exactly the same time.

**Q: How did you handle cheating prevention?**
> We implemented fullscreen lock (quiz pauses if student exits fullscreen), tab-switch detection (warnings issued and tracked, quiz can be terminated after X switches), and disabled copy-paste on the quiz screen. All of this is implemented in the PlayQuiz component on the frontend.

**Q: What is the ranking system?**
> We use an ELO-based ranking system for 1v1 battles — the same mathematical model used in chess. When you win a battle, you gain ELO points; when you lose, you lose points. The tiers are: Bronze (I, II, III) → Silver → Gold → Platinum → Diamond → Heroic → Grandmaster, starting from 0 points.

**Q: How does AI question generation work?**
> Faculty enters a topic and difficulty level. The server calls the Google Gemini API with a structured prompt asking it to generate MCQ questions in a specific JSON format. The questions are then parsed, validated, and added to the quiz.

**Q: What is JWT?**
> JWT stands for JSON Web Token. When a user logs in with correct credentials, the server creates a digitally signed token and sends it to the browser. For every future request, the browser sends this token in the `Authorization` header. The server verifies the token's signature to confirm the user's identity without needing to check the database every time.

**Q: What is MongoDB and why did you choose it?**
> MongoDB is a NoSQL database that stores data as flexible JSON-like documents. We chose it because quiz questions have varying structures (MCQ, fill-in-the-blank, Q&A), and MongoDB handles this variable schema easily without needing to alter a rigid table structure.

**Q: How many users can your system handle?**
> On the current free-tier Render.com server, approximately 150-200 concurrent students on the same quiz. For larger scale, we would need to implement load balancing and Redis for session sharing across multiple server instances.

---

## 🟢 PART 11: 5-Minute Summary (Practice This OUT LOUD!)

> *"Our project, Smart Quiz Arena, is a real-time quiz platform for colleges. It has three types of users: Admin, Faculty, and Student. Faculty can create quizzes manually or use AI to auto-generate questions. When a quiz is hosted live, students join using a unique code and answer questions in real-time — the entire real-time system runs on Socket.io WebSockets. We also have a 1v1 Battle Arena with an ELO ranking system, AI-powered flashcards for self-study, and a robust anti-cheat system. The tech stack is React on the frontend, Node.js with Express on the backend, MongoDB as the database, and Google Gemini for AI. Security is handled with JWT authentication, password hashing, rate limiting, and XSS protection."*

---

> [!TIP]
> **Day before review checklist:**
> 1. ✅ Run the app locally and explore each role (Admin, Faculty, Student)
> 2. ✅ Practice the 5-minute summary above out loud
> 3. ✅ Be able to draw the Architecture diagram on a whiteboard
> 4. ✅ Know the 7 database models by name
> 5. ✅ Understand the difference between HTTP API calls and Socket.io events

> [!IMPORTANT]
> The most important things to **memorize** for your review:
> - The **3 user roles** and what each can do
> - The **tech stack** (React, Node, Express, MongoDB, Socket.io, JWT)
> - The **anti-cheat features** (fullscreen, tab-switch, no copy-paste)
> - The **ELO ranking system** for 1v1 battles
> - The **AI integration** (Gemini API for question generation)
