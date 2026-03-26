import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Initialize state from localStorage
    useEffect(() => {
        const storedUser = localStorage.getItem('currentUser');
        if (storedUser) {
            setUser(JSON.parse(storedUser));
            setIsAuthenticated(true);
        }
        setLoading(false);
    }, []);

    const login = (email, password) => {
        const usersString = localStorage.getItem('users');
        const users = usersString ? JSON.parse(usersString) : [];

        const foundUser = users.find(u => u.email === email && u.password === password);

        if (foundUser) {
            const userWithoutPassword = { ...foundUser };
            delete userWithoutPassword.password;
            
            setUser(userWithoutPassword);
            setIsAuthenticated(true);
            localStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
            return { success: true };
        } else {
            return { success: false, message: '이메일 또는 비밀번호가 일치하지 않습니다.' };
        }
    };

    const signup = (userData) => {
        const usersString = localStorage.getItem('users');
        const users = usersString ? JSON.parse(usersString) : [];

        // Check if user already exists
        if (users.find(u => u.email === userData.email)) {
            return { success: false, message: '이미 가입된 이메일입니다.' };
        }

        const newUser = {
            ...userData,
            id: Date.now().toString(),
            createdAt: new Date().toISOString()
        };

        const updatedUsers = [...users, newUser];
        localStorage.setItem('users', JSON.stringify(updatedUsers));
        
        return { success: true };
    };

    const logout = () => {
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem('currentUser');
    };

    const getAllUsers = () => {
        const usersString = localStorage.getItem('users');
        return usersString ? JSON.parse(usersString) : [];
    };

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            user,
            loading,
            login,
            signup,
            logout,
            getAllUsers
        }}>
            {!loading && children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
