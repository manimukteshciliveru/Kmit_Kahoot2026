import React, { useMemo } from 'react';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie, Legend
} from 'recharts';
import { FiAward, FiZap, FiTarget, FiClock, FiCheckCircle, FiBarChart2 } from 'react-icons/fi';
import './StudentVisualReport.css';

const StudentVisualReport = ({ report, analytics, user }) => {

    // 1. Topic Mastery (Radar Chart)
    const topicData = useMemo(() => {
        const topics = {};
        (report.quizId?.questions || []).forEach(q => {
            const topic = q.topic || 'General';
            if (!topics[topic]) topics[topic] = { topic, total: 0, correct: 0 };
            topics[topic].total++;
        });

        (report.answers || []).forEach(ans => {
            const q = (report.quizId?.questions || []).find(q => q._id === ans.questionId);
            const topic = q?.topic || 'General';
            if (topics[topic] && ans.isCorrect) topics[topic].correct++;
        });

        return Object.values(topics).map(t => ({
            subject: t.topic,
            A: t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0,
            fullMark: 100
        }));
    }, [report]);

    // 2. Comparison Data
    const comparisonData = [
        { name: 'You', score: report.percentage, fill: 'var(--primary)' },
        { name: 'Class Avg', score: parseFloat(analytics.classAvgScore) / (report.maxPossibleScore || 1) * 100, fill: 'var(--text-muted)' }
    ];

    // 3. Average Timer Per Question (Bar Graph)
    const avgTimerData = useMemo(() => {
        const questions = report.quizId?.questions || [];
        const answers = report.answers || [];

        return questions.map((q, idx) => {
            const ans = answers.find(a => String(a.questionId) === String(q._id));
            const timeTaken = ans && ans.timeTaken ? Math.max(0, ans.timeTaken) : 0;
            return {
                name: `Q${idx + 1}`,
                "Time Taken (s)": Number((timeTaken / 1000).toFixed(1)),
                isCorrect: ans?.isCorrect || false
            };
        });
    }, [report]);

    return (
        <div className="student-visual-dashboard">
            {/* Top Row: Performance Highlights & Mastery */}
            <div className="visual-row">
                {/* Score Summary Metrics */}
                <div className="visual-card stats-summary-card">
                    <div className="card-header-visual">
                        <FiTarget className="icon-blue" />
                        <h3>Performance Snapshot</h3>
                    </div>
                    <div className="stats-grid-visual">
                        <div className="stat-box-visual primary">
                            <span className="val">{report.percentage}%</span>
                            <span className="lab">Overall Score</span>
                        </div>
                        <div className="stat-box-visual success">
                            <span className="val">{report.correctCount}</span>
                            <span className="lab">Correct</span>
                        </div>
                        <div className="stat-box-visual warning">
                            <span className="val">{Math.round((report.averageTimePerQuestion || 0) / 1000)}s</span>
                            <span className="lab">Avg Pace</span>
                        </div>
                        <div className="stat-box-visual info">
                            <span className="val">{report.totalScore}</span>
                            <span className="lab">Points Earnt</span>
                        </div>
                    </div>
                </div>

                {/* Radar Mastery Chart */}
                <div className="visual-card mastery-card">
                    <div className="card-header-visual">
                        <FiZap className="icon-emerald" />
                        <h3>Topic Mastery Radar</h3>
                    </div>
                    <div className="chart-container-radar">
                        <ResponsiveContainer width="100%" height={250}>
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={topicData}>
                                <PolarGrid stroke="var(--border)" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                                <Radar
                                    name="Proficiency"
                                    dataKey="A"
                                    stroke="var(--primary)"
                                    fill="var(--primary)"
                                    fillOpacity={0.5}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Middle Row: Average Timer Per Question (NEW) */}
            <div className="visual-card avg-timer-card full-width-card">
                <div className="card-header-visual">
                    <FiBarChart2 className="icon-blue" />
                    <h3>Time Taken Per Question</h3>
                </div>
                <div className="chart-container-timer">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={avgTimerData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                            <defs>
                                <linearGradient id="correctGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.9} />
                                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.5} />
                                </linearGradient>
                                <linearGradient id="incorrectGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.9} />
                                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0.5} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontWeight: 600 }}
                            />
                            <YAxis
                                unit="s"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                contentStyle={{
                                    borderRadius: '12px',
                                    border: 'none',
                                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                                    background: 'var(--bg-card)',
                                    color: 'var(--text-primary)'
                                }}
                            />
                            <Legend verticalAlign="top" height={36} />
                            <Bar dataKey="Time Taken (s)" radius={[4, 4, 0, 0]} barSize={36}>
                                {avgTimerData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.isCorrect ? 'url(#correctGrad)' : 'url(#incorrectGrad)'}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    <div className="timer-legend">
                        <span className="legend-dot correct"></span> Correct
                        <span className="legend-dot incorrect"></span> Incorrect / Unanswered
                    </div>
                </div>
            </div>

            {/* Bottom Row: Speed & Comparison */}
            <div className="visual-row">
                <div className="visual-card speed-card">
                    <div className="card-header-visual">
                        <FiClock className="icon-rose" />
                        <h3>Speed vs Accuracy</h3>
                    </div>
                    <div className="speed-metrics-visual">
                        <div className="v-metric">
                            <span className="v-label">Personal Time</span>
                            <span className="v-value">{Math.max(0, parseFloat(analytics.avgTime || 0)).toFixed(1)}s <small>/ q</small></span>
                        </div>
                        <div className="v-metric">
                            <span className="v-label">Class Avg</span>
                            <span className="v-value">{Math.max(0, parseFloat(analytics.classAvgTime || 0)).toFixed(1)}s <small>/ q</small></span>
                        </div>
                        <div className="speed-comparer">
                            {parseFloat(analytics.avgTime) < parseFloat(analytics.classAvgTime) ? (
                                <span className="badge-fresh success">Faster than Avg ⚡</span>
                            ) : (
                                <span className="badge-fresh warning">Steady & Careful 🐢</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="visual-card comparison-card">
                    <div className="card-header-visual">
                        <FiCheckCircle className="icon-blue" />
                        <h3>Score vs Class</h3>
                    </div>
                    <div className="chart-container-bar">
                        <ResponsiveContainer width="100%" height={150}>
                            <BarChart data={comparisonData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                <YAxis hide domain={[0, 100]} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="score" radius={[8, 8, 0, 0]} barSize={40}>
                                    {comparisonData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentVisualReport;
