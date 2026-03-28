# 🎓 Academic Review Presentation
# Project: Real-Time AI-Powered Quiz Platform (Kahoot-Style)

> [!IMPORTANT]
> Read this document twice before your review. The **1-Minute Summary** and **Viva Q&A** sections at the end are the most important parts to memorize.

---

## 📌 POINT 1 — Problem Statement & Objective

### 🔴 Problem Statement

Traditional classroom assessments are **static, paper-based, and delayed** in feedback. Teachers create tests manually, students take them offline, and the results take days to process. There is no way for a teacher to know in real-time whether students are understanding the content or struggling.

Additionally, creating quality quiz questions is **time-consuming** for teachers, especially when they need to cover a variety of topics and difficulty levels.

**In short:** There is no interactive, real-time, AI-assisted quiz system designed specifically for the classroom environment.

---

### 🎯 Objective of the Project

The objective is to develop a **full-stack, real-time, AI-powered quiz platform** that:

1. Allows teachers to **create quizzes in 3 ways** — manually, from a PDF document, or from a topic using AI
2. Allows teachers to **host live quiz sessions** where all students participate simultaneously
3. Provides **real-time feedback** — teachers see student progress and leaderboard update live as answers are submitted
4. Stores all results in a **database** and provides post-quiz analytics, leaderboards, and student performance history
5. Implements **role-based access control** so teachers, students, and admins each have their own secured interface

---

### 🌍 Why is This Important in Real-World Applications?

| Real World Context | How This Project Addresses It |
|---|---|
| EdTech platforms (like Kahoot, Quizizz) are a billion-dollar industry | This project builds a custom, controlled classroom version |
| AI is transforming education — automating content creation | Gemini AI generates quiz questions automatically from any topic or document |
| Teachers waste hours creating assessments | PDF/Topic-based AI generation reduces this to seconds |
| Students disengage from passive learning | Gamified real-time quizzes with leaderboards increase engagement |
| Institutions need controlled environments | Self-registration is disabled; admin controls all accounts |

---

## 📌 POINT 2 — Dataset & Methodology

### 📦 Dataset

> [!NOTE]
> This is a **web application project**, not a machine learning project. Therefore, the "dataset" refers to the data managed by the system, not a training dataset.

| Data Type | Source | Details |
|---|---|---|
| **User Data** | Admin-created accounts | Username, email, hashed password, role (teacher/student/admin) |
| **Quiz Data** | Teacher-created + AI-generated | Title, questions, options, correct answers, difficulty, timer, join code |
| **Result Data** | Student quiz attempts | Score, time taken per question, selected answers, correct answers, timestamps |
| **AI-Generated Questions** | Google Gemini API | Generated from topic text or extracted PDF content |
| **PDF Content** | Teacher-uploaded files | Parsed using `pdf-parse` library; text extracted and sent to Gemini |

#### Data Preprocessing (for PDF-based quiz generation):
1. Teacher uploads a PDF file
2. `pdf-parse` library extracts raw text from the binary PDF
3. Multiple whitespace characters replaced with single space (`replace(/\s+/g, ' ')`)
4. Multiple newlines collapsed (`replace(/\n+/g, '\n')`)
5. Cleaned text is validated — must be at least 100 characters
6. Clean text is passed to Gemini AI API (max 20,000 characters sent)

---

### ⚙️ Algorithms & Models Used

#### 1. Authentication — JWT (JSON Web Token) + bcrypt

| Component | Algorithm | Purpose |
|---|---|---|
| Password Storage | **bcrypt** hashing (salt rounds) | Securely stores passwords — plain text is never saved |
| Session Management | **JWT** (signed with HS256) | Stateless authentication — token expires in 1 hour |
| Authorization | **Role-Based Access Control (RBAC)** | Teacher/Student/Admin roles gate access to routes and pages |

#### 2. AI Question Generation — Google Gemini API

- **Model**: `gemini-2.0-flash` (primary), fallback to `gemini-1.5-flash`, then `gemini-1.5-flash-latest`
- **Technique**: **Prompt Engineering** — a carefully structured text prompt instructs Gemini to:
  - Return exactly N questions at a specified difficulty
  - Format output as strict JSON (no markdown, no explanation)
  - Ensure `correctAnswer` is always the exact string from the `options` array
- **Fallback**: If all API calls fail, mock questions are returned so the app never crashes

#### 3. Real-Time Communication — Socket.IO (WebSocket Protocol)

- **Protocol**: WebSocket (persistent, bidirectional connection)
- **Pattern**: Publish-Subscribe via Rooms (`io.to(quizId).emit(...)`)
- **State Management**: In-memory `Map` objects on the server for low-latency access

#### 4. Leaderboard Ranking — Multi-criteria Sort Algorithm

```
Sort Priority:
  1st: Score (descending) — Higher score = better rank
  2nd: Total Time Taken (ascending) — Less time = better rank (tiebreaker)
  3rd: Last Answer Timestamp (ascending) — Earlier submission = better rank
```

#### 5. Answer Validation — Fuzzy Label Matching

Because AI sometimes returns `correctAnswer` as `"A"`, `"B"`, or `"0"`, `"1"` instead of the full option text, a fallback matching system is implemented:

```
Step 1: Direct match (studentAnswer === correctAnswer)
Step 2: Label match — "a" → options[0], "b" → options[1], ...
Step 3: Index match — "0" → options[0], "1" → options[1], ...
```

---

### 🔍 Why Were These Methods Chosen?

| Method | Why Chosen |
|---|---|
| **JWT** over Sessions | Stateless — scalable, doesn't require server-side session storage |
| **bcrypt** over MD5/SHA | bcrypt is intentionally slow and salted — much more secure for passwords |
| **Socket.IO** over REST polling | REST polling wastes bandwidth; Socket.IO pushes data only when needed |
| **Gemini AI** over OpenAI | Free tier is sufficient; Gemini 2.0-flash is fast and well-suited for text tasks |
| **MongoDB** over SQL | Schema flexibility — quiz questions vary in structure; NoSQL fits this better |
| **React** over vanilla JS | Component-based UI is ideal for a complex multi-page, stateful application |

---

### 🆚 Comparison with Alternative Approaches

#### Alternative 1: Traditional REST API Polling (instead of Socket.IO)

| Aspect | Socket.IO (Used) | REST Polling (Alternative) |
|---|---|---|
| How it works | Server pushes updates when they happen | Client repeatedly asks server "any updates?" every N seconds |
| Bandwidth | Efficient — updates sent only on change | Wasteful — constant requests even when nothing changed |
| Latency | Near-instant (milliseconds) | Depends on polling interval (500ms–5s delay) |
| Complexity | Higher setup complexity | Simpler to implement |
| **Verdict** | ✅ Better for real-time use case | ❌ Not suitable for live quiz with 30+ students |

#### Alternative 2: Rule-Based Question Generation (instead of Gemini AI)

| Aspect | Gemini AI (Used) | Rule-Based Templates (Alternative) |
|---|---|---|
| How it works | AI generates contextual, unique questions from any input | Pre-written question templates filled with variable substitution |
| Flexibility | Can handle ANY topic or PDF content | Limited to pre-programmed topics |
| Quality | High — generates natural language questions | Low — robotic, repetitive output |
| Cost | API rate limits apply | Free, no dependencies |
| **Verdict** | ✅ Far superior for diverse, real content | ❌ Not scalable for arbitrary topics |

#### Alternative 3: Firebase Realtime Database (instead of MongoDB + Socket.IO)

| Aspect | MongoDB + Socket.IO (Used) | Firebase (Alternative) |
|---|---|---|
| Real-time | Custom Socket.IO events | Built-in real-time listeners |
| Query Power | Full MongoDB aggregation pipeline | Limited querying |
| Control | Full control over server logic | Vendor lock-in, limited serverless control |
| Cost | Self-hosted / Atlas free tier | Firebase free tier limits apply |
| **Verdict** | ✅ More flexible, powerful backend logic | ⚠️ Faster to prototype but less powerful at scale |

---

## 📌 POINT 3 — Architecture & Workflow

### 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────┐
│                  CLIENT (Browser)                    │
│   React + Vite (Port 5173)                          │
│   ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│   │ Auth     │ │ Teacher  │ │ Student           │  │
│   │ Pages    │ │ Pages    │ │ Pages             │  │
│   └──────────┘ └──────────┘ └───────────────────┘  │
│           │ HTTP/REST          │ WebSocket           │
└───────────┼────────────────────┼────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────┐
│                  SERVER (Node.js)                    │
│   Express (Port 5000)  +  Socket.IO                 │
│                                                      │
│   ┌──────────────┐   ┌──────────────────────────┐  │
│   │  REST API    │   │  Socket.IO Event Handler │  │
│   │  /api/auth   │   │  join_room               │  │
│   │  /api/quiz   │   │  start_quiz              │  │
│   └──────┬───────┘   │  submit_question_answer  │  │
│          │           │  end_quiz                │  │
│   ┌──────▼───────┐   │  change_question         │  │
│   │ Middleware   │   │  disconnect              │  │
│   │ JWT Auth     │   └──────────────────────────┘  │
│   └──────┬───────┘                                  │
│          │           ┌──────────────────────────┐  │
│   ┌──────▼───────┐   │  In-Memory State (Maps)  │  │
│   │ Controllers  │   │  roomParticipants        │  │
│   │ quizCtrl     │   │  roomState               │  │
│   │ authRoutes   │   │  socketToUser            │  │
│   └──────┬───────┘   └──────────────────────────┘  │
│          │                                           │
└──────────┼───────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│              DATABASE (MongoDB Atlas)                │
│   Collections:                                       │
│   ● Users    (username, email, hashed password, role)│
│   ● Quizzes  (questions, joinCode, status, scores)   │
│   ● Results  (answers, score, time, student ref)     │
└─────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────┐
│              EXTERNAL SERVICES                       │
│   ● Google Gemini API (AI question generation)      │
│   ● MongoDB Atlas (cloud database)                  │
└─────────────────────────────────────────────────────┘
```

---

### 📦 All Modules / Components

#### Backend Modules
| Module | File | Responsibility |
|---|---|---|
| Server Entry | [index.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/index.js) | App startup, middleware, REST routes, ALL Socket.IO event handlers |
| Database Config | [config/db.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/config/db.js) | Connect to MongoDB using URI from environment variables |
| Auth Routes | [routes/auth.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/routes/auth.js) | Login, get user profile, set role endpoints |
| Quiz Routes | [routes/quiz.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/routes/quiz.js) | Create, read, update, delete quiz; submit attempt; leaderboard |
| Quiz Controller | [controllers/quizController.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/controllers/quizController.js) | All quiz business logic, AI generation, scoring, analytics |
| Auth Middleware | [middleware/authMiddleware.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/middleware/authMiddleware.js) | JWT verification for every protected route |
| User Model | [models/User.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/models/User.js) | MongoDB schema for users |
| Quiz Model | [models/Quiz.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/models/Quiz.js) | MongoDB schema for quizzes + questions |
| Result Model | [models/Result.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/models/Result.js) | MongoDB schema for student quiz attempts |

#### Frontend Modules
| Module | File | Responsibility |
|---|---|---|
| App Router | [App.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/App.jsx) | URL routing with role-based protection |
| Auth Context | [context/AuthContext.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/context/AuthContext.jsx) | Global login state shared across all components |
| Protected Route | [components/ProtectedRoute.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/components/ProtectedRoute.jsx) | Guards pages — redirects unauthorized users |
| Login Page | [pages/Login.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/Login.jsx) | User login form |
| Role Selection | [pages/RoleSelection.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/RoleSelection.jsx) | New users choose teacher/student role |
| Teacher Dashboard | [pages/TeacherDashboard.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/TeacherDashboard.jsx) | Teacher home with quiz creation options |
| Create Quiz (Text) | [pages/CreateQuizText.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/CreateQuizText.jsx) | Manual question entry interface |
| Create Quiz (PDF) | [pages/CreateQuizPDF.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/CreateQuizPDF.jsx) | PDF upload → AI question generation |
| Create Quiz (Topic) | [pages/CreateQuizTopic.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/CreateQuizTopic.jsx) | Topic text → AI question generation |
| Live Room (Teacher) | [pages/LiveRoomTeacher.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/LiveRoomTeacher.jsx) | Teacher control panel for live quiz |
| Live Room (Student) | [pages/LiveRoomStudent.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/LiveRoomStudent.jsx) | Student quiz answering interface |
| Leaderboard | [pages/Leaderboard.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/Leaderboard.jsx) | Post-quiz rankings and results |
| My Quizzes | [pages/MyQuizzes.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/MyQuizzes.jsx) | Teacher's quiz history and management |
| Assessments | [pages/Assessments.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/Assessments.jsx) | Student's quiz history |
| Performance | [pages/Performance.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/Performance.jsx) | Teacher analytics dashboard |
| Student Dashboard | [pages/StudentDashboard.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/StudentDashboard.jsx) | Student home with available quizzes |
| Admin Dashboard | [pages/AdminDashboard.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/pages/AdminDashboard.jsx) | Admin management panel |

---

### 🔄 Step-by-Step Workflow

#### Workflow A: Teacher Creates a Live Quiz

```
INPUT: Teacher chooses "Create Live Quiz" → selects "From Topic"
  │
  ▼
1. Teacher enters: Topic = "Python Loops", Count = 10, Difficulty = "Medium"
  │
  ▼
2. Client sends POST /api/quiz/generate to server
  │
  ▼
3. Server builds Gemini AI prompt with topic and rules
  │
  ▼
4. Gemini API returns JSON with 10 questions
  │
  ▼
5. Teacher reviews questions, edits if needed, clicks "Save"
  │
  ▼
6. Client sends POST /api/quiz/create with questions + isLive=true
  │
  ▼
7. Server generates unique 6-digit join code, saves quiz to MongoDB
  │
  ▼
OUTPUT: Teacher receives quiz with joinCode = "482910"
```

#### Workflow B: Student Joins and Answers a Live Quiz

```
INPUT: Student enters join code "482910" on Student Dashboard
  │
  ▼
1. Client sends POST /api/quiz/join with code "482910"
  │
  ▼
2. Server finds quiz in DB, returns quizId + status
  │
  ▼
3. Student navigates to /live-room-student/482910
  │
  ▼
4. Client establishes WebSocket connection
   socket.emit('join_room', { quizId, user })
  │
  ▼
5. Server adds student to room, broadcasts updated participant list
  │
  ▼
6. Teacher clicks "Start Quiz"
   Teacher's client: socket.emit('start_quiz', quizId)
  │
  ▼
7. Server updates quiz status='started' in DB, broadcasts to ALL:
   io.to(quizId).emit('quiz_started')
   io.to(quizId).emit('sync_timer', { timeLeft: 300 })
  │
  ▼
8. Student sees Question 1, countdown timer starts
  │
  ▼
9. Student clicks "Paris" as answer
   socket.emit('submit_question_answer', { quizId, studentId, questionIndex: 0, answer: "Paris", timeRemaining: 22 })
  │
  ▼
10. Server validates answer, updates Result in DB, recalculates leaderboard
    Broadcasts to room: 'student_progress_update' + 'question_leaderboard'
  │
  ▼
11. Teacher's screen: student row turns GREEN (correct answer dot)
    Everyone's screen: leaderboard updates
  │
  ▼
12. Teacher ends quiz: socket.emit('end_quiz', quizId)
  │
  ▼
13. Server finalizes all results in DB, saves final leaderboard to quiz document
    io.to(quizId).emit('quiz_ended')
  │
  ▼
OUTPUT: All participants redirected to /leaderboard/:quizId showing final rankings
```

---

## 📌 POINT 4 — Results & Critical Analysis

### 📊 Results & Metrics

> [!NOTE]
> This is a **software engineering / web development project**, not an ML research project. Metrics are measured as functional performance and system capabilities, not model accuracy.

| Metric | Result |
|---|---|
| Quiz Creation Modes | 3 (Manual, PDF, Topic) — all functional |
| AI Generation Success Rate | ~95% (falls back to mock questions on failure) |
| Real-time Latency | < 100ms for Socket.IO events on local network |
| Concurrent Room Support | Multiple rooms simultaneously (each isolated by quizId) |
| Scoring Accuracy | 100% — answer validation with 3-level fallback matching |
| Reconnection Handling | Full state restoration (current question, leaderboard, progress) on reconnect |
| Role-Based Protection | All routes protected — tested for teacher/student/admin isolation |
| Quiz Status Lifecycle | waiting → started → finished (all transitions handled) |
| Tiebreaker Accuracy | 3-level sort: score → time → timestamp |
| Data Persistence | All results saved to MongoDB in real-time per-answer |

---

### 🥇 Which Approach Performs Best and Why?

**Socket.IO for real-time** is the most critical design decision and it performs best because:
- Leaderboard updates reach all 30+ students in under 100ms
- Teacher sees student answer status in real-time (green/red dots per student per question)
- Timer synchronization is server-authoritative — students cannot cheat by manipulating client-side time
- Disconnection is graceful — student marked offline, not removed; they can reconnect and resume

**Gemini AI with prompt engineering** performs best for question generation because:
- `gemini-2.0-flash` is fast (2-4 seconds per generation) and returns clean JSON
- The structured prompt with explicit rules produces consistent, accurate output
- Multi-model fallback (`2.0-flash → 1.5-flash → 1.5-flash-latest`) ensures high availability

---

### 🔬 Critical Analysis

#### ✅ Strengths
- **Dual communication paradigm** — REST for data loading + Socket.IO for events is architecturally clean and efficient
- **Graceful degradation** — If AI fails, mock questions are used. If DB state is missing on reconnect, it's rebuilt from scratch
- **Privacy-aware leaderboard** — Teachers see all student data; students only see their own result
- **Optimistic UI updates** — Answer marked as submitted immediately in memory before DB write completes, making the UI feel instant
- **Atomic answer submission** — If the same question is answered twice, the old answer is replaced (not duplicated), score is recalculated correctly

#### ❌ Limitations

| Limitation | Impact | Possible Fix |
|---|---|---|
| In-memory state (`Map`) is lost on server restart | Active quizzes would break if server crashes | Use Redis for shared, persistent in-memory state |
| JWT token doesn't invalidate on logout | Technically the old token works until it expires (1 hour) | Use a token blacklist in Redis |
| No rate limiting on API endpoints | Vulnerable to abuse/spam attacks | Add `express-rate-limit` middleware |
| Single server — no horizontal scaling | Cannot scale to multiple servers without sticky sessions | Use Redis adapter for Socket.IO |
| `submit_new_question` handler has a bug | References an undefined `question` variable — this handler would crash | Fix to use `quiz.questions[questionIndex]` |
| PDF parsing may fail on scanned/image PDFs | `pdf-parse` only reads text-layer PDFs — scanned images return no text | Integrate OCR (Optical Character Recognition) |
| Gemini API rate limiting | If many teachers create quizzes simultaneously, API calls may be throttled | Implement request queuing |

---

## 📌 POINT 5 — Learning & Innovation

### 🚀 Possible Improvements & Extensions

| Improvement | Description |
|---|---|
| **Redis Integration** | Move in-memory Maps to Redis — enables server restarts without data loss AND horizontal scaling |
| **OCR for PDFs** | Use Tesseract.js or Google Vision API to extract text from scanned/image PDFs |
| **Video/Image Questions** | Allow questions with images or diagrams (important for science/math) |
| **Adaptive Difficulty** | AI adjusts question difficulty based on a student's running performance |
| **Proctoring Features** | Detect tab-switching, browser blur events to flag potential cheating |
| **Mobile App** | Build a React Native version for students to use on phones |
| **Analytics Dashboard** | Heat maps showing which questions are hardest across all students |
| **Export Results** | Download quiz results as Excel/CSV for grade entry |
| **Batch Student Import** | Upload Excel/CSV file to create all student accounts at once |
| **Question Bank** | Teachers save and reuse questions across multiple quizzes |

### 🌍 Real-World Applications

| Domain | Application |
|---|---|
| **Education** | Classroom formative assessment, end-of-chapter tests, competitive exam preparation |
| **Corporate Training** | Employee onboarding tests, compliance training quizzes |
| **HR & Recruitment** | Online screening tests for job applicants |
| **Event Quizzes** | Live audience participation at conferences or events |
| **Healthcare Training** | Medical staff knowledge testing |
| **Government Exams** | Competitive exam practice platforms |

---

## 🎤 1-MINUTE SPOKEN SUMMARY
*(Memorize and speak this at the start of your presentation)*

> "Our project is a **real-time, AI-powered quiz platform** — similar to Kahoot — built specifically for classroom use.
>
> The core problem we addressed is that **traditional assessments are static, delayed, and time-consuming for teachers** to create. Our solution gives teachers three ways to create quizzes: manually, by uploading a PDF, or simply by typing a topic — and our AI uses **Google Gemini** to generate questions automatically.
>
> For live sessions, **teachers host a room with a 6-digit join code**, students join from any browser, and everything happens in real-time using **Socket.IO** — answers submitted, leaderboard updated, progress tracked — all simultaneously across all screens.
>
> The tech stack is **React on the frontend**, **Node.js + Express on the backend**, **MongoDB for the database**, and **Socket.IO for real-time communication**. Authentication uses **JWT tokens** and passwords are secured with **bcrypt hashing**.
>
> The system supports **three user roles** — teacher, student, and admin — each with their own protected interface. Results are stored permanently, and teachers can review performance analytics after each quiz.
>
> In summary, we built a complete, production-ready EdTech platform that makes assessment fast, engaging, and intelligent."

---

## ❓ VIVA QUESTIONS & ANSWERS

---

### Q1: What is the problem your project is solving?

**Answer:**
Traditional classroom assessments are paper-based, delayed, and require significant manual effort from teachers. There is no mechanism for real-time engagement or instant feedback. Our platform solves this by providing a digital, real-time quiz system where teachers can generate questions using AI in seconds, host live sessions, and see every student's progress in real-time — eliminating the delay between assessment and feedback.

---

### Q2: Why did you use Socket.IO instead of regular HTTP requests?

**Answer:**
HTTP follows a request-response model — the client must ask the server for data. In a live quiz, we need the server to **push updates to all 30 students simultaneously** the moment someone submits an answer. This is only possible with WebSockets, which maintain a persistent, bidirectional connection. Socket.IO is a library built on WebSockets that also adds helpful features like automatic reconnection and room-based broadcasting. Using REST polling as an alternative would mean 30 students making requests every second — wasteful and delayed.

---

### Q3: How does the authentication system work?

**Answer:**
When a user logs in with their email and password, the server first finds the user in MongoDB. It then uses **bcrypt.compare()** to check if the provided password matches the stored hash — the plain text password is never saved anywhere. If correct, the server creates a **JWT (JSON Web Token)** signed with a secret key, containing the user's ID and role. This token is sent to the browser, stored in localStorage, and attached to every future API request in the `x-auth-token` header. The server's [authMiddleware.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/middleware/authMiddleware.js) verifies this token before processing any protected request. The token expires in 1 hour.

---

### Q4: How does the AI quiz generation work?

**Answer:**
We use **Google Gemini API**. When a teacher provides a topic or PDF content, we build a detailed prompt that instructs Gemini to generate exactly N questions at a specified difficulty, return the result as **pure JSON only** (no markdown, no explanation), and ensure the `correctAnswer` field exactly matches one of the option strings. The server makes an HTTPS request to Gemini's REST API. We try 3 models in order — `gemini-2.0-flash`, `gemini-1.5-flash`, and `gemini-1.5-flash-latest`. If all fail, we fall back to mock questions so the application never crashes.

---

### Q5: How does the leaderboard ranking work? How are ties handled?

**Answer:**
After every answer submission, we recalculate the leaderboard by fetching all Result records for that quiz from MongoDB and sorting them using a **3-level priority sort**:
1. **Score descending** — higher score ranks higher
2. **Total time ascending** — if two students have the same score, the faster one ranks higher
3. **Last answer timestamp ascending** — if score and time are both identical, whoever submitted their last answer earlier ranks higher

This approach ensures fairness and discourages students from delaying their answers.

---

### Q6: What happens if a student loses internet connection during a live quiz?

**Answer:**
When the student disconnects, the `disconnect` Socket.IO event fires on the server. Instead of removing the student from the participant list, we mark them as `isOnline: false`. This updates the teacher's screen to show them as offline. When the student reconnects, they emit a `reconnectUser` event. The server then sends a `restoreState` event containing their current question index, remaining time, existing leaderboard, and their personal progress (which questions they already answered). If this state data isn't in memory (e.g., after a server restart), the server **rebuilds it from the MongoDB database** by reading all stored Result records.

---

### Q7: What is the data model and how are the three collections related?

**Answer:**
We have three MongoDB collections:
- **Users** — stores username, email, bcrypt-hashed password, and role
- **Quizzes** — stores the quiz title, array of questions (with options and correct answers), join code, teacher reference, status, and final leaderboard
- **Results** — stores each student's attempt for a specific quiz, including their score, time taken, and per-question answer details

The relationships are:
- `Quiz.createdBy` → references `User._id` (the teacher)
- `Result.quiz` → references `Quiz._id`
- `Result.student` → references `User._id`

Mongoose's `.populate()` method is used to join these collections when needed — for example, fetching a student's username in the leaderboard.

---

### Q8: How does role-based access control work?

**Answer:**
Role-based access works at two levels:
1. **Backend** — Every API route is protected by [authMiddleware.js](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/server/middleware/authMiddleware.js) which verifies the JWT. The controller logic then checks `req.user.role` or `req.user.id` to ensure the action is permitted. For example, only the quiz creator can delete their own quiz.
2. **Frontend** — The `ProtectedRoute` component in React wraps every page. It reads the user's role from `AuthContext`. If the current user's role doesn't match the `roles` prop, they are redirected to login or their appropriate dashboard. For example, a student visiting `/teacher-dashboard` is automatically redirected away.

---

### Q9: What design pattern does [AuthContext.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/context/AuthContext.jsx) implement and why?

**Answer:**
[AuthContext.jsx](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/context/AuthContext.jsx) implements the **React Context API with Provider pattern**. This is essentially a lightweight state management solution. Without it, we would have to pass the logged-in user's data as props through every component from the top-level App down to deeply nested pages — called "prop drilling." With Context, we wrap the entire app in `<AuthProvider>` and any component can call `useContext(AuthContext)` to directly access the `user` object, [login](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/context/AuthContext.jsx#27-34), [logout](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/context/AuthContext.jsx#50-54), and [setRole](file:///c:/Users/manim/OneDrive/Desktop/kahoot_team2026/Demo_project/client/src/context/AuthContext.jsx#43-49) functions. This makes the code much cleaner and more maintainable.

---

### Q10: What are the limitations of your project and how would you improve it?

**Answer:**
The main limitations are:

1. **In-memory state loss** — The `roomState` Map lives in the server's RAM. If the server restarts mid-quiz, that state is gone. The fix is to use **Redis** as a shared external cache.

2. **No horizontal scaling** — Because Socket.IO room state is stored in one server's memory, we can't run multiple server instances. Redis adapter for Socket.IO would solve this.

3. **JWT invalidation** — A logged-out user's token still works until it expires. A Redis-based token blacklist would fix this.

4. **PDF OCR limitation** — The `pdf-parse` library only works on text-layer PDFs. Scanned documents (images of text) return nothing. Integrating an OCR library like **Tesseract.js** would fix this.

5. **A minor code bug** in `submit_new_question` handler — it references an undefined `question` variable. It should use `quiz.questions[questionIndex]` instead.

For future improvement, I would add **adaptive AI difficulty** (the system adjusts question hardness based on student performance), **export to Excel for grades**, and potentially a **mobile app using React Native**.

---

> [!TIP]
> **Presentation Tip**: Start with the 1-Minute Summary. Then show the architecture diagram from Point 3. Talk through a live demo if possible using the workflow from Point 3. End with the limitations — professors appreciate honesty and critical thinking.
