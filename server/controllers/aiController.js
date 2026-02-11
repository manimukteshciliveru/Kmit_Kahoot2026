const multer = require('multer');
const path = require('path');
const fs = require('fs');
const aiGenerator = require('../services/aiGenerator');
const Quiz = require('../models/Quiz');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
        'text/csv',
        'text/plain',
        'audio/mpeg',
        'audio/wav',
        'audio/mp3',
        'video/mp4',
        'video/webm'
    ];

    const allowedExtensions = ['.pdf', '.xlsx', '.xls', '.csv', '.txt', '.mp3', '.wav', '.mp4', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`File type not supported. Allowed: ${allowedExtensions.join(', ')}`), false);
    }
};

exports.upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 // 50MB default
    }
});

// @desc    Generate questions from uploaded file
// @route   POST /api/ai/generate-from-file
// @access  Private (Faculty)
exports.generateFromFile = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please upload at least one file'
            });
        }

        const { count, difficulty, type, topic, quizId } = req.body;

        const options = {
            count: parseInt(count) || 10,
            difficulty: difficulty || 'medium',
            type: type || 'mcq',
            topic: topic || ''
        };

        // Prepare parts for Gemini
        const parts = [];
        let combinedTextContent = '';
        console.log(`Processing ${req.files.length} files...`);

        for (const file of req.files) {
            const ext = path.extname(file.originalname).toLowerCase();
            console.log('Processing file:', file.originalname, 'Extension:', ext);

            try {
                switch (ext) {
                    case '.pdf':
                        const pdfText = await aiGenerator.extractFromPDF(file.path);
                        combinedTextContent += `\n--- Content from ${file.originalname} (PDF) ---\n${pdfText}\n`;
                        break;
                    case '.xlsx':
                    case '.xls':
                    case '.csv':
                        const excelText = await aiGenerator.extractFromExcel(file.path);
                        combinedTextContent += `\n--- Content from ${file.originalname} (Excel/CSV) ---\n${excelText}\n`;
                        break;
                    case '.txt':
                    case '.md':
                        const txtContent = fs.readFileSync(file.path, 'utf-8');
                        combinedTextContent += `\n--- Content from ${file.originalname} (Text) ---\n${txtContent}\n`;
                        break;
                    case '.mp3':
                    case '.wav':
                    case '.mp4':
                    case '.webm':
                        // For audio/video, add as a generative part
                        parts.push(aiGenerator.fileToGenerativePart(file.path, file.mimetype));
                        combinedTextContent += `\n(Includes media file: ${file.originalname})\n`;
                        break;
                    default:
                        console.warn(`Unsupported file type: ${ext}`);
                }
            } catch (err) {
                console.error(`Error processing ${file.originalname}:`, err);
            }
        }

        // Add accumulated text as the first part if it exists
        if (combinedTextContent.trim()) {
            parts.unshift(combinedTextContent);
        }

        if (parts.length === 0) {
            // Clean up
            req.files.forEach(f => {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });
            return res.status(400).json({
                success: false,
                message: 'No valid content extracted from files.'
            });
        }

        // Generate questions using Multimodal
        const questions = await aiGenerator.generateFromMultimodal(parts, options);

        // If quizId provided, add questions to existing quiz
        if (quizId) {
            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                req.files.forEach(f => {
                    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                });
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found'
                });
            }

            if (quiz.createdBy.toString() !== req.user._id.toString()) {
                req.files.forEach(f => {
                    if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
                });
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to modify this quiz'
                });
            }

            quiz.questions.push(...questions);

            // Store info about the first file or indicate multiple
            const mainFile = req.files[0];
            quiz.sourceFile = {
                filename: req.files.length > 1 ? `${mainFile.originalname} + ${req.files.length - 1} others` : mainFile.originalname,
                fileType: req.files.length > 1 ? 'mixed' : path.extname(mainFile.originalname).slice(1),
                uploadedAt: new Date()
            };

            await quiz.save();

            // Clean up uploaded files
            req.files.forEach(f => {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });

            return res.status(200).json({
                success: true,
                message: `${questions.length} questions generated and added to quiz`,
                data: { quiz, generatedCount: questions.length }
            });
        }

        // Clean up uploaded files
        req.files.forEach(f => {
            if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });

        res.status(200).json({
            success: true,
            message: `${questions.length} questions generated successfully`,
            data: { questions }
        });
    } catch (error) {
        // Clean up files on error
        if (req.files) {
            req.files.forEach(f => {
                if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
            });
        }

        console.error('Generate from file error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate questions from files'
        });
    }
};


// @desc    Generate questions from text
// @route   POST /api/ai/generate-from-text
// @access  Private (Faculty)
exports.generateFromText = async (req, res) => {
    try {
        const { text, count, difficulty, type, topic, quizId } = req.body;

        if (!text || text.trim().length < 50) {
            return res.status(400).json({
                success: false,
                message: 'Please provide sufficient text content (at least 50 characters)'
            });
        }

        const options = {
            count: parseInt(count) || 10,
            difficulty: difficulty || 'medium',
            type: type || 'mcq',
            topic: topic || ''
        };

        const questions = await aiGenerator.generateFromText(text, options);

        // If quizId provided, add questions to existing quiz
        if (quizId) {
            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found'
                });
            }

            if (quiz.createdBy.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to modify this quiz'
                });
            }

            quiz.questions.push(...questions);
            await quiz.save();

            return res.status(200).json({
                success: true,
                message: `${questions.length} questions generated and added to quiz`,
                data: { quiz, generatedCount: questions.length }
            });
        }

        res.status(200).json({
            success: true,
            message: `${questions.length} questions generated successfully`,
            data: { questions }
        });
    } catch (error) {
        console.error('Generate from text error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate questions from text'
        });
    }
};

// @desc    Generate questions from transcript (for audio/video)
// @route   POST /api/ai/generate-from-transcript
// @access  Private (Faculty)
exports.generateFromTranscript = async (req, res) => {
    try {
        const { transcript, count, difficulty, type, topic, quizId } = req.body;

        if (!transcript || transcript.trim().length < 50) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a transcript (at least 50 characters)'
            });
        }

        const options = {
            count: parseInt(count) || 10,
            difficulty: difficulty || 'medium',
            type: type || 'mcq',
            topic: topic || 'lecture content'
        };

        const questions = await aiGenerator.generateFromTranscript(transcript, options);

        // If quizId provided, add questions to existing quiz
        if (quizId) {
            const quiz = await Quiz.findById(quizId);
            if (!quiz) {
                return res.status(404).json({
                    success: false,
                    message: 'Quiz not found'
                });
            }

            if (quiz.createdBy.toString() !== req.user._id.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'Not authorized to modify this quiz'
                });
            }

            quiz.questions.push(...questions);
            await quiz.save();

            return res.status(200).json({
                success: true,
                message: `${questions.length} questions generated and added to quiz`,
                data: { quiz, generatedCount: questions.length }
            });
        }

        res.status(200).json({
            success: true,
            message: `${questions.length} questions generated successfully`,
            data: { questions }
        });
    } catch (error) {
        console.error('Generate from transcript error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate questions from transcript'
        });
    }
};
