# QuizMaster Pro - Full Stack Quiz Application

## 📋 Project Overview

A comprehensive, real-time quiz examination platform with AI-powered question generation, supporting multiple user roles and exam types.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React)                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Student    │  │   Faculty   │  │    Admin    │  │   Shared Components │ │
│  │  Dashboard  │  │  Dashboard  │  │  Dashboard  │  │   (Auth, UI, etc.)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ HTTP/WebSocket
┌────────────────────────────────▼────────────────────────────────────────────┐
│                         API GATEWAY (Express.js)                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │    REST     │  │  Socket.io  │  │    Auth     │  │   Rate Limiting     │ │
│  │    APIs     │  │   Server    │  │ Middleware  │  │   & Validation      │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│                           SERVICES LAYER                                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │    User     │  │    Quiz     │  │     AI      │  │   File Processing   │ │
│  │   Service   │  │   Service   │  │   Service   │  │      Service        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Realtime   │  │  Analytics  │  │   Scoring   │  │   Leaderboard       │ │
│  │   Service   │  │   Service   │  │   Service   │  │      Service        │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
┌────────────────────────────────▼────────────────────────────────────────────┐
│                           DATA LAYER                                         │
│  ┌─────────────────────────┐  ┌─────────────────────────────────────────┐   │
│  │    MongoDB Atlas        │  │           Redis (Optional)              │   │
│  │  (Primary Database)     │  │      (Session & Leaderboard Cache)      │   │
│  └─────────────────────────┘  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Core Features by User Role

### 👨‍🎓 STUDENT Features
- [x] Register/Login with email
- [x] Personal dashboard with stats
- [x] Join quizzes via code
- [x] Answer questions within time limits
- [x] View instant feedback after each question
- [x] Real-time leaderboard during quiz
- [x] Score tracking and history
- [x] Tab switch detection (auto-terminate)
- [x] Jumbled questions for fairness

### 👨‍🏫 FACULTY Features
- [x] Create/Edit/Delete quizzes
- [x] Set question & quiz timers
- [x] Multiple exam modes (MCQ, Fill-in-blanks, Q&A)
- [x] AI-powered question generation from:
  - PDF files
  - Excel/CSV files
  - Audio files
  - Video files
- [x] Set difficulty levels (Easy, Medium, Hard, Advanced)
- [x] Live editing during quiz runtime
- [x] View live student responses
- [x] Real-time leaderboard monitoring
- [x] Download quiz results (CSV/PDF)
- [x] Control question flow

### 👨‍💼 ADMIN Features
- [x] Manage teacher/faculty accounts
- [x] Manage student access
- [x] View comprehensive reports
- [x] System settings control
- [x] Platform maintenance tools
- [x] Analytics dashboard

---

## 📁 Project Structure

```
QuizMaster/
├── client/                          # React Frontend
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── common/              # Shared components
│       │   ├── auth/                # Login, Register
│       │   ├── student/             # Student dashboard & quiz
│       │   ├── faculty/             # Faculty dashboard & quiz management
│       │   └── admin/               # Admin panel
│       ├── context/                 # React Context (Auth, Socket)
│       ├── hooks/                   # Custom hooks
│       ├── pages/                   # Page components
│       ├── services/                # API calls
│       ├── utils/                   # Helper functions
│       └── styles/                  # CSS files
│
├── server/                          # Node.js Backend
│   ├── config/                      # Configuration files
│   ├── controllers/                 # Route controllers
│   ├── middleware/                  # Auth, validation, etc.
│   ├── models/                      # MongoDB models
│   ├── routes/                      # Express routes
│   ├── services/                    # Business logic
│   │   ├── ai/                      # AI question generation
│   │   ├── file-processing/         # PDF, Excel, Audio, Video
│   │   └── realtime/                # Socket.io handlers
│   ├── utils/                       # Helper utilities
│   └── socket/                      # Socket.io setup
│
├── .env.example
├── docker-compose.yml
├── package.json
└── README.md
```

---

## 🗄️ Database Schema (MongoDB)

### Users Collection
```javascript
{
  _id: ObjectId,
  email: String,
  password: String (hashed),
  role: "student" | "faculty" | "admin",
  name: String,
  avatar: String,
  createdAt: Date,
  isActive: Boolean,
  stats: {
    quizzesAttended: Number,
    averageScore: Number,
    totalPoints: Number
  }
}
```

### Quizzes Collection
```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  code: String (unique 6-char),
  createdBy: ObjectId (ref: Users),
  mode: "mcq" | "fill-blank" | "qa",
  status: "draft" | "active" | "completed",
  settings: {
    quizTimer: Number (seconds),
    questionTimer: Number (seconds),
    shuffleQuestions: Boolean,
    showInstantFeedback: Boolean,
    allowTabSwitch: Boolean,
    difficultyLevel: "easy" | "medium" | "hard" | "advanced"
  },
  questions: [{
    _id: ObjectId,
    text: String,
    type: "mcq" | "fill-blank" | "qa",
    options: [String] (for MCQ),
    correctAnswer: String,
    points: Number,
    timeLimit: Number (seconds),
    difficulty: String
  }],
  participants: [ObjectId],
  startedAt: Date,
  endedAt: Date,
  createdAt: Date
}
```

### Responses Collection
```javascript
{
  _id: ObjectId,
  quizId: ObjectId,
  userId: ObjectId,
  answers: [{
    questionId: ObjectId,
    answer: String,
    isCorrect: Boolean,
    timeTaken: Number (milliseconds),
    answeredAt: Date
  }],
  totalScore: Number,
  totalTime: Number,
  rank: Number,
  status: "in-progress" | "completed" | "terminated",
  terminationReason: String,
  startedAt: Date,
  completedAt: Date
}
```

---

## 🚀 Implementation Phases

### Phase 1: Project Setup & Authentication (Day 1-2)
- [x] Initialize React + Vite frontend
- [x] Initialize Node.js + Express backend
- [x] MongoDB Atlas connection
- [x] JWT authentication system
- [x] User registration/login for all roles
- [x] Basic routing and protected routes

### Phase 2: Core Quiz Functionality (Day 3-5)
- [ ] Quiz CRUD operations (Faculty)
- [ ] Question management (all types)
- [ ] Quiz code generation
- [ ] Join quiz via code (Students)
- [ ] Basic quiz taking flow

### Phase 3: Real-time Features (Day 6-7)
- [ ] Socket.io integration
- [ ] Live quiz broadcasting
- [ ] Real-time leaderboard
- [ ] Live student response monitoring
- [ ] Tab switch detection

### Phase 4: AI Question Generation (Day 8-10)
- [ ] PDF text extraction
- [ ] Excel/CSV parsing
- [ ] Audio transcription (Whisper API)
- [ ] Video processing
- [ ] AI question generation (OpenAI/Gemini)
- [ ] Difficulty level assignment

### Phase 5: Scoring & Rankings (Day 11)
- [ ] Score calculation algorithm
- [ ] Speed-based ranking
- [ ] Leaderboard management
- [ ] Result generation & download

### Phase 6: Admin Panel (Day 12)
- [ ] User management
- [ ] System settings
- [ ] Analytics dashboard
- [ ] Reports generation

### Phase 7: Polish & Deployment (Day 13-14)
- [ ] UI/UX refinements
- [ ] Performance optimization
- [ ] Error handling
- [ ] Render deployment
- [ ] Testing & bug fixes

---

## 🛠️ Tech Stack Details

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | React 18 + Vite | Fast, modern UI |
| Styling | CSS3 + CSS Variables | Premium dark theme |
| State | React Context + useReducer | Global state management |
| Routing | React Router v6 | Client-side routing |
| HTTP Client | Axios | API requests |
| Real-time | Socket.io Client | WebSocket connection |
| Backend | Node.js + Express | REST API server |
| Real-time | Socket.io | WebSocket server |
| Database | MongoDB Atlas | Cloud database |
| Auth | JWT + bcrypt | Secure authentication |
| File Upload | Multer | File handling |
| AI | OpenAI/Google AI | Question generation |
| PDF | pdf-parse | PDF text extraction |
| Excel | xlsx | Excel/CSV parsing |
| Audio | Whisper API | Audio transcription |
| Deployment | Render | Cloud hosting |

---

## 🔐 API Endpoints

### Authentication
```
POST   /api/auth/register           - Register new user
POST   /api/auth/login              - Login user
GET    /api/auth/me                 - Get current user
POST   /api/auth/logout             - Logout user
```

### Users (Admin)
```
GET    /api/users                   - List all users
GET    /api/users/:id               - Get user by ID
PUT    /api/users/:id               - Update user
DELETE /api/users/:id               - Delete user
PUT    /api/users/:id/status        - Toggle user status
```

### Quizzes
```
POST   /api/quizzes                 - Create quiz (Faculty)
GET    /api/quizzes                 - List quizzes
GET    /api/quizzes/:id             - Get quiz details
PUT    /api/quizzes/:id             - Update quiz
DELETE /api/quizzes/:id             - Delete quiz
POST   /api/quizzes/:id/start       - Start quiz
POST   /api/quizzes/:id/end         - End quiz
POST   /api/quizzes/join/:code      - Join quiz by code
```

### Questions
```
POST   /api/quizzes/:id/questions   - Add question
PUT    /api/questions/:id           - Update question
DELETE /api/questions/:id           - Delete question
POST   /api/questions/generate      - AI generate questions
```

### Responses
```
POST   /api/responses               - Submit answer
GET    /api/responses/quiz/:id      - Get quiz responses
GET    /api/responses/user/:id      - Get user responses
```

### AI Generation
```
POST   /api/ai/generate-from-pdf    - Generate from PDF
POST   /api/ai/generate-from-excel  - Generate from Excel/CSV
POST   /api/ai/generate-from-audio  - Generate from audio
POST   /api/ai/generate-from-video  - Generate from video
```

### Analytics (Admin)
```
GET    /api/analytics/overview      - Platform overview
GET    /api/analytics/quizzes       - Quiz analytics
GET    /api/analytics/users         - User analytics
```

---

## 🔌 Socket.io Events

### Server -> Client
```javascript
'quiz:started'          - Quiz has begun
'quiz:question'         - New question broadcast
'quiz:ended'            - Quiz completed
'leaderboard:update'    - Leaderboard changed
'participant:joined'    - New participant joined
'participant:left'      - Participant left
'response:received'     - Answer submitted (Faculty view)
```

### Client -> Server
```javascript
'quiz:join'             - Join quiz room
'quiz:leave'            - Leave quiz room
'answer:submit'         - Submit answer
'quiz:start'            - Start quiz (Faculty)
'quiz:next-question'    - Move to next question
'tab:switched'          - Tab switch detected
```

---

## 🎨 UI/UX Design Guidelines

### Color Palette (Dark Theme)
```css
--primary:     #7C3AED    /* Vibrant Purple */
--secondary:   #10B981    /* Emerald Green */
--accent:      #F59E0B    /* Amber */
--danger:      #EF4444    /* Red */
--background:  #0F0F1A    /* Deep Dark */
--surface:     #1A1A2E    /* Card Background */
--text:        #F8FAFC    /* Light Text */
--text-muted:  #94A3B8    /* Muted Text */
```

### Design Principles
1. **Glassmorphism** - Frosted glass effect on cards
2. **Micro-animations** - Smooth transitions and hover effects
3. **Gradient accents** - Vibrant gradient buttons and highlights
4. **Dark mode first** - Easy on the eyes for extended use
5. **Responsive** - Mobile-first approach

---

## ⚡ Performance Optimizations

1. **Socket.io optimizations**
   - Binary data for faster transmission
   - Room-based broadcasting
   - Connection pooling

2. **Database optimizations**
   - Indexed queries
   - Pagination
   - Lean queries

3. **Frontend optimizations**
   - Code splitting
   - Lazy loading
   - Memoization

---

## 🔒 Security Measures

1. **Authentication**
   - JWT with refresh tokens
   - Password hashing (bcrypt)
   - Rate limiting

2. **Data Protection**
   - Input validation
   - XSS prevention
   - CORS configuration

3. **Quiz Integrity**
   - Tab switch detection
   - Answer encryption
   - Time validation

---

## 📊 Success Metrics

- Response time < 100ms for real-time updates
- 99.9% uptime
- Support 1000+ concurrent users
- < 3 second page load time

---

Let's begin implementation! 🚀
