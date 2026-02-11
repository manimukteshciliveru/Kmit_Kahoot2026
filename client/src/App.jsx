import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';

// Layout
import Layout from './components/common/Layout';

// Auth Pages
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';

// Dashboard Pages
import StudentDashboard from './pages/student/StudentDashboard';
import FacultyDashboard from './pages/faculty/FacultyDashboard';
import AdminDashboard from './pages/admin/AdminDashboard';

// Admin Pages
import UserManagement from './pages/admin/UserManagement';
import AddUser from './pages/admin/AddUser';
import BulkUpload from './pages/admin/BulkUpload';
import Analytics from './pages/admin/Analytics';
import Settings from './pages/admin/Settings';

// Student Pages
import JoinQuiz from './pages/student/JoinQuiz';

// Faculty Pages
import CreateQuiz from './pages/faculty/CreateQuiz';
import HostQuiz from './pages/faculty/HostQuiz';
import QuizResults from './pages/faculty/QuizResults';
import MyQuizzes from './pages/faculty/MyQuizzes';
import FacultyAnalytics from './pages/faculty/FacultyAnalytics';

// Quiz Pages
import PlayQuiz from './pages/quiz/PlayQuiz';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Dashboard Route - redirects based on user role
const DashboardRoute = () => {
  const { user } = useAuth();

  switch (user?.role) {
    case 'admin':
      return <AdminDashboard />;
    case 'faculty':
      return <FacultyDashboard />;
    case 'student':
    default:
      return <StudentDashboard />;
  }
};

// Main App Component
function App() {
  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          <SocketProvider>
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  background: '#1A1A2E',
                  color: '#F8FAFC',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '10px',
                },
                success: {
                  iconTheme: {
                    primary: '#10B981',
                    secondary: '#1A1A2E',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#EF4444',
                    secondary: '#1A1A2E',
                  },
                },
              }}
            />

            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Protected Routes with Layout */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }
              >
                {/* Dashboard */}
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<DashboardRoute />} />

                {/* Student Routes */}
                <Route
                  path="join-quiz"
                  element={
                    <ProtectedRoute allowedRoles={['student']}>
                      <JoinQuiz />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="history"
                  element={
                    <ProtectedRoute allowedRoles={['student']}>
                      <StudentDashboard />
                    </ProtectedRoute>
                  }
                />

                {/* Faculty Routes */}
                <Route
                  path="create-quiz"
                  element={
                    <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                      <CreateQuiz />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="quiz/:quizId/edit"
                  element={
                    <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                      <CreateQuiz />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="my-quizzes"
                  element={
                    <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                      <MyQuizzes />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="quiz/:quizId/host"
                  element={
                    <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                      <HostQuiz />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="quiz/:quizId/results"
                  element={
                    <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                      <QuizResults />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="my-analytics"
                  element={
                    <ProtectedRoute allowedRoles={['faculty', 'admin']}>
                      <FacultyAnalytics />
                    </ProtectedRoute>
                  }
                />

                {/* Quiz Routes */}
                <Route path="quiz/:quizId/play" element={<PlayQuiz />} />

                {/* Admin Routes */}
                <Route
                  path="users"
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <UserManagement />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users/new"
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <AddUser />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="users/bulk"
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <BulkUpload />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="analytics"
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <Analytics />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="settings"
                  element={
                    <ProtectedRoute allowedRoles={['admin']}>
                      <Settings />
                    </ProtectedRoute>
                  }
                />

                {/* Profile */}
                <Route path="profile" element={<StudentDashboard />} />
              </Route>

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </SocketProvider>
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
