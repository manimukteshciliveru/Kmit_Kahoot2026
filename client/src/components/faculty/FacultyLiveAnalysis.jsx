import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area
} from 'recharts';
import {
    FiTrendingUp, FiClock, FiCheckCircle, FiUsers,
    FiPieChart, FiBarChart2, FiActivity, FiAlertCircle
} from 'react-icons/fi';

const FacultyLiveAnalysis = ({ leaderboard = [], responses = [], absentStudents = [], totalQuestions, quiz }) => {

    // 1. ATTENDANCE SUMMARY DATA
    const attendanceData = useMemo(() => {
        // Use responses as primary source for joined participants
        const attended = responses.length;
        const absent = absentStudents.length;
        const total = attended + absent;
        const rate = total > 0 ? Math.round((attended / total) * 100) : 0;

        return {
            total,
            attended,
            absent,
            rate,
            chart: [
                { name: 'Attended', value: attended, color: '#10B981' },
                { name: 'Absent', value: absent, color: '#F43F5E' }
            ]
        };
    }, [responses, absentStudents]);

    // 2. SCORE DISTRIBUTION (HISTOGRAM BINS)
    const scoreDistribution = useMemo(() => {
        const bins = [
            { name: '0-20%', range: [0, 20], count: 0 },
            { name: '21-40%', range: [21, 40], count: 0 },
            { name: '41-60%', range: [41, 60], count: 0 },
            { name: '61-80%', range: [61, 80], count: 0 },
            { name: '81-100%', range: [81, 100], count: 0 }
        ];

        responses.forEach(entry => {
            const perc = entry.percentage || 0;
            const bin = bins.find(b => perc >= b.range[0] && perc <= b.range[1]);
            if (bin) bin.count++;
        });

        return bins;
    }, [responses]);

    // 3. SECTION-WISE PERFORMANCE (BAR CHART)
    const sectionPerformance = useMemo(() => {
        const sectionsArr = {};
        responses.forEach(entry => {
            const student = entry.student || entry.userId || {};
            const sec = student.section || 'N/A';
            if (!sectionsArr[sec]) sectionsArr[sec] = { name: `Sec ${sec}`, totalScore: 0, count: 0 };
            sectionsArr[sec].totalScore += (entry.percentage || 0);
            sectionsArr[sec].count++;
        });

        return Object.values(sectionsArr).map(s => ({
            name: s.name,
            avgScore: s.count > 0 ? Math.round(s.totalScore / s.count) : 0
        })).sort((a, b) => a.name.localeCompare(b.name));
    }, [responses]);

    // 4. ACCURACY OVERVIEW (PIE CHART - Correct/Incorrect/Skipped)
    const accuracyOverview = useMemo(() => {
        let correct = 0;
        let incorrect = 0;
        let totalAnswered = 0;
        const totalExpected = responses.length * (totalQuestions || 1);

        responses.forEach(entry => {
            (entry.answers || []).forEach(ans => {
                totalAnswered++;
                if (ans.isCorrect) correct++;
                else incorrect++;
            });
        });

        const skipped = Math.max(0, totalExpected - totalAnswered);

        return [
            { name: 'Correct', value: correct, color: '#10B981' },
            { name: 'Incorrect', value: incorrect, color: '#F43F5E' },
            { name: 'Skipped', value: skipped, color: '#94A3B8' }
        ].filter(v => v.value > 0);
    }, [responses, totalQuestions]);

    // 5. QUESTION DIFFICULTY & TIME ANALYSIS (LINE/AREA CHARTS)
    const questionAnalysis = useMemo(() => {
        if (!quiz?.questions) return [];

        return quiz.questions.map((q, idx) => {
            let correct = 0;
            let attemptedCount = 0;
            let totalTime = 0;

            responses.forEach(entry => {
                const ans = (entry.answers || []).find(a =>
                    String(a.questionId) === String(q._id || q.id)
                );
                if (ans) {
                    attemptedCount++;
                    if (ans.isCorrect) correct++;
                    if (ans.timeTaken) totalTime += ans.timeTaken;
                }
            });

            return {
                name: `Q${idx + 1}`,
                accuracy: attemptedCount > 0 ? Math.round((correct / attemptedCount) * 100) : 0,
                avgTime: attemptedCount > 0 ? Number((totalTime / attemptedCount / 1000).toFixed(1)) : 0
            };
        });
    }, [responses, quiz]);

    const COLORS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B', '#0EA5E9'];

    return (
        <div className="faculty-analysis-dashboard">

            {/* --- ATTENDANCE SUMMARY (NEW) --- */}
            <div className="analysis-card visual-card attendance-card">
                <div className="card-header-visual">
                    <FiUsers className="icon-blue" />
                    <h3>Attendance Summary</h3>
                </div>
                <div className="attendance-content">
                    <div className="attendance-stats">
                        <div className="attendance-main-pill">
                            <span className="rate">{attendanceData.rate}%</span>
                            <span className="lbl">Attendance</span>
                        </div>
                        <div className="attendance-breakdown">
                            <div className="att-item">
                                <span className="val">{attendanceData.total}</span>
                                <span className="lab">Eligible</span>
                            </div>
                            <div className="att-item success">
                                <span className="val">{attendanceData.attended}</span>
                                <span className="lab">Attended</span>
                            </div>
                            <div className="att-item danger">
                                <span className="val">{attendanceData.absent}</span>
                                <span className="lab">Absent</span>
                            </div>
                        </div>
                    </div>
                    <div className="attendance-chart-container">
                        <ResponsiveContainer width="100%" height={140}>
                            <PieChart>
                                <Pie
                                    data={attendanceData.chart}
                                    innerRadius={45}
                                    outerRadius={60}
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={false} // Removed direct labels for speed/cleanliness
                                >
                                    {attendanceData.chart.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* --- SCORE DISTRIBUTION (HISTOGRAM) --- */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiBarChart2 className="icon-purple" />
                    <h3>Score Distribution (Bins)</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={scoreDistribution}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar dataKey="count" fill="#6366F1" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* --- SECTION-WISE PERFORMANCE --- */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiActivity className="icon-green" />
                    <h3>Section-wise Average Score</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={sectionPerformance}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis unit="%" axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="avgScore" fill="#10B981" radius={[4, 4, 0, 0]} barSize={40} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* --- ACCURACY OVERVIEW (PIE) --- */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiPieChart className="icon-rose" />
                    <h3>Accuracy Overview</h3>
                </div>
                <div className="chart-container-centered">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={accuracyOverview}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={85}
                                dataKey="value"
                                // Only show label if percentage > 10% to prevent overlap
                                label={({ name, percent }) => percent > 0.1 ? `${name}: ${(percent * 100).toFixed(0)}%` : ''}
                                labelLine={false}
                            >
                                {accuracyOverview.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* --- QUESTION DIFFICULTY (LINE) --- */}
            <div className="analysis-card visual-card full-width">
                <div className="card-header-visual">
                    <FiCheckCircle className="icon-emerald" />
                    <h3>Question Difficulty Analysis (%)</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={questionAnalysis}>
                            <defs>
                                <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="name" />
                            <YAxis unit="%" />
                            <Tooltip />
                            <Area
                                type="monotone"
                                dataKey="accuracy"
                                stroke="#10B981"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorAcc)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* --- TIME ANALYSIS (LINE) --- */}
            <div className="analysis-card visual-card full-width">
                <div className="card-header-visual">
                    <FiClock className="icon-yellow" />
                    <h3>Time Analysis (Average Seconds per Question)</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={questionAnalysis}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="name" />
                            <YAxis unit="s" />
                            <Tooltip />
                            <Legend />
                            <Line
                                name="Avg Time (s)"
                                type="monotone"
                                dataKey="avgTime"
                                stroke="#F59E0B"
                                strokeWidth={3}
                                dot={{ r: 6, fill: '#F59E0B' }}
                                activeDot={{ r: 8 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* --- INSIGHTS --- */}
            <div className="analysis-card visual-card full-width insight-banner">
                <div className="insight-content">
                    <FiActivity className="insight-icon" />
                    <div className="text">
                        <h4>Class Performance Insight</h4>
                        <p>
                            {questionAnalysis.length > 0 ? (
                                <>
                                    The toughest challenge for students was <strong>{questionAnalysis.sort((a, b) => a.accuracy - b.accuracy)[0].name}</strong> with only {questionAnalysis.sort((a, b) => a.accuracy - b.accuracy)[0].accuracy}% accuracy.
                                    Average response time across all questions is <strong>{(questionAnalysis.reduce((acc, q) => acc + q.avgTime, 0) / questionAnalysis.length).toFixed(1)}s</strong>.
                                </>
                            ) : 'Aggregating live student performance data...'}
                        </p>
                    </div>
                </div>
            </div>

        </div>
    );
};

export default FacultyLiveAnalysis;
