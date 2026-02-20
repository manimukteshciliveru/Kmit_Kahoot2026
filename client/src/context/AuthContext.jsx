import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            const storedToken = localStorage.getItem('token');
            if (storedToken) {
                try {
                    const response = await authAPI.getMe();
                    setUser(response.data.data.user);
                    setToken(storedToken);
                } catch (error) {
                    console.error('Auth init failed:', error);
                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('user');
                    setToken(null);
                    setUser(null);
                }
            }
            setLoading(false);
        };

        initAuth();
    }, []);

    const login = async (email, password, role) => {
        try {
            console.log('🔐 [AUTH] Attempting login with email:', email);
            const response = await authAPI.login({ email, password, role });
            console.log('🔐 [AUTH] Login response received:', response.status);

            // Handle if the response comes from a cached promise (Idempotency) or fresh request
            const data = response.data?.data || response.data;
            const { user: userData, token: authToken, refreshToken } = data;

            if (!authToken) {
                console.error('❌ [AUTH] No token received from server');
                return {
                    success: false,
                    message: 'Authentication failed - no token received'
                };
            }

            localStorage.setItem('token', authToken);
            localStorage.setItem('user', JSON.stringify(userData));
            
            // Store refresh token if provided (for automatic token refresh)
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }

            setToken(authToken);
            setUser(userData);

            console.log('✅ [AUTH] Login successful for user:', userData?.email);

            return { success: true, user: userData };
        } catch (error) {
            console.error('❌ [AUTH] Login Error:', {
                status: error.response?.status,
                message: error.response?.data?.message,
                error: error.message
            });

            const errorMessage = error.response?.data?.message || error.message || 'Login failed. Please check your credentials.';

            return {
                success: false,
                message: errorMessage
            };
        }
    };

    const register = async (name, email, password, role = 'student', registrationData = {}) => {
        try {
            const signupData = { name, email, password, role, ...registrationData };
            const response = await authAPI.register(signupData);
            const { user: userData, token: authToken, refreshToken } = response.data.data;

            localStorage.setItem('token', authToken);
            localStorage.setItem('user', JSON.stringify(userData));
            
            // Store refresh token if provided
            if (refreshToken) {
                localStorage.setItem('refreshToken', refreshToken);
            }

            setToken(authToken);
            setUser(userData);

            return { success: true, user: userData };
        } catch (error) {
            return {
                success: false,
                message: error.response?.data?.message || 'Registration failed'
            };
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
    };

    const updateUser = (userData) => {
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
    };

    const value = {
        user,
        token,
        loading,
        isAuthenticated: !!token && !!user,
        login,
        register,
        logout,
        updateUser
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
