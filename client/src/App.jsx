import { Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import { useAuth } from './context/AuthContext';

// Layouts
import Layout from './components/common/Layout';
import DeviceRestriction from './components/common/DeviceRestriction';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import Unauthorized from './pages/auth/Unauthorized';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import AddUser from './pages/admin/AddUser';
import BulkUpload from './pages/admin/BulkUpload';
import QuizAnalytics from './pages/admin/QuizAnalytics';
import Analytics from './pages/admin/Analytics';
import Settings from './pages/admin/Settings';

// Faculty Pages
import FacultyDashboard from './pages/faculty/FacultyDashboard';
import MyQuizzes from './pages/faculty/MyQuizzes';
import CreateQuiz from './pages/faculty/CreateQuiz';
import FacultyAnalytics from './pages/faculty/FacultyAnalytics';

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import JoinQuiz from './pages/student/JoinQuiz';
import History from './pages/student/History';
import Flashcards from './pages/student/Flashcards';
import BattleArena from './pages/student/BattleArena';
import GamesHub from './pages/student/GamesHub';
import SurvivalArena from './pages/student/SurvivalArena';
import Profile from './pages/common/Profile';

// Quiz Pages
import PlayQuiz from './pages/quiz/PlayQuiz';
import QuizResults from './pages/faculty/QuizResults';
import HostQuiz from './pages/faculty/HostQuiz';
import QuizReport from './pages/student/QuizReport';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
    const { user, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Navigate to="/login" />;
    if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
    return children;
};

const App = () => {
    return (
        <DeviceRestriction>
            <Routes>
            {/* Public Routes */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/unauthorized" element={<Unauthorized />} />

                {/* Root Redirect */}
                <Route path="/" element={<Navigate to="/login" />} />

                {/* Admin Routes */}
                <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><Layout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="dashboard" />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="users" element={<UserManagement />} />
                    <Route path="users/new" element={<AddUser />} />
                    <Route path="users/bulk" element={<BulkUpload />} />
                    <Route path="quiz-analytics" element={<QuizAnalytics />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="profile" element={<Profile />} />
                </Route>

                {/* Faculty Routes */}
                <Route path="/faculty" element={<ProtectedRoute allowedRoles={['faculty']}><Layout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="dashboard" />} />
                    <Route path="dashboard" element={<FacultyDashboard />} />
                    <Route path="quizzes" element={<MyQuizzes />} />
                    <Route path="create" element={<CreateQuiz />} />
                    <Route path="analytics" element={<FacultyAnalytics />} />
                    <Route path="profile" element={<Profile />} />
                </Route>

                {/* Student Routes */}
                <Route path="/student" element={<ProtectedRoute allowedRoles={['student']}><Layout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="dashboard" />} />
                    <Route path="dashboard" element={<StudentDashboard />} />
                    <Route path="join" element={<JoinQuiz />} />
                    <Route path="history" element={<History />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="flashcards" element={<Flashcards />} />
                    <Route path="battle" element={<BattleArena />} />
                    <Route path="survival" element={<SurvivalArena />} />
                    <Route path="games" element={<GamesHub />} />
                </Route>

                {/* Shared Quiz Play Route */}
                <Route path="/play/:quizId" element={<ProtectedRoute><PlayQuiz /></ProtectedRoute>} />
                <Route path="/quiz/:quizId/play" element={<ProtectedRoute allowedRoles={['student']}><PlayQuiz /></ProtectedRoute>} />

                {/* Faculty Host Quiz Route */}
                <Route path="/quiz/:quizId/host" element={<ProtectedRoute allowedRoles={['faculty', 'admin']}><Layout /></ProtectedRoute>}>
                    <Route index element={<HostQuiz />} />
                </Route>

                {/* Faculty Quiz Results (shared route outside /faculty prefix) */}
                <Route path="/quiz/:quizId/results" element={<ProtectedRoute allowedRoles={['faculty', 'admin']}><Layout /></ProtectedRoute>}>
                    <Route index element={<QuizResults />} />
                </Route>

                {/* Student Quiz Report (shared route outside /student prefix) */}
                <Route path="/history/report/:responseId" element={<ProtectedRoute allowedRoles={['student']}><Layout /></ProtectedRoute>}>
                    <Route index element={<QuizReport />} />
                </Route>

                {/* Catch All */}
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </DeviceRestriction>
    );
};

export default App;
