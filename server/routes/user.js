const express = require('express');
const router = express.Router();
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
const { documentUpload } = require('../utils/cloudinary');
const validate = require('../middleware/validate');
const { createUser: createUserSchema, updateUser: updateUserSchema } = require('../validations/user.validation');

// All routes require authentication
router.use(protect);

// Allow Faculty to search students
router.post('/search-students', authorize('admin', 'faculty'), searchStudents);

// From here on, restrict to Admin only
router.use(authorize('admin'));

// Analytics
router.get('/analytics', getAnalytics);

// Bulk Upload
router.post('/bulk', documentUpload.single('file'), bulkCreateUsers);

// User CRUD
router.route('/')
    .get(getUsers)
    .post(validate(createUserSchema), createUser);

router.route('/:id')
    .get(getUser)
    .put(validate(updateUserSchema), updateUser)
    .delete(deleteUser);

router.put('/:id/status', toggleUserStatus);

module.exports = router;
