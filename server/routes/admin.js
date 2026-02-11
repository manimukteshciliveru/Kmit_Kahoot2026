const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ dest: 'uploads/temp/' }); // Temporary storage for restore

// All routes are protected and require 'admin' role
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/health
// @desc    Get system health and stats
router.get('/health', adminController.getSystemHealth);

// @route   GET /api/admin/backup
// @desc    Download database backup
router.get('/backup', adminController.createBackup);

// @route   POST /api/admin/restore
// @desc    Restore database from backup file
router.post('/restore', upload.single('backupFile'), adminController.restoreBackup);

// User management (specific routes BEFORE parameter routes)
// @route   POST /api/admin/users/auto-fix-roles
// @desc    Auto-fix user roles (promote quiz creators to faculty)
router.post('/users/auto-fix-roles', adminController.autoFixUserRoles);

// @route   GET /api/admin/users
// @desc    Get all users with stats
router.get('/users', adminController.getAllUsers);

// @route   PUT /api/admin/users/:userId/role
// @desc    Update user role
router.put('/users/:userId/role', adminController.updateUserRole);

module.exports = router;
