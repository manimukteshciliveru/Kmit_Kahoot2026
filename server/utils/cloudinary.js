const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

// Setup Disk Storage for Documents (AI Processing)
// PDFs and other documents need local access for parsing (pdf-parse, mammoth, xlsx etc.)
// Cloudinary's resource_type: 'auto' was failing for PDFs
const docTmpDir = path.join(os.tmpdir(), 'quizmaster_docs');
if (!fs.existsSync(docTmpDir)) {
    fs.mkdirSync(docTmpDir, { recursive: true });
}

const documentStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, docTmpDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `doc_${uniqueSuffix}${ext}`);
    }
});

const upload = multer({ storage: storage });
const documentUpload = multer({
    storage: documentStorage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedExts = [
            '.pdf', '.xlsx', '.xls', '.csv',
            '.doc', '.docx', '.ppt', '.pptx',
            '.txt', '.md', '.rtf',
            '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs',
            '.html', '.css', '.json', '.sql', '.go', '.rb', '.php',
            '.mp3', '.wav', '.mp4', '.webm'
        ];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowedExts.join(', ')}`));
        }
    }
});

logger.info('✅ Cloudinary Storage initialized');
logger.info(`✅ Document temp directory: ${docTmpDir}`);

module.exports = {
    cloudinary,
    upload,
    documentUpload
};
