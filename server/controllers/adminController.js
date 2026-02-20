const os = require('os');
const mongoose = require('mongoose');
const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Response = require('../models/Response');

// @desc    Get system health and detailed statistics
// @route   GET /api/admin/health
// @access  Private (Admin)
exports.getSystemHealth = async (req, res) => {
    try {
        // System stats
        const uptime = os.uptime();
        const loadAvg = os.loadavg();
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsage = (usedMem / totalMem) * 100;

        // Database stats
        const dbState = mongoose.connection.readyState;
        const dbStatus = dbState === 1 ? 'Connected' : dbState === 2 ? 'Connecting' : 'Disconnected';

        // App stats
        const userCount = await User.countDocuments();
        const quizCount = await Quiz.countDocuments();
        const responseCount = await Response.countDocuments();

        // Simple mock for "active" users (e.g., logged in recently or created recently)
        // For real implementation, you'd track lastLogin date
        const activeUsers = await User.countDocuments({
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });

        res.status(200).json({
            success: true,
            data: {
                system: {
                    platform: os.platform(),
                    arch: os.arch(),
                    uptime: uptime,
                    loadAverage: loadAvg,
                    memory: {
                        total: totalMem,
                        free: freeMem,
                        used: usedMem,
                        usagePercentage: memoryUsage.toFixed(2)
                    },
                    cpus: os.cpus().length
                },
                database: {
                    status: dbStatus,
                    host: mongoose.connection.host,
                    name: mongoose.connection.name
                },
                application: {
                    users: {
                        total: userCount,
                        active: activeUsers
                    },
                    quizzes: {
                        total: quizCount
                    },
                    responses: {
                        total: responseCount
                    }
                },
                timestamp: new Date()
            }
        });
    } catch (error) {
        console.error('Get system health error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve system health'
        });
    }
};

// @desc    Create a full database backup (JSON export)
// @route   GET /api/admin/backup
// @access  Private (Admin)
exports.createBackup = async (req, res) => {
    try {
        console.log('Starting backup process...');

        const users = await User.find().lean();
        const quizzes = await Quiz.find().lean();
        const responses = await Response.find().lean();

        const backupData = {
            metadata: {
                version: '1.0',
                timestamp: new Date(),
                exportedBy: req.user._id,
                counts: {
                    users: users.length,
                    quizzes: quizzes.length,
                    responses: responses.length
                }
            },
            data: {
                users,
                quizzes,
                responses
            }
        };

        const fileName = `quizmaster_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);

        res.status(200).send(JSON.stringify(backupData, null, 2));

    } catch (error) {
        console.error('Create backup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create backup'
        });
    }
};

// @desc    Restore database from backup
// @route   POST /api/admin/restore
// @access  Private (Admin)
exports.restoreBackup = async (req, res) => {
    const axios = require('axios');
    const fs = require('fs');

    try {
        if (!req.file && !req.body.data) {
            return res.status(400).json({
                success: false,
                message: 'No backup file provided'
            });
        }

        let backupData;

        // Handle file upload (if using multer) or JSON body
        if (req.file) {
            const filePath = req.file.path;
            let fileContent;

            if (filePath.startsWith('http')) {
                const response = await axios.get(filePath);
                // Axios might parse it automatically if Content-Type is application/json
                backupData = response.data;
            } else {
                fileContent = fs.readFileSync(filePath, 'utf-8');
                backupData = JSON.parse(fileContent);
                // Clean up local file
                fs.unlinkSync(filePath);
            }
        } else if (req.body.data) {
            backupData = req.body;
        } else {
            // If parsed by express.json directly
            backupData = req.body;
        }

        if (!backupData.data || !backupData.metadata) {
            return res.status(400).json({
                success: false,
                message: 'Invalid backup file format'
            });
        }

        const { users, quizzes, responses } = backupData.data;

        // Restore Users
        if (users && users.length > 0) {
            // Using bulkWrite for upsert
            const userOps = users.map(user => ({
                updateOne: {
                    filter: { _id: user._id },
                    update: { $set: user },
                    upsert: true
                }
            }));
            await User.bulkWrite(userOps);
        }

        // Restore Quizzes
        if (quizzes && quizzes.length > 0) {
            const quizOps = quizzes.map(quiz => ({
                updateOne: {
                    filter: { _id: quiz._id },
                    update: { $set: quiz },
                    upsert: true
                }
            }));
            await Quiz.bulkWrite(quizOps);
        }

        // Restore Responses
        if (responses && responses.length > 0) {
            const responseOps = responses.map(resp => ({
                updateOne: {
                    filter: { _id: resp._id },
                    update: { $set: resp },
                    upsert: true
                }
            }));
            await Response.bulkWrite(responseOps);
        }

        res.status(200).json({
            success: true,
            message: 'Database restored successfully',
            details: {
                usersRestored: users?.length || 0,
                quizzesRestored: quizzes?.length || 0,
                responsesRestored: responses?.length || 0
            }
        });

    } catch (error) {
        console.error('Restore backup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to restore backup: ' + error.message
        });
    }
};

// @desc    Get all users (admin only)
// @route   GET /api/admin/users
// @access  Private (Admin)
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find({})
            .select('-password')
            .sort({ createdAt: -1 });

        const userStats = {
            total: users.length,
            byRole: {
                student: users.filter(u => u.role === 'student').length,
                faculty: users.filter(u => u.role === 'faculty').length,
                admin: users.filter(u => u.role === 'admin').length
            }
        };

        res.status(200).json({
            success: true,
            data: {
                users,
                stats: userStats
            }
        });
    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve users'
        });
    }
};

// @desc    Update user role (admin only)
// @route   PUT /api/admin/users/:id/role
// @access  Private (Admin)
exports.updateUserRole = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        // Validate role
        if (!['student', 'faculty', 'admin'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be: student, faculty, or admin'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const oldRole = user.role;
        user.role = role;
        await user.save();

        console.log(`✅ Admin ${req.user.name} changed ${user.name}'s role from '${oldRole}' to '${role}'`);

        res.status(200).json({
            success: true,
            message: `User role updated from '${oldRole}' to '${role}'`,
            data: {
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                },
                changedBy: req.user.name
            }
        });
    } catch (error) {
        console.error('Update user role error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update user role'
        });
    }
};

// @desc    Auto-fix user roles (promote quiz creators to faculty)
// @route   POST /api/admin/users/auto-fix-roles
// @access  Private (Admin)
exports.autoFixUserRoles = async (req, res) => {
    try {
        console.log('🔧 Starting auto-fix user roles process...');

        // Find all students who created quizzes
        const studentsWithQuizzes = await User.find({
            role: 'student',
            'stats.quizzesCreated': { $gt: 0 }
        });

        if (studentsWithQuizzes.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No inconsistencies found',
                data: {
                    fixed: 0,
                    details: []
                }
            });
        }

        const fixedUsers = [];

        for (const user of studentsWithQuizzes) {
            user.role = 'faculty';
            await user.save();
            console.log(`✅ Promoted ${user.name} to faculty (created ${user.stats.quizzesCreated} quiz(zes))`);

            fixedUsers.push({
                id: user._id,
                name: user.name,
                email: user.email,
                oldRole: 'student',
                newRole: 'faculty',
                quizzesCreated: user.stats.quizzesCreated
            });
        }

        res.status(200).json({
            success: true,
            message: `Fixed ${fixedUsers.length} user role(s)`,
            data: {
                fixed: fixedUsers.length,
                details: fixedUsers
            }
        });
    } catch (error) {
        console.error('Auto-fix user roles error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to auto-fix user roles'
        });
    }
};
