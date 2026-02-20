import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
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
    const { token, isAuthenticated } = useAuth();

    useEffect(() => {
        if (isAuthenticated && token) {
            // Determine Socket URL based on environment
            let socketUrl = import.meta.env.VITE_SOCKET_URL;

            if (!socketUrl) {
                if (import.meta.env.PROD) {
                    // In production, use current origin
                    socketUrl = window.location.origin;
                } else {
                    // Development fallback
                    socketUrl = 'http://localhost:5000';
                }
            }

            console.log('🔌 [SOCKET] Connecting to:', socketUrl);

            const sessionId = Math.random().toString(36).substring(7) + Date.now();

            const newSocket = io(socketUrl, {
                auth: { token, sessionId },
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000
            });

            newSocket.on('connect', () => {
                console.log('🔌 Socket connected');
                setConnected(true);
            });

            newSocket.on('disconnect', () => {
                console.log('🔌 Socket disconnected');
                setConnected(false);
            });

            newSocket.on('connect_error', (error) => {
                console.error('Socket connection error:', error.message);
                setConnected(false);
            });

            newSocket.on('error', (error) => {
                console.error('Socket error:', error);
                toast.error(error.message || 'Connection error');
            });

            setSocket(newSocket);

            return () => {
                newSocket.disconnect();
                setSocket(null);
                setConnected(false);
            };
        }
    }, [isAuthenticated, token]);

    const joinQuiz = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:join', { quizId });
        }
    }, [socket, connected]);

    const leaveQuiz = useCallback((quizId) => {
        if (socket && connected) {
            socket.emit('quiz:leave', { quizId });
        }
    }, [socket, connected]);

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
