const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

// @desc    Get all users (with filters)
// @route   GET /api/users
// @access  Private (Admin)
exports.getUsers = async (req, res) => {
    try {
        const { role, status, search, page = 1, limit = 20 } = req.query;

        let query = {};

        if (role && role !== 'all') query.role = role;
        if (status === 'active') query.isActive = true;
        if (status === 'inactive') query.isActive = false;

        if (req.query.department) query.department = req.query.department;
        if (req.query.section) query.section = req.query.section;

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { studentId: { $regex: search, $options: 'i' } },
                { employeeId: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch users',
            error: error.message
        });
    }
};

// @desc    Get single user
// @route   GET /api/users/:id
// @access  Private (Admin)
exports.getUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get additional stats
        const quizzesTaken = await Response.countDocuments({ userId: user._id });
        const quizzesCreated = await Quiz.countDocuments({ createdBy: user._id });

        res.status(200).json({
            success: true,
            data: {
                user,
                additionalStats: {
                    quizzesTaken,
                    quizzesCreated
                }
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch user',
            error: error.message
        });
    }
};

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (Admin)
exports.updateUser = async (req, res) => {
    try {
        const { name, email, role, isActive } = req.body;

        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admin from demoting themselves
        if (req.user._id.toString() === req.params.id && role && role !== 'admin') {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own role'
            });
        }

        const updates = {};
        if (name) updates.name = name;
        if (email) updates.email = email;
        if (role) updates.role = role;
        if (typeof isActive === 'boolean') updates.isActive = isActive;

        const updatedUser = await User.findByIdAndUpdate(
            req.params.id,
            updates,
            { new: true, runValidators: true }
        ).select('-password');

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: { user: updatedUser }
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user',
            error: error.message
        });
    }
};

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (Admin)
exports.deleteUser = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admin from deleting themselves
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete your own account'
            });
        }

        // Delete user's responses
        await Response.deleteMany({ userId: user._id });

        // For faculty, delete their quizzes and associated responses
        if (user.role === 'faculty') {
            const userQuizzes = await Quiz.find({ createdBy: user._id });
            for (const quiz of userQuizzes) {
                await Response.deleteMany({ quizId: quiz._id });
            }
            await Quiz.deleteMany({ createdBy: user._id });
        }

        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({
            success: true,
            message: 'User deleted successfully'
        });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete user',
            error: error.message
        });
    }
};

// @desc    Toggle user status
// @route   PUT /api/users/:id/status
// @access  Private (Admin)
exports.toggleUserStatus = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent admin from deactivating themselves
        if (req.user._id.toString() === req.params.id) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change your own status'
            });
        }

        user.isActive = !user.isActive;
        await user.save();

        res.status(200).json({
            success: true,
            message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
            data: { user }
        });
    } catch (error) {
        console.error('Toggle user status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle user status',
            error: error.message
        });
    }
};

// @desc    Create user (admin creating faculty/student)
// @route   POST /api/users
// @access  Private (Admin)
exports.createUser = async (req, res) => {
    try {
        const {
            name, email, password, role,
            // Student fields
            studentId, department, year, section, phone,
            // Faculty fields
            employeeId, designation, subjects
        } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide name, email and password'
            });
        }

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Determine avatar color based on role
        const avatarColor = role === 'admin' ? 'EF4444' : role === 'faculty' ? '7C3AED' : '10B981';

        // Build user data
        const userData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: role || 'student',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${avatarColor}&color=fff&size=128`
        };

        // Add student-specific fields
        if (role === 'student') {
            if (studentId) userData.studentId = studentId.trim();
            if (department) userData.department = department;
            if (year) userData.year = year;
            if (section) userData.section = section;
            if (phone) userData.phone = phone.trim();
        }

        // Add faculty-specific fields
        if (role === 'faculty') {
            if (employeeId) userData.employeeId = employeeId.trim();
            if (designation) userData.designation = designation;
            if (subjects) userData.subjects = subjects;
            if (phone) userData.phone = phone.trim();
        }

        const user = await User.create(userData);

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    avatar: user.avatar,
                    isActive: user.isActive
                }
            }
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create user',
            error: error.message
        });
    }
};

// @desc    Get platform analytics
// @route   GET /api/users/analytics
// @access  Private (Admin)
exports.getAnalytics = async (req, res) => {
    try {
        // User stats
        const totalUsers = await User.countDocuments();
        const totalStudents = await User.countDocuments({ role: 'student' });
        const totalFaculty = await User.countDocuments({ role: 'faculty' });
        const totalAdmins = await User.countDocuments({ role: 'admin' });
        const activeUsers = await User.countDocuments({ isActive: true });

        // Quiz stats
        const totalQuizzes = await Quiz.countDocuments();
        const activeQuizzes = await Quiz.countDocuments({ status: 'active' });
        const completedQuizzes = await Quiz.countDocuments({ status: 'completed' });

        // Response stats
        const totalResponses = await Response.countDocuments();
        const completedResponses = await Response.countDocuments({ status: 'completed' });

        // Recent activity
        const recentUsers = await User.find()
            .select('name email role createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        const recentQuizzes = await Quiz.find()
            .populate('createdBy', 'name')
            .select('title code status createdAt')
            .sort({ createdAt: -1 })
            .limit(5);

        // Monthly stats
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

        const monthlyNewUsers = await User.countDocuments({
            createdAt: { $gte: monthStart }
        });

        const monthlyQuizzes = await Quiz.countDocuments({
            createdAt: { $gte: monthStart }
        });

        res.status(200).json({
            success: true,
            data: {
                users: {
                    total: totalUsers,
                    students: totalStudents,
                    faculty: totalFaculty,
                    admins: totalAdmins,
                    active: activeUsers,
                    monthlyNew: monthlyNewUsers
                },
                quizzes: {
                    total: totalQuizzes,
                    active: activeQuizzes,
                    completed: completedQuizzes,
                    monthlyNew: monthlyQuizzes
                },
                responses: {
                    total: totalResponses,
                    completed: completedResponses
                },
                recent: {
                    users: recentUsers,
                    quizzes: recentQuizzes
                }
            }
        });
    } catch (error) {
        console.error('Get analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch analytics',
            error: error.message
        });
    }
};

// @desc    Search students by branch/section
// @route   POST /api/users/search-students
// @access  Private (Admin/Faculty)
exports.searchStudents = async (req, res) => {
    try {
        const { branches } = req.body;
        // branches structure: [{ name: 'CSE', sections: ['A', 'B'] }, ...]

        if (!branches || !Array.isArray(branches) || branches.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const conditions = branches.map(b => {
            const deptName = b.name || b;
            if (!deptName) return null;

            const cond = {
                department: deptName,
                role: 'student',
                isActive: true
            };

            if (b.sections && Array.isArray(b.sections) && b.sections.length > 0) {
                cond.section = { $in: b.sections };
            }

            return cond;
        }).filter(Boolean);

        if (conditions.length === 0) {
            return res.status(200).json({ success: true, count: 0, data: [] });
        }

        const students = await User.find({ $or: conditions })
            .select('_id name email department section rollNumber studentId')
            .sort({ rollNumber: 1, name: 1 });

        res.status(200).json({
            success: true,
            count: students.length,
            data: students
        });
    } catch (error) {
        console.error('Search students error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search students',
            error: error.message
        });
    }
};

// @desc    Bulk create users from CSV/Excel file
// @route   POST /api/users/bulk
// @access  Private (Admin)
exports.bulkCreateUsers = async (req, res) => {
    const fs = require('fs');
    const xlsx = require('xlsx');
    const path = require('path');

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Please upload a file'
            });
        }

        const accountType = req.body.accountType || 'student';
        const filePath = req.file.path;
        const ext = path.extname(req.file.originalname).toLowerCase();

        let rows = [];

        // Parse file based on type
        if (ext === '.csv') {
            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n').filter(line => line.trim());
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));

            rows = lines.slice(1).map((line, index) => {
                const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
                const row = { _rowIndex: index + 2 };
                headers.forEach((h, i) => {
                    row[h] = values[i] || '';
                });
                return row;
            });
        } else {
            // Excel file
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(worksheet);

            rows = jsonData.map((row, index) => {
                const normalizedRow = { _rowIndex: index + 2 };
                Object.keys(row).forEach(key => {
                    normalizedRow[key.toLowerCase().replace(/\s+/g, '')] = String(row[key]).trim();
                });
                return normalizedRow;
            });
        }

        // Clean up file
        fs.unlinkSync(filePath);

        if (rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No data found in file'
            });
        }

        const results = {
            created: 0,
            skipped: 0,
            errors: []
        };

        const createdUsers = [];

        for (const row of rows) {
            try {
                const name = row.name || row.fullname || row.studentname || row.teachername || '';

                if (!name) {
                    results.errors.push({ row: row._rowIndex, message: 'Missing name' });
                    results.skipped++;
                    continue;
                }

                let identifier, email, password;

                if (accountType === 'student') {
                    identifier = row.rollnumber || row.rollno || row.studentid || row.id || '';
                    if (!identifier) {
                        results.errors.push({ row: row._rowIndex, message: 'Missing roll number' });
                        results.skipped++;
                        continue;
                    }
                    // Generate email from roll number
                    email = `${identifier.toLowerCase()}@student.quiz.com`;
                    // Generate password: rollnumber@123
                    password = `${identifier}@123`;
                } else {
                    identifier = row.employeeid || row.empid || row.facultyid || row.id || '';
                    if (!identifier) {
                        results.errors.push({ row: row._rowIndex, message: 'Missing employee ID' });
                        results.skipped++;
                        continue;
                    }
                    email = `${identifier.toLowerCase()}@faculty.quiz.com`;
                    password = `${identifier}@123`;
                }

                // Check if user already exists
                const existingUser = await User.findOne({
                    $or: [
                        { email: email.toLowerCase() },
                        { studentId: identifier },
                        { employeeId: identifier }
                    ]
                });

                if (existingUser) {
                    results.errors.push({ row: row._rowIndex, message: `User with ID ${identifier} already exists` });
                    results.skipped++;
                    continue;
                }

                // Determine avatar color
                const avatarColor = accountType === 'faculty' ? '7C3AED' : '10B981';

                // Build user data
                const userData = {
                    name: name.trim(),
                    email: email.toLowerCase(),
                    password: password,
                    role: accountType,
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${avatarColor}&color=fff&size=128`
                };

                // Add role-specific fields
                if (accountType === 'student') {
                    userData.studentId = identifier;
                    userData.section = row.section || row.sec || '';
                    userData.department = row.department || row.dept || row.branch || '';
                    userData.year = row.year || row.semester || row.sem || '';
                    userData.phone = row.phone || row.mobile || row.phonenumber || '';
                } else {
                    userData.employeeId = identifier;
                    userData.designation = row.designation || row.position || row.title || '';
                    userData.department = row.department || row.dept || '';
                    userData.phone = row.phone || row.mobile || row.phonenumber || '';
                }

                const user = await User.create(userData);
                createdUsers.push({
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    identifier: identifier,
                    defaultPassword: password
                });
                results.created++;

            } catch (err) {
                console.error(`Error creating user from row ${row._rowIndex}:`, err.message);
                results.errors.push({ row: row._rowIndex, message: err.message });
                results.skipped++;
            }
        }

        res.status(200).json({
            success: true,
            message: `Bulk upload completed: ${results.created} created, ${results.skipped} skipped`,
            created: results.created,
            skipped: results.skipped,
            errors: results.errors,
            users: createdUsers
        });

    } catch (error) {
        console.error('Bulk create error:', error);
        // Clean up file if it exists
        if (req.file && req.file.path) {
            const fs = require('fs');
            if (fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
        }
        res.status(500).json({
            success: false,
            message: 'Failed to process bulk upload',
            error: error.message
        });
    }
};
