import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { userAPI } from '../../services/api';
import {
    FiUsers,
    FiUserPlus,
    FiUpload,
    FiEdit2,
    FiTrash2,
    FiSearch,
    FiArrowLeft,
    FiCheck,
    FiX,
    FiMail,
    FiShield,
    FiBook,
    FiAward
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('students'); // 'students', 'faculty', 'admins', 'all'
    const [editingUser, setEditingUser] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', email: '' });

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const response = await userAPI.getAll();
            // API returns { data: { users: [...], pagination: {...} } }
            setUsers(response.data.data?.users || response.data.data || []);
        } catch (error) {
            console.error('Failed to fetch users:', error);
            toast.error('Failed to load users');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (userId, userName) => {
        if (!window.confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
            return;
        }

        try {
            await userAPI.delete(userId);
            toast.success('User deleted successfully');
            setUsers(users.filter(u => u._id !== userId));
        } catch (error) {
            console.error('Delete failed:', error);
            toast.error(error.response?.data?.message || 'Failed to delete user');
        }
    };

    const handleToggleStatus = async (userId) => {
        try {
            await userAPI.toggleStatus(userId);
            toast.success('User status updated');
            fetchUsers();
        } catch (error) {
            console.error('Toggle status failed:', error);
            toast.error('Failed to update user status');
        }
    };

    const startEdit = (user) => {
        setEditingUser(user._id);
        setEditForm({ name: user.name, email: user.email });
    };

    const cancelEdit = () => {
        setEditingUser(null);
        setEditForm({ name: '', email: '' });
    };

    const saveEdit = async (userId) => {
        try {
            await userAPI.update(userId, editForm);
            toast.success('User updated successfully');
            setEditingUser(null);
            fetchUsers();
        } catch (error) {
            console.error('Update failed:', error);
            toast.error(error.response?.data?.message || 'Failed to update user');
        }
    };

    // Separate users by role
    const students = users.filter(u => u.role === 'student');
    const faculty = users.filter(u => u.role === 'faculty');
    const admins = users.filter(u => u.role === 'admin');

    // Get users for current tab
    const getCurrentUsers = () => {
        switch (activeTab) {
            case 'students': return students;
            case 'faculty': return faculty;
            case 'admins': return admins;
            case 'all': return users;
            default: return students;
        }
    };

    // Filter by search
    const filteredUsers = getCurrentUsers().filter(user => {
        const searchLower = searchTerm.toLowerCase();
        return user.name.toLowerCase().includes(searchLower) ||
            user.email.toLowerCase().includes(searchLower) ||
            (user.studentId && user.studentId.toLowerCase().includes(searchLower)) ||
            (user.employeeId && user.employeeId.toLowerCase().includes(searchLower));
    });

    const getRoleIcon = (role) => {
        switch (role) {
            case 'admin': return <FiShield />;
            case 'faculty': return <FiAward />;
            case 'student': return <FiBook />;
            default: return <FiUsers />;
        }
    };

    const getTabLabel = (tab) => {
        switch (tab) {
            case 'students': return `Students (${students.length})`;
            case 'faculty': return `Teachers (${faculty.length})`;
            case 'admins': return `Admins (${admins.length})`;
            case 'all': return `All Users (${users.length})`;
            default: return tab;
        }
    };

    return (
        <div className="admin-page">
            <div className="page-header">
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn">
                        <FiArrowLeft /> Back
                    </Link>
                    <h1><FiUsers /> User Management</h1>
                </div>
                <div className="header-actions">
                    <Link to="/users/bulk" className="btn btn-secondary">
                        <FiUpload /> Bulk Upload
                    </Link>
                    <Link to="/users/new" className="btn btn-primary">
                        <FiUserPlus /> Add User
                    </Link>
                </div>
            </div>

            {/* User Type Tabs */}
            <div className="user-tabs">
                <button
                    className={`tab-btn ${activeTab === 'students' ? 'active' : ''}`}
                    onClick={() => setActiveTab('students')}
                >
                    <FiBook /> {getTabLabel('students')}
                </button>
                <button
                    className={`tab-btn ${activeTab === 'faculty' ? 'active' : ''}`}
                    onClick={() => setActiveTab('faculty')}
                >
                    <FiAward /> {getTabLabel('faculty')}
                </button>
                <button
                    className={`tab-btn ${activeTab === 'admins' ? 'active' : ''}`}
                    onClick={() => setActiveTab('admins')}
                >
                    <FiShield /> {getTabLabel('admins')}
                </button>
                <button
                    className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                    onClick={() => setActiveTab('all')}
                >
                    <FiUsers /> {getTabLabel('all')}
                </button>
            </div>

            <div className="filters-bar">
                <div className="search-box">
                    <FiSearch className="search-icon" />
                    <input
                        type="text"
                        placeholder={`Search ${activeTab === 'all' ? 'users' : activeTab} by name, email, or ID...`}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {loading ? (
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Loading users...</p>
                </div>
            ) : (
                <div className="users-table-container">
                    <table className="users-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Email</th>
                                {activeTab === 'students' && <th>Roll Number</th>}
                                {activeTab === 'students' && <th>Department</th>}
                                {activeTab === 'students' && <th>Section</th>}
                                {activeTab === 'faculty' && <th>Employee ID</th>}
                                {activeTab === 'faculty' && <th>Designation</th>}
                                {activeTab === 'all' && <th>Role</th>}
                                <th>Status</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={activeTab === 'all' ? 7 : 8} className="empty-state">
                                        {searchTerm ?
                                            `No ${activeTab === 'all' ? 'users' : activeTab} found matching "${searchTerm}"` :
                                            `No ${activeTab === 'all' ? 'users' : activeTab} registered yet.`
                                        }
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <tr key={user._id} className={editingUser === user._id ? 'editing' : ''}>
                                        <td>
                                            <div className="user-cell">
                                                <img
                                                    src={user.avatar || `https://ui-avatars.com/api/?name=${user.name}&background=${user.role === 'admin' ? '000080' : user.role === 'faculty' ? 'FF7F11' : '138808'}&color=fff`}
                                                    alt={user.name}
                                                    className="avatar-sm"
                                                />
                                                {editingUser === user._id ? (
                                                    <input
                                                        type="text"
                                                        value={editForm.name}
                                                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                                        className="edit-input"
                                                    />
                                                ) : (
                                                    <span>{user.name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            {editingUser === user._id ? (
                                                <input
                                                    type="email"
                                                    value={editForm.email}
                                                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                                    className="edit-input"
                                                />
                                            ) : (
                                                <span className="email-cell"><FiMail /> {user.email}</span>
                                            )}
                                        </td>
                                        {activeTab === 'students' && (
                                            <>
                                                <td>{user.studentId || '-'}</td>
                                                <td>{user.department || '-'}</td>
                                                <td>{user.section || '-'}</td>
                                            </>
                                        )}
                                        {activeTab === 'faculty' && (
                                            <>
                                                <td>{user.employeeId || '-'}</td>
                                                <td>{user.designation || '-'}</td>
                                            </>
                                        )}
                                        {activeTab === 'all' && (
                                            <td>
                                                <span className={`role-badge ${user.role}`}>
                                                    {getRoleIcon(user.role)} {user.role === 'faculty' ? 'Teacher' : user.role}
                                                </span>
                                            </td>
                                        )}
                                        <td>
                                            <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                                                {user.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                                        <td>
                                            <div className="action-buttons">
                                                {editingUser === user._id ? (
                                                    <>
                                                        <button className="btn-icon success" onClick={() => saveEdit(user._id)} title="Save">
                                                            <FiCheck />
                                                        </button>
                                                        <button className="btn-icon danger" onClick={cancelEdit} title="Cancel">
                                                            <FiX />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="btn-icon primary" onClick={() => startEdit(user)} title="Edit">
                                                            <FiEdit2 />
                                                        </button>
                                                        <button
                                                            className={`btn-icon ${user.isActive ? 'warning' : 'success'}`}
                                                            onClick={() => handleToggleStatus(user._id)}
                                                            title={user.isActive ? 'Deactivate' : 'Activate'}
                                                        >
                                                            {user.isActive ? <FiX /> : <FiCheck />}
                                                        </button>
                                                        <button
                                                            className="btn-icon danger"
                                                            onClick={() => handleDelete(user._id, user.name)}
                                                            title="Delete"
                                                        >
                                                            <FiTrash2 />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="table-footer">
                <span>Showing {filteredUsers.length} {activeTab === 'all' ? 'users' : activeTab}</span>
            </div>
        </div>
    );
};

export default UserManagement;
