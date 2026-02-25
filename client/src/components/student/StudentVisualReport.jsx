import React, { useMemo } from 'react';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, PieChart, Pie
} from 'recharts';
import { FiAward, FiZap, FiTarget, FiClock, FiCheckCircle } from 'react-icons/fi';
import './StudentVisualReport.css';

const StudentVisualReport = ({ report, analytics, leaderboard, user }) => {

    // 1. Podium Data (Top 3)
    const podiumData = useMemo(() => {
        return leaderboard.slice(0, 3).map((lb, idx) => ({
            rank: idx + 1,
            name: lb.userId?.name || lb.studentName,
            score: lb.totalScore,
            isMe: String(lb.userId?._id || lb.studentId) === String(user?._id)
        }));
    }, [leaderboard, user]);

    // 2. Topic Mastery (Radar Chart)
    const topicData = useMemo(() => {
        const topics = {};
        report.quizId.questions.forEach(q => {
            const topic = q.topic || 'General';
            if (!topics[topic]) topics[topic] = { topic, total: 0, correct: 0 };
            topics[topic].total++;
        });

        report.answers.forEach(ans => {
            const q = report.quizId.questions.find(q => q._id === ans.questionId);
            const topic = q?.topic || 'General';
            if (topics[topic] && ans.isCorrect) topics[topic].correct++;
        });

        return Object.values(topics).map(t => ({
            subject: t.topic,
            A: Math.round((t.correct / t.total) * 100),
            fullMark: 100
        }));
    }, [report]);

    // 3. Comparison Data
    const comparisonData = [
        { name: 'You', score: report.percentage, fill: 'var(--primary)' },
        { name: 'Class Avg', score: parseFloat(analytics.classAvgScore) / report.maxPossibleScore * 100, fill: 'var(--text-muted)' }
    ];

    return (
        <div className="student-visual-dashboard">
            {/* Top Row: Podium & Mastery */}
            <div className="visual-row">
                {/* Visual Podium */}
                <div className="visual-card podium-card">
                    <div className="card-header-visual">
                        <FiAward className="icon-gold" />
                        <h3>Top 3 Champions</h3>
                    </div>
                    <div className="podium-container">
                        {podiumData[1] && (
                            <div className="podium-pillar rank-2">
                                <div className="podium-avatar">{podiumData[1].name[0]}</div>
                                <div className="pillar-rect">2</div>
                                <span className="podium-name">{podiumData[1].name.split(' ')[0]}</span>
                            </div>
                        )}
                        {podiumData[0] && (
                            <div className="podium-pillar rank-1">
                                <div className="podium-avatar">👑</div>
                                <div className="pillar-rect">1</div>
                                <span className="podium-name">{podiumData[0].name.split(' ')[0]}</span>
                            </div>
                        )}
                        {podiumData[2] && (
                            <div className="podium-pillar rank-3">
                                <div className="podium-avatar">{podiumData[2].name[0]}</div>
                                <div className="pillar-rect">3</div>
                                <span className="podium-name">{podiumData[2].name.split(' ')[0]}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Radar Mastery Chart */}
                <div className="visual-card mastery-card">
                    <div className="card-header-visual">
                        <FiTarget className="icon-emerald" />
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
                            <span className="v-value">{analytics.avgTime}s <small>/ q</small></span>
                        </div>
                        <div className="v-metric">
                            <span className="v-label">Class Avg</span>
                            <span className="v-value">{analytics.classAvgTime}s <small>/ q</small></span>
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
