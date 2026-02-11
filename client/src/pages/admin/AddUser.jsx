import { useState, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { userAPI } from '../../services/api';
import {
    FiUserPlus,
    FiArrowLeft,
    FiUser,
    FiMail,
    FiLock,
    FiSave,
    FiBook,
    FiUsers,
    FiUpload,
    FiFileText,
    FiPhone,
    FiTrash2,
    FiCheck,
    FiX,
    FiDownload
} from 'react-icons/fi';
import toast from 'react-hot-toast';
import '../Dashboard.css';
import './AdminPages.css';

const AddUser = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);
    const [loading, setLoading] = useState(false);
    const [accountType, setAccountType] = useState(null); // 'student', 'faculty', or 'admin'
    const [uploadMode, setUploadMode] = useState(false); // true = bulk mode, false = single mode
    const [bulkUsers, setBulkUsers] = useState([]);
    const [bulkResults, setBulkResults] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        // Student-specific fields
        studentId: '',
        department: '',
        year: '',
        section: '',
        phone: '',
        // Faculty-specific fields
        employeeId: '',
        designation: '',
        subjects: ''
    });
    const [errors, setErrors] = useState({});

    const validate = () => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'Name is required';
        }

        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Invalid email format';
        }

        if (!formData.password) {
            newErrors.password = 'Password is required';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Password must be at least 6 characters';
        }

        if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Passwords do not match';
        }

        // Role-specific validation
        if (accountType === 'student') {
            if (!formData.studentId.trim()) {
                newErrors.studentId = 'Roll Number is required';
            }
        }

        if (accountType === 'faculty') {
            if (!formData.employeeId.trim()) {
                newErrors.employeeId = 'Employee ID is required';
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!validate()) return;

        setLoading(true);
        try {
            const userData = {
                name: formData.name,
                email: formData.email,
                password: formData.password,
                role: accountType
            };

            // Add role-specific data
            if (accountType === 'student') {
                userData.studentId = formData.studentId;
                userData.department = formData.department;
                userData.year = formData.year;
                userData.section = formData.section;
                userData.phone = formData.phone;
            } else if (accountType === 'faculty') {
                userData.employeeId = formData.employeeId;
                userData.designation = formData.designation;
                userData.subjects = formData.subjects;
                userData.phone = formData.phone;
            }

            await userAPI.create(userData);
            toast.success(`${accountType.charAt(0).toUpperCase() + accountType.slice(1)} account created successfully!`);
            navigate('/users');
        } catch (error) {
            console.error('Create user failed:', error);
            toast.error(error.response?.data?.message || 'Failed to create user');
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    // File Upload Handling
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target.result;
                const lines = text.split('\n').filter(line => line.trim());
                const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));

                const users = lines.slice(1).map((line, index) => {
                    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                    const user = { _rowIndex: index + 2, selected: true };

                    headers.forEach((h, i) => {
                        user[h] = values[i] || '';
                    });

                    // Map common column names
                    const name = user.name || user.fullname || user.studentname || '';
                    const rollNumber = user.rollnumber || user.rollno || user.studentid || user.id || '';
                    const section = user.section || user.sec || '';
                    const department = user.department || user.dept || user.branch || '';
                    const phone = user.phone || user.mobile || user.phonenumber || '';

                    // Generate email and password
                    const email = `${rollNumber.toLowerCase()}@student.quiz.com`;
                    const password = `${rollNumber}@123`;

                    return {
                        _rowIndex: user._rowIndex,
                        selected: true,
                        name,
                        rollNumber,
                        section,
                        department,
                        phone,
                        email,
                        password
                    };
                }).filter(u => u.name && u.rollNumber); // Only include valid rows

                setBulkUsers(users);
                setUploadMode(true);
                toast.success(`Loaded ${users.length} users from file`);
            } catch (error) {
                console.error('Parse error:', error);
                toast.error('Failed to parse file. Ensure it is a valid CSV.');
            }
        };
        reader.readAsText(file);
    };

    const toggleUserSelection = (index) => {
        setBulkUsers(prev => prev.map((u, i) =>
            i === index ? { ...u, selected: !u.selected } : u
        ));
    };

    const removeUser = (index) => {
        setBulkUsers(prev => prev.filter((_, i) => i !== index));
    };

    const handleBulkSubmit = async () => {
        const selectedUsers = bulkUsers.filter(u => u.selected);
        if (selectedUsers.length === 0) {
            toast.error('Please select at least one user');
            return;
        }

        setLoading(true);
        const results = { success: 0, failed: 0, errors: [] };

        for (const user of selectedUsers) {
            try {
                await userAPI.create({
                    name: user.name,
                    email: user.email,
                    password: user.password,
                    role: 'student',
                    studentId: user.rollNumber,
                    section: user.section,
                    department: user.department,
                    phone: user.phone
                });
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    name: user.name,
                    rollNumber: user.rollNumber,
                    message: error.response?.data?.message || 'Failed to create'
                });
            }
        }

        setBulkResults(results);
        setLoading(false);

        if (results.success > 0) {
            toast.success(`Created ${results.success} users successfully!`);
        }
        if (results.failed > 0) {
            toast.error(`Failed to create ${results.failed} users`);
        }
    };

    const downloadTemplate = () => {
        const csv = `name,rollnumber,section,department,phone
John Doe,22BD1A0501,A,CSE,9876543210
Jane Smith,22BD1A0502,B,ECE,9876543211`;
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'student_template.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    // Account Type Selection Screen
    if (!accountType) {
        return (
            <div className="admin-page">
                <div className="page-header">
                    <div className="header-left">
                        <Link to="/users" className="back-btn">
                            <FiArrowLeft /> Back to Users
                        </Link>
                        <h1><FiUserPlus /> Add New User</h1>
                    </div>
                </div>

                <div className="account-type-selection">
                    <h2>Select Account Type</h2>
                    <p>Choose the type of account you want to create</p>

                    <div className="account-type-cards">
                        <div
                            className="account-type-card student"
                            onClick={() => setAccountType('student')}
                        >
                            <div className="card-icon">
                                <FiBook />
                            </div>
                            <h3>Student Account</h3>
                            <p>For students who will participate in quizzes and view their results</p>
                            <ul>
                                <li>Join quizzes via code</li>
                                <li>View quiz history</li>
                                <li>Track performance</li>
                                <li><strong>Supports bulk upload!</strong></li>
                            </ul>
                        </div>

                        <div
                            className="account-type-card faculty"
                            onClick={() => setAccountType('faculty')}
                        >
                            <div className="card-icon">
                                <FiUsers />
                            </div>
                            <h3>Teacher Account</h3>
                            <p>For teachers/faculty who will create and conduct quizzes</p>
                            <ul>
                                <li>Create quizzes</li>
                                <li>Use AI generation</li>
                                <li>Host live sessions</li>
                                <li>View analytics</li>
                            </ul>
                        </div>

                        <div
                            className="account-type-card admin"
                            onClick={() => setAccountType('admin')}
                        >
                            <div className="card-icon">
                                <FiUser />
                            </div>
                            <h3>Admin Account</h3>
                            <p>For administrators with full system access</p>
                            <ul>
                                <li>Manage all users</li>
                                <li>System settings</li>
                                <li>Platform analytics</li>
                                <li>Database backup</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Bulk Upload Mode for Students
    if (accountType === 'student' && uploadMode) {
        return (
            <div className="admin-page">
                <div className="page-header">
                    <div className="header-left">
                        <button onClick={() => { setUploadMode(false); setBulkUsers([]); setBulkResults(null); }} className="back-btn">
                            <FiArrowLeft /> Back to Form
                        </button>
                        <h1><FiUpload /> Bulk Upload Students</h1>
                    </div>
                    <span className="account-type-badge student">
                        {bulkUsers.filter(u => u.selected).length} Students Selected
                    </span>
                </div>

                {bulkResults ? (
                    <div className="form-card" style={{ maxWidth: '800px' }}>
                        <h3>Upload Results</h3>
                        <div className="bulk-results">
                            <div className="result-summary">
                                <div className="result-item success">
                                    <FiCheck /> {bulkResults.success} users created successfully
                                </div>
                                {bulkResults.failed > 0 && (
                                    <div className="result-item error">
                                        <FiX /> {bulkResults.failed} users failed
                                    </div>
                                )}
                            </div>
                            {bulkResults.errors.length > 0 && (
                                <div className="errors-list">
                                    <h4>Failed Users:</h4>
                                    {bulkResults.errors.map((err, i) => (
                                        <div key={i} className="error-row">
                                            <span>{err.name} ({err.rollNumber})</span>
                                            <span className="error-msg">{err.message}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="form-actions">
                                <Link to="/users" className="btn btn-primary">
                                    <FiUsers /> View All Users
                                </Link>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="bulk-preview-table">
                            <table className="preview-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>
                                            <input
                                                type="checkbox"
                                                checked={bulkUsers.every(u => u.selected)}
                                                onChange={(e) => setBulkUsers(prev => prev.map(u => ({ ...u, selected: e.target.checked })))}
                                            />
                                        </th>
                                        <th>Name</th>
                                        <th>Roll Number</th>
                                        <th>Section</th>
                                        <th>Department</th>
                                        <th>Phone</th>
                                        <th>Default Password</th>
                                        <th style={{ width: '60px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulkUsers.map((user, index) => (
                                        <tr key={index} className={user.selected ? '' : 'deselected'}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={user.selected}
                                                    onChange={() => toggleUserSelection(index)}
                                                />
                                            </td>
                                            <td>{user.name}</td>
                                            <td><code>{user.rollNumber}</code></td>
                                            <td>{user.section || '-'}</td>
                                            <td>{user.department || '-'}</td>
                                            <td>{user.phone || '-'}</td>
                                            <td><code>{user.password}</code></td>
                                            <td>
                                                <button
                                                    className="btn-icon danger"
                                                    onClick={() => removeUser(index)}
                                                    title="Remove"
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="password-note" style={{ marginTop: '20px' }}>
                            <FiLock />
                            <span>
                                <strong>Auto-generated Password:</strong> Each student will get password format: <code>rollnumber@123</code>
                                <br />Students can change their password after first login.
                            </span>
                        </div>

                        <div className="form-actions" style={{ marginTop: '24px' }}>
                            <button onClick={() => { setUploadMode(false); setBulkUsers([]); }} className="btn btn-secondary">
                                Cancel
                            </button>
                            <button onClick={handleBulkSubmit} className="btn btn-primary btn-lg" disabled={loading}>
                                {loading ? (
                                    <><span className="spinner spinner-sm"></span> Creating Users...</>
                                ) : (
                                    <><FiUserPlus /> Create {bulkUsers.filter(u => u.selected).length} Students</>
                                )}
                            </button>
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <div className="admin-page">
            <div className="page-header">
                <div className="header-left">
                    <button onClick={() => setAccountType(null)} className="back-btn">
                        <FiArrowLeft /> Change Account Type
                    </button>
                    <h1>
                        <FiUserPlus />
                        Add New {accountType === 'faculty' ? 'Teacher' : accountType.charAt(0).toUpperCase() + accountType.slice(1)}
                    </h1>
                </div>
                <span className={`account-type-badge ${accountType}`}>
                    {accountType === 'faculty' ? 'Teacher' : accountType.charAt(0).toUpperCase() + accountType.slice(1)} Account
                </span>
            </div>

            {/* Bulk Upload Option for Students */}
            {accountType === 'student' && (
                <div className="bulk-upload-section">
                    <div className="bulk-upload-card">
                        <div className="bulk-upload-info">
                            <FiUpload className="upload-icon" />
                            <div>
                                <h3>Bulk Upload Students</h3>
                                <p>Upload a CSV file with student details to create multiple accounts at once</p>
                            </div>
                        </div>
                        <div className="bulk-upload-actions">
                            <button onClick={downloadTemplate} className="btn btn-secondary">
                                <FiDownload /> Download Template
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                accept=".csv"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                            <button onClick={() => fileInputRef.current?.click()} className="btn btn-primary">
                                <FiFileText /> Upload CSV File
                            </button>
                        </div>
                    </div>
                    <div className="or-divider">
                        <span>OR add a single student manually</span>
                    </div>
                </div>
            )}

            <div className="form-card">
                <form onSubmit={handleSubmit} className="add-user-form">
                    {/* Basic Info Section */}
                    <div className="form-section">
                        <h3>Basic Information</h3>

                        <div className="form-group">
                            <label htmlFor="name">
                                <FiUser /> Full Name
                            </label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Enter full name"
                                className={errors.name ? 'error' : ''}
                            />
                            {errors.name && <span className="error-message">{errors.name}</span>}
                        </div>

                        <div className="form-group">
                            <label htmlFor="email">
                                <FiMail /> Email Address
                            </label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Enter email address"
                                className={errors.email ? 'error' : ''}
                            />
                            {errors.email && <span className="error-message">{errors.email}</span>}
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label htmlFor="password">
                                    <FiLock /> Password
                                </label>
                                <input
                                    type="password"
                                    id="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    placeholder="Enter password"
                                    className={errors.password ? 'error' : ''}
                                />
                                {errors.password && <span className="error-message">{errors.password}</span>}
                            </div>

                            <div className="form-group">
                                <label htmlFor="confirmPassword">
                                    <FiLock /> Confirm Password
                                </label>
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleChange}
                                    placeholder="Confirm password"
                                    className={errors.confirmPassword ? 'error' : ''}
                                />
                                {errors.confirmPassword && <span className="error-message">{errors.confirmPassword}</span>}
                            </div>
                        </div>
                    </div>

                    {/* Student-Specific Fields */}
                    {accountType === 'student' && (
                        <div className="form-section">
                            <h3>Student Details</h3>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="studentId">Roll Number *</label>
                                    <input
                                        type="text"
                                        id="studentId"
                                        name="studentId"
                                        value={formData.studentId}
                                        onChange={handleChange}
                                        placeholder="e.g., 22BD1A0501"
                                        className={errors.studentId ? 'error' : ''}
                                    />
                                    {errors.studentId && <span className="error-message">{errors.studentId}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="year">Year / Semester</label>
                                    <select
                                        id="year"
                                        name="year"
                                        value={formData.year}
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Year</option>
                                        <option value="1">1st Year</option>
                                        <option value="2">2nd Year</option>
                                        <option value="3">3rd Year</option>
                                        <option value="4">4th Year</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="department">Department / Branch</label>
                                    <select
                                        id="department"
                                        name="department"
                                        value={formData.department}
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Department</option>
                                        <option value="CSE">Computer Science (CSE)</option>
                                        <option value="ECE">Electronics (ECE)</option>
                                        <option value="EEE">Electrical (EEE)</option>
                                        <option value="MECH">Mechanical</option>
                                        <option value="CIVIL">Civil</option>
                                        <option value="IT">Information Technology (IT)</option>
                                        <option value="AIDS">AI & Data Science</option>
                                        <option value="OTHER">Other</option>
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="section">Section</label>
                                    <select
                                        id="section"
                                        name="section"
                                        value={formData.section}
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Section</option>
                                        <option value="A">A</option>
                                        <option value="B">B</option>
                                        <option value="C">C</option>
                                        <option value="D">D</option>
                                        <option value="E">E</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="phone"><FiPhone /> Phone Number</label>
                                <input
                                    type="tel"
                                    id="phone"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="e.g., 9876543210"
                                />
                            </div>
                        </div>
                    )}

                    {/* Faculty-Specific Fields */}
                    {accountType === 'faculty' && (
                        <div className="form-section">
                            <h3>Teacher Details</h3>

                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor="employeeId">Employee ID *</label>
                                    <input
                                        type="text"
                                        id="employeeId"
                                        name="employeeId"
                                        value={formData.employeeId}
                                        onChange={handleChange}
                                        placeholder="e.g., FAC2024001"
                                        className={errors.employeeId ? 'error' : ''}
                                    />
                                    {errors.employeeId && <span className="error-message">{errors.employeeId}</span>}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="designation">Designation</label>
                                    <select
                                        id="designation"
                                        name="designation"
                                        value={formData.designation}
                                        onChange={handleChange}
                                    >
                                        <option value="">Select Designation</option>
                                        <option value="Professor">Professor</option>
                                        <option value="Associate Professor">Associate Professor</option>
                                        <option value="Assistant Professor">Assistant Professor</option>
                                        <option value="Lecturer">Lecturer</option>
                                        <option value="Lab Instructor">Lab Instructor</option>
                                    </select>
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="subjects">Subjects (comma separated)</label>
                                <input
                                    type="text"
                                    id="subjects"
                                    name="subjects"
                                    value={formData.subjects}
                                    onChange={handleChange}
                                    placeholder="e.g., Data Structures, Algorithms, DBMS"
                                />
                            </div>

                            <div className="form-group">
                                <label htmlFor="phone"><FiPhone /> Phone Number</label>
                                <input
                                    type="tel"
                                    id="phone"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="e.g., 9876543210"
                                />
                            </div>
                        </div>
                    )}

                    {/* Admin note */}
                    {accountType === 'admin' && (
                        <div className="form-section">
                            <div className="admin-warning">
                                <strong>⚠️ Admin Account</strong>
                                <p>This account will have full system access including user management, settings, and database operations. Only create admin accounts for trusted personnel.</p>
                            </div>
                        </div>
                    )}

                    <div className="form-actions">
                        <Link to="/users" className="btn btn-secondary">
                            Cancel
                        </Link>
                        <button type="submit" className="btn btn-primary" disabled={loading}>
                            {loading ? (
                                <><span className="spinner spinner-sm"></span> Creating...</>
                            ) : (
                                <><FiSave /> Create {accountType === 'faculty' ? 'Teacher' : accountType.charAt(0).toUpperCase() + accountType.slice(1)}</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddUser;
