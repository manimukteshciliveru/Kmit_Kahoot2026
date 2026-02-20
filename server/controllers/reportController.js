const Quiz = require('../models/Quiz');
const Response = require('../models/Response');
const User = require('../models/User');
const excel = require('exceljs');

// Helper to format duration
const formatDuration = (ms) => {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
};

// Helper to format percentage
const formatPercentage = (val) => {
    if (typeof val !== 'number') return '0%';
    return `${Math.round(val)}%`;
};

// Helper to sanitize strings for Excel
const sanitize = (str) => {
    if (str === null || str === undefined) return 'N/A';
    return String(str).replace(/[\x00-\x1F\x7F]/g, ''); // Remove non-printable characters
};

exports.downloadReport = async (req, res) => {
    try {
        const { id } = req.params;
        const quiz = await Quiz.findById(id).populate('questions');

        if (!quiz) {
            return res.status(404).json({ success: false, message: 'Quiz not found' });
        }

        // Authorization
        if (req.user.role !== 'admin' && String(quiz.createdBy) !== String(req.user._id)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // 1. Fetch Responses
        const responses = await Response.find({ quizId: id })
            .populate('userId', 'name email rollNumber department section')
            .lean();

        // 2. Fetch Enrolled Students (for Absenteeism)
        let enrolledStudents = [];
        let isPublic = false;

        if (quiz.accessControl.isPublic) {
            isPublic = true;
            // For public quizzes, enrolled = participants (no absentees technically)
            enrolledStudents = responses.map(r => r.userId).filter(u => u);
        } else if (quiz.accessControl.mode === 'SPECIFIC') {
            enrolledStudents = await User.find({
                _id: { $in: quiz.accessControl.allowedStudents }
            }).select('name email rollNumber department section').lean();
        } else if (quiz.accessControl.allowedBranches && quiz.accessControl.allowedBranches.length > 0) {
            // Build query for branches/sections
            const conditions = quiz.accessControl.allowedBranches.map(b => {
                const cond = { department: b.name, role: 'student', isActive: true };
                if (b.sections && b.sections.length > 0) {
                    cond.section = { $in: b.sections };
                }
                return cond;
            });
            enrolledStudents = await User.find({ $or: conditions })
                .select('name email rollNumber department section').lean();
        }

        // 3. Merge Data (Map by User ID)
        const studentMap = new Map();

        // Add all enrolled first (default absent)
        enrolledStudents.forEach(student => {
            if (student) {
                studentMap.set(String(student._id), {
                    user: student,
                    response: null,
                    status: 'Absent'
                });
            }
        });

        // Update with response data (Mark Present)
        responses.forEach(response => {
            if (response.userId) {
                const uid = String(response.userId._id);
                // If student enters but wasn't in "enrolled" (e.g. public quiz or override), add them
                if (!studentMap.has(uid)) {
                    studentMap.set(uid, {
                        user: response.userId,
                        response: response,
                        status: 'Present'
                    });
                } else {
                    const entry = studentMap.get(uid);
                    entry.response = response;
                    entry.status = 'Present';
                    studentMap.set(uid, entry);
                }
            }
        });

        const allStudents = Array.from(studentMap.values());

        // 4. Generate Excel
        const workbook = new excel.Workbook();
        workbook.creator = 'QuizMaster Pro';
        workbook.created = new Date();

        // --- SHEET 1: ATTENDANCE & SUMMARY ---
        const sheet1 = workbook.addWorksheet('Attendance & Summary', {
            views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
        });

        sheet1.columns = [
            { header: 'S.No', key: 'sno', width: 6 },
            { header: 'Student Name', key: 'name', width: 25 },
            { header: 'Roll Number', key: 'roll', width: 15 },
            { header: 'Branch', key: 'branch', width: 10 },
            { header: 'Section', key: 'section', width: 10 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Joined Time', key: 'joined', width: 20 },
            { header: 'Submission Time', key: 'submitted', width: 20 },
            { header: 'Time Taken', key: 'duration', width: 15 },
            { header: 'Score', key: 'score', width: 10 },
            { header: 'Total Marks', key: 'total', width: 12 },
            { header: 'Percentage', key: 'percentage', width: 12 },
            { header: 'Accuracy', key: 'accuracy', width: 12 }
        ];

        // Style Header
        sheet1.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        sheet1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }; // Brand Blue

        allStudents.forEach((entry, index) => {
            const { user, response, status } = entry;
            const r = entry.response;

            sheet1.addRow({
                sno: index + 1,
                name: sanitize(user.name),
                roll: sanitize(user.rollNumber),
                branch: sanitize(user.department),
                section: sanitize(user.section),
                status: status,
                joined: r?.startedAt ? new Date(r.startedAt).toLocaleString() : 'N/A',
                submitted: r?.completedAt ? new Date(r.completedAt).toLocaleString() : 'N/A',
                duration: r ? formatDuration(r.totalTimeTaken) : 'N/A',
                score: r ? r.totalScore : 0,
                total: r ? r.maxPossibleScore : quiz.totalPoints, // Fallback to quiz totals if response missing
                percentage: r ? formatPercentage(r.percentage) : '0%',
                accuracy: r && r.answers.length > 0
                    ? formatPercentage((r.correctCount / r.answers.length) * 100)
                    : '0%'
            });

            // Color row if Absent
            if (status === 'Absent') {
                sheet1.getRow(index + 2).getCell('status').font = { color: { argb: 'FFFF0000' } }; // Red
            } else {
                sheet1.getRow(index + 2).getCell('status').font = { color: { argb: 'FF008000' } }; // Green
            }
        });


        // --- SHEET 2: DETAILED ANALYSIS ---
        const sheet2 = workbook.addWorksheet('Detailed Analysis', {
            views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
        });

        const detailCols = [
            { header: 'Student Name', key: 'name', width: 20 },
            { header: 'Roll Number', key: 'roll', width: 15 },
            { header: 'Q.No', key: 'qno', width: 6 },
            { header: 'Question Text', key: 'qtext', width: 40 },
            { header: 'Type', key: 'type', width: 10 },
            { header: 'Correct Answer', key: 'correct', width: 20 },
            { header: 'Student Answer', key: 'answer', width: 20 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Marks', key: 'marks', width: 8 }
        ];
        sheet2.columns = detailCols;
        sheet2.getRow(1).font = { bold: true };

        allStudents.forEach(entry => {
            if (entry.status === 'Absent' || !entry.response) return; // Skip absentees for detailed view? Or show as unattempted? Usually skip detailed rows for absent.

            const r = entry.response;

            // Map answers by questionId for quick lookup
            const answerMap = new Map();
            if (r.answers) {
                r.answers.forEach(a => answerMap.set(String(a.questionId), a));
            }

            quiz.questions.forEach((q, qIdx) => {
                const ans = answerMap.get(String(q._id));
                const studentAnswer = ans ? ans.answer : 'Not Attempted';
                const isCorrect = ans ? ans.isCorrect : false;
                const marks = ans ? ans.pointsEarned : 0;

                let status = 'Not Attempted';
                if (ans) {
                    if (ans.answer) status = isCorrect ? 'Correct' : 'Wrong';
                    else status = 'Skipped';
                }

                sheet2.addRow({
                    name: sanitize(entry.user.name),
                    roll: sanitize(entry.user.rollNumber),
                    qno: qIdx + 1,
                    qtext: sanitize(q.text),
                    type: q.type,
                    correct: sanitize(q.correctAnswer),
                    answer: sanitize(studentAnswer),
                    status: status,
                    marks: marks
                });
            });
        });

        // --- SHEET 3: BRANCH SUMMARY ---
        const sheet3 = workbook.addWorksheet('Branch Summary');
        sheet3.columns = [
            { header: 'Branch', key: 'branch', width: 15 },
            { header: 'Total Students', key: 'total', width: 15 },
            { header: 'Present', key: 'present', width: 10 },
            { header: 'Absent', key: 'absent', width: 10 },
            { header: 'Avg Score', key: 'avg', width: 12 },
            { header: 'Highest', key: 'high', width: 10 },
            { header: 'Lowest', key: 'low', width: 10 },
            { header: 'Avg Accuracy', key: 'acc', width: 15 }
        ];
        sheet3.getRow(1).font = { bold: true };

        // Group by Branch
        const branches = {};
        allStudents.forEach(e => {
            const b = e.user.department || 'Unknown';
            if (!branches[b]) {
                branches[b] = { total: 0, present: 0, scores: [], accuracies: [] };
            }
            branches[b].total++;
            if (e.status === 'Present' && e.response) {
                branches[b].present++;
                branches[b].scores.push(e.response.totalScore);
                if (e.response.answers.length > 0) {
                    branches[b].accuracies.push((e.response.correctCount / e.response.answers.length) * 100);
                }
            }
        });

        Object.keys(branches).forEach(b => {
            const data = branches[b];
            const absent = data.total - data.present;
            const avgScore = data.scores.length ? (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0;
            const high = data.scores.length ? Math.max(...data.scores) : 0;
            const low = data.scores.length ? Math.min(...data.scores) : 0;
            const avgAcc = data.accuracies.length ? (data.accuracies.reduce((a, b) => a + b, 0) / data.accuracies.length) : 0;

            sheet3.addRow({
                branch: b,
                total: data.total,
                present: data.present,
                absent: absent,
                avg: avgScore.toFixed(2),
                high: high,
                low: low,
                acc: avgAcc.toFixed(2) + '%'
            });
        });

        // --- SHEET 4: SECTION SUMMARY ---
        const sheet4 = workbook.addWorksheet('Section Summary');
        sheet4.columns = [
            { header: 'Branch', key: 'branch', width: 15 },
            { header: 'Section', key: 'section', width: 10 },
            { header: 'Total', key: 'total', width: 10 },
            { header: 'Present', key: 'present', width: 10 },
            { header: 'Absent', key: 'absent', width: 10 },
            { header: 'Avg Score', key: 'avg', width: 12 },
            { header: 'Avg Time', key: 'time', width: 15 }
        ];
        sheet4.getRow(1).font = { bold: true };

        // Group by Section (Composite Key: Branch-Section)
        const sections = {};
        allStudents.forEach(e => {
            const key = `${e.user.department || 'Unknown'}-${e.user.section || 'N/A'}`;
            if (!sections[key]) {
                sections[key] = { branch: e.user.department, section: e.user.section, total: 0, present: 0, scores: [], times: [] };
            }
            sections[key].total++;
            if (e.status === 'Present' && e.response) {
                sections[key].present++;
                sections[key].scores.push(e.response.totalScore);
                sections[key].times.push(e.response.totalTimeTaken);
            }
        });

        Object.keys(sections).forEach(k => {
            const data = sections[k];
            const avgScore = data.scores.length ? (data.scores.reduce((a, b) => a + b, 0) / data.scores.length) : 0;
            const avgTime = data.times.length ? (data.times.reduce((a, b) => a + b, 0) / data.times.length) : 0;

            sheet4.addRow({
                branch: data.branch,
                section: data.section,
                total: data.total,
                present: data.present,
                absent: data.total - data.present,
                avg: avgScore.toFixed(2),
                time: formatDuration(avgTime)
            });
        });

        // --- SHEET 5: GLOBAL METRICS ---
        const sheet5 = workbook.addWorksheet('Global Metrics');
        sheet5.columns = [
            { header: 'Metric', key: 'metric', width: 30 },
            { header: 'Value', key: 'value', width: 20 }
        ];
        sheet5.getRow(1).font = { bold: true };

        const totalAttempts = responses.length;
        const totalCompleted = responses.filter(r => r.status === 'completed').length;
        const totalScores = responses.map(r => r.percentage);
        const avgGlobalScore = totalScores.length ? (totalScores.reduce((a, b) => a + b, 0) / totalScores.length) : 0;

        const totalEnrolled = enrolledStudents.length || responses.length;
        const participationRate = totalEnrolled > 0 ? (totalAttempts / totalEnrolled) * 100 : 0;

        sheet5.addRow({ metric: 'Total Enrolled', value: totalEnrolled });
        sheet5.addRow({ metric: 'Total Attempted', value: totalAttempts });
        sheet5.addRow({ metric: 'Participation Rate (%)', value: participationRate.toFixed(1) + '%' });
        sheet5.addRow({ metric: 'Total Completed', value: totalCompleted });
        sheet5.addRow({ metric: 'Average Score (%)', value: avgGlobalScore.toFixed(2) + '%' });

        // Question Analysis for Sheet 5
        let qStats = {};
        quiz.questions.forEach(q => {
            qStats[q._id] = { correct: 0, attempts: 0, text: q.text };
        });

        responses.forEach(r => {
            if (r.answers) {
                r.answers.forEach(a => {
                    if (qStats[a.questionId]) {
                        qStats[a.questionId].attempts++;
                        if (a.isCorrect) qStats[a.questionId].correct++;
                    }
                });
            }
        });

        let hardestQ = { text: 'N/A', rate: 100 };
        let easiestQ = { text: 'N/A', rate: -1 };

        Object.values(qStats).forEach(stat => {
            if (stat.attempts > 0) {
                const rate = (stat.correct / stat.attempts) * 100;
                if (rate < hardestQ.rate) hardestQ = { text: stat.text, rate };
                if (rate > easiestQ.rate) easiestQ = { text: stat.text, rate };
            }
        });

        sheet5.addRow({ metric: 'Hardest Question', value: hardestQ.text });
        sheet5.addRow({ metric: 'Hardest Q Success Rate', value: hardestQ.rate.toFixed(1) + '%' });
        sheet5.addRow({ metric: 'Easiest Question', value: easiestQ.text });
        sheet5.addRow({ metric: 'Easiest Q Success Rate', value: easiestQ.rate.toFixed(1) + '%' });

        // Finalize Response
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=QuizReport-${sanitize(quiz.code)}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Download Report Error:', error);
        res.status(500).json({ success: false, message: 'Failed to generate report', error: error.message });
    }
};

