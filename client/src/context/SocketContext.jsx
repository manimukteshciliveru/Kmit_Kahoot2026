import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';

const SocketContext = createContext(null);

export const useSocket = () => {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
};

export const SocketProvider = ({ children }) => {
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const { token, isAuthenticated, logout } = useAuth();
    const location = useLocation();

    useEffect(() => {
        // 🛡️ 1. Production Rule: Connection Restrictions
        const publicPages = ['/login', '/register', '/forgot-password', '/reset-password'];
        const isPublicPage = publicPages.some(path => location.pathname.startsWith(path));

        // Skip connection if user is on public pages or not logged in
        if (!isAuthenticated || !token || isPublicPage) {
            if (socket) {
                console.log('🔌 [SOCKET] Disconnecting - path is restricted or user logged out.');
                socket.disconnect();
                setSocket(null);
                setConnected(false);
            }
            return;
        }

        // 🚀 2. Initialize production-grade socket
        let socketUrl = import.meta.env.VITE_SOCKET_URL;
        if (!socketUrl) {
            socketUrl = import.meta.env.PROD ? window.location.origin : 'http://localhost:5000';
        }

        console.log('🔌 [SOCKET] Opening live lane to:', socketUrl);

        const newSocket = io(socketUrl, {
            auth: { token },
            transports: ['websocket'], // Websockets only for reliability and rate-limit friendliness
            reconnection: true,
            reconnectionAttempts: 5,   // Prevent infinite spam loops
            reconnectionDelay: 3000,   // Wait 3s before retry
            autoConnect: true,
            timeout: 10000
        });

        // 🛑 3. Multi-Session & Security Handlers
        newSocket.on('session:terminated', (data) => {
            console.error('🚫 [SOCKET] SESSION REJECTED:', data.reason);
            toast.error(data.message, { duration: 6000, position: 'top-center' });

            // Critical Fix: Hard disconnect and logout to kill the reconnect cycle
            newSocket.disconnect();
            logout();
            setTimeout(() => {
                window.location.href = '/login?error=session_conflict';
            }, 1000);
        });

        newSocket.on('connect', () => {
            console.log('🔌 Socket connected successfully');
            setConnected(true);
            setIsReconnecting(false);
        });

        newSocket.on('disconnect', (reason) => {
            console.warn('🔌 Socket lost connection:', reason);
            setConnected(false);
            if (reason === 'io server disconnect') {
                // If server forced us out, usually it's permanent until login change
                // But we allow manual connect only if state allows
            } else {
                setIsReconnecting(true);
            }
        });

        newSocket.on('connect_error', (error) => {
            console.error('Socket connection error:', error.message);
            setConnected(false);
            if (error.message === 'TOKEN_EXPIRED') {
                toast.error('Session expired. Please log in again.');
                logout();
            }
        });

        newSocket.on('reconnect_attempt', (attempt) => {
            console.log(`🔌 Reconnection attempt ${attempt}...`);
            setIsReconnecting(true);
        });

        newSocket.on('reconnect_failed', () => {
            setIsReconnecting(false);
            toast.error('Live connection could not be restored.');
        });

        setSocket(newSocket);

        return () => {
            if (newSocket) {
                newSocket.disconnect();
                setSocket(null);
                setConnected(false);
            }
        };
    }, [isAuthenticated, token, logout]); // Re-run if auth changes, NOT on path changes to preserve persistent connection

    // --- Provided Methods ---

    const joinQuiz = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:join', { quizId });
        }
    }, [socket, connected]);

    const leaveQuiz = useCallback((quizId) => {
        if (socket) {
            socket.emit('quiz:leave', { quizId });
        }
    }, [socket]);

    const startQuiz = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:start', { quizId });
        }
    }, [socket, connected]);

    const endQuiz = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:end', { quizId });
        }
    }, [socket, connected]);

    const nextQuestion = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:next-question', { quizId });
        }
    }, [socket, connected]);

    const submitAnswer = useCallback((data) => {
        if (socket && connected) {
            socket.emit('answer:submit', data);
        }
    }, [socket, connected]);

    const reportTabSwitch = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('tab:switched', { quizId });
        }
    }, [socket, connected]);

    const completeQuiz = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:complete', { quizId });
        }
    }, [socket, connected]);

    const on = useCallback((event, callback) => {
        if (socket) {
            socket.on(event, callback);
            return () => socket.off(event, callback);
        }
    }, [socket]);

    const off = useCallback((event, callback) => {
        if (socket) {
            socket.off(event, callback);
        }
    }, [socket]);

    const value = {
        socket,
        connected,
        isReconnecting,
        joinQuiz,
        leaveQuiz,
        startQuiz,
        endQuiz,
        nextQuestion,
        submitAnswer,
        reportTabSwitch,
        completeQuiz,
        on,
        off
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
};

export default SocketContext;
