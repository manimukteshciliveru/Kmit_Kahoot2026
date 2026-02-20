const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const logger = require('./logger');

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Setup Storage for General Uploads (Avatars, Quiz Images)
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'quizmaster/general',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    },
});

// Setup Storage for Documents (AI Processing)
const documentStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'quizmaster/documents',
        resource_type: 'auto', // Dynamic resource type detection
    },
});

const upload = multer({ storage: storage });
const documentUpload = multer({ storage: documentStorage });

logger.info('✅ Cloudinary Storage initialized');

module.exports = {
    cloudinary,
    upload,
    documentUpload
};
