const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const {
    getUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
    getAnalytics,
    bulkCreateUsers,
    searchStudents
} = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
        cb(null, `bulk-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['.csv', '.xlsx', '.xls'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and Excel files are allowed'));
        }
    }
});

// All routes require authentication
router.use(protect);

// Allow Faculty to search students
router.post('/search-students', authorize('admin', 'faculty'), searchStudents);

// From here on, restrict to Admin only
router.use(authorize('admin'));

// Analytics
router.get('/analytics', getAnalytics);

// Bulk Upload
router.post('/bulk', upload.single('file'), bulkCreateUsers);

// User CRUD
router.route('/')
    .get(getUsers)
    .post(createUser);

router.route('/:id')
    .get(getUser)
    .put(updateUser)
    .delete(deleteUser);

router.put('/:id/status', toggleUserStatus);

module.exports = router;
