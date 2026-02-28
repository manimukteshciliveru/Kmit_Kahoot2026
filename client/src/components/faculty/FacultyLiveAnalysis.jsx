import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend, ResponsiveContainer,
    ComposedChart, Line
} from 'recharts';
import {
    FiUsers, FiCheckCircle, FiPercent, FiTrendingUp,
    FiPieChart, FiAward, FiAlertCircle, FiBarChart2
} from 'react-icons/fi';

const FacultyLiveAnalysis = ({ leaderboard = [], responses = [], absentStudents = [], totalQuestions, quiz }) => {

    // 1. Summary Metrics
    const metrics = useMemo(() => {
        const attempted = responses.length;
        const absent = absentStudents.length;
        const totalEligible = attempted + absent;
        const participationRate = totalEligible > 0 ? ((attempted / totalEligible) * 100).toFixed(1) : 0;

        let totalScore = 0;
        let highest = 0;
        let lowest = attempted > 0 ? 1000 : 0; // arbitrary high number to start

        responses.forEach(r => {
            const score = r.totalScore || 0;
            totalScore += score;
            if (score > highest) highest = score;
            if (score < lowest) lowest = score;
        });

        if (lowest === 1000) lowest = 0;

        const avgScore = attempted > 0 ? (totalScore / attempted).toFixed(1) : 0;

        const result = { totalEligible, attempted, participationRate, avgScore, highest, lowest };
        console.log('[DEBUG] FacultyLiveAnalysis - metrics:', result);
        return result;
    }, [responses, absentStudents]);

    // 2. Score Distribution Histogram (Bins: 0-20%, 21-40%, etc.)
    const scoreDistribution = useMemo(() => {
        const bins = { '0-20%': 0, '21-40%': 0, '41-60%': 0, '61-80%': 0, '81-100%': 0 };
        const maxScore = quiz?.totalPoints || 100;

        responses.forEach(r => {
            const pct = ((r.totalScore || 0) / maxScore) * 100;
            if (pct <= 20) bins['0-20%']++;
            else if (pct <= 40) bins['21-40%']++;
            else if (pct <= 60) bins['41-60%']++;
            else if (pct <= 80) bins['61-80%']++;
            else bins['81-100%']++;
        });

        const result = Object.keys(bins).map(key => ({ range: key, students: bins[key] }));
        console.log('[DEBUG] FacultyLiveAnalysis - scoreDistribution:', result);
        return result;
    }, [responses, quiz]);

    // 3. Question Difficulty Analysis
    const questionAnalysis = useMemo(() => {
        const qStats = {};

        // Use the backend provided questionAnalytics directly if available (best)
        if (quiz?.questions) {
            quiz.questions.forEach((q, idx) => {
                qStats[String(q._id)] = {
                    number: `Q${idx + 1}`,
                    correct: 0,
                    totalAttempts: 0,
                    topic: q.topic || 'General' // fallback to General if no topic
                };
            });
        }

        responses.forEach(r => {
            if (r.answers) {
                r.answers.forEach(a => {
                    const qIdStr = String(a.questionId || (a.question && a.question._id));
                    if (qIdStr && qStats[qIdStr]) {
                        qStats[qIdStr].totalAttempts++;
                        // Sometimes field is isCorrect (boolean), sometimes it relies on scoreAwarded
                        if (a.isCorrect || a.scoreAwarded > 0) {
                            qStats[qIdStr].correct++;
                        }
                    }
                });
            }
        });

        const result = Object.values(qStats).map(q => {
            const correctPct = q.totalAttempts > 0 ? (q.correct / q.totalAttempts) * 100 : 0;
            return {
                name: q.number,
                correctPct: Number(correctPct.toFixed(1)),
                topic: q.topic
            };
        });
        console.log('[DEBUG] FacultyLiveAnalysis - questionAnalysis:', result);
        return result;
    }, [responses, quiz]);

    // 4. Section/Topic wise average (Stacked Bar for Class-level Accuracy)
    const sectionAnalysis = useMemo(() => {
        const topics = {};
        responses.forEach(r => {
            if (r.answers) {
                r.answers.forEach(a => {
                    const qIdStr = String(a.questionId || (a.question && a.question._id));
                    const q = quiz?.questions?.find(que => String(que._id) === qIdStr);
                    const topic = q?.topic || 'General';
                    if (!topics[topic]) topics[topic] = { topic, correct: 0, wrong: 0, total: 0 };

                    topics[topic].total++;
                    if (a.isCorrect || a.scoreAwarded > 0) topics[topic].correct++;
                    else if (a.answer && String(a.answer).trim() !== '') topics[topic].wrong++;
                    // Note: unattempted may be skipped or logged independently based on requirements,
                    // but we will simply track Correct and Incorrect for the stacked bar
                });
            }
        });

        const result = Object.values(topics).map(t => ({
            topic: t.topic,
            Correct: t.correct,
            Incorrect: t.wrong,
            avgAccuracy: t.total > 0 ? Number(((t.correct / t.total) * 100).toFixed(1)) : 0
        }));
        console.log('[DEBUG] FacultyLiveAnalysis - sectionAnalysis:', result);
        return result;
    }, [responses, quiz]);

    // 5. Participation Rate (Donut Chart)
    const participationData = useMemo(() => {
        const attempted = responses.length;
        const absent = absentStudents.length;
        // Don't render pie segments if completely 0 to avoid Recharts warnings
        const validData = [];
        if (attempted > 0) validData.push({ name: 'Attempted', value: attempted, fill: '#10B981' });
        if (absent > 0) validData.push({ name: 'Absent', value: absent, fill: '#F43F5E' });

        return validData;
    }, [responses, absentStudents]);

    // 6. Leaderboard (Horizontal Bar Chart)
    const leaderboardData = useMemo(() => {
        if (!leaderboard || leaderboard.length === 0) return [];
        return leaderboard.slice(0, 10).map((entry, idx) => ({
            rank: entry.rank || idx + 1,
            name: (entry.student?.name || entry.userId?.name || 'Unknown').split(' ')[0], // First name for compact display
            score: entry.percentage || ((entry.totalScore / (quiz?.totalPoints || 100)) * 100) || 0
        }));
    }, [leaderboard, quiz]);

    const COLORS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B', '#0EA5E9'];

    // Custom Tooltip for internal charts
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div className="premium-tooltip">
                    <p className="pt-title">{label}</p>
                    {payload.map((p, i) => (
                        <div key={i} className="pt-item">
                            <span className="pt-dot" style={{ background: p.color }}></span>
                            <span>{p.name}: <strong style={{ color: 'white' }}>{p.value} {p.name.includes('%') || p.name.includes('Accuracy') ? '%' : ''}</strong></span>
                        </div>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div className="faculty-analysis-dashboard">
            {/* Top Metrics Cards */}
            <div className="modern-stats-grid">
                <div className="modern-stat-card c-blue">
                    <div className="stat-header">Eligible Students</div>
                    <div className="stat-value">{metrics.totalEligible}</div>
                </div>
                <div className="modern-stat-card c-green">
                    <div className="stat-header">Total Attempted</div>
                    <div className="stat-value">{metrics.attempted}</div>
                </div>
                <div className="modern-stat-card c-orange">
                    <div className="stat-header">Participation %</div>
                    <div className="stat-value">{metrics.participationRate}%</div>
                </div>
                <div className="modern-stat-card c-purple">
                    <div className="stat-header">Average Score</div>
                    <div className="stat-value">{metrics.avgScore} <span className="stat-sub">/ {quiz?.totalPoints || 100}</span></div>
                </div>
                <div className="modern-stat-card c-cyan">
                    <div className="stat-header">Highest Score</div>
                    <div className="stat-value">{metrics.highest}</div>
                </div>
                <div className="modern-stat-card c-rose">
                    <div className="stat-header">Lowest Score</div>
                    <div className="stat-value">{metrics.lowest}</div>
                </div>
            </div>

            {/* Middle Graphs Grid */}
            <div className="modern-graphs-grid">

                {/* Score Distribution */}
                <div className="modern-graph-card">
                    <div className="graph-header">
                        <FiBarChart2 style={{ color: '#3B82F6', fontSize: '1.4rem' }} /> <h3>Score Distribution</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', minWidth: 0, height: 300 }}>
                        {scoreDistribution && scoreDistribution.length > 0 && scoreDistribution.some(d => d.students > 0) ? (
                            <ResponsiveContainer width="99%" height={300}>
                                <BarChart data={scoreDistribution} margin={{ left: -20, top: 20, right: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="range" tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                    <YAxis tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Bar dataKey="students" name="Students" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40} animationDuration={1000} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No score data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Section/Topic Accuracy (Stacked Bar) */}
                <div className="modern-graph-card">
                    <div className="graph-header">
                        <FiPieChart style={{ color: '#F59E0B', fontSize: '1.4rem' }} /> <h3>Section Analysis</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', minWidth: 0, height: 300 }}>
                        {sectionAnalysis && sectionAnalysis.length > 0 ? (
                            <ResponsiveContainer width="99%" height={300}>
                                <BarChart data={sectionAnalysis} layout="vertical" margin={{ left: 0, top: 20, right: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                    <YAxis dataKey="topic" type="category" width={90} tick={{ fill: '#E2E8F0', fontWeight: '600' }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Legend />
                                    <Bar dataKey="Correct" stackId="a" fill="#10B981" animationDuration={1000} />
                                    <Bar dataKey="Incorrect" stackId="a" fill="#F43F5E" radius={[0, 6, 6, 0]} animationDuration={1000} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No section analysis available
                            </div>
                        )}
                    </div>
                </div>

                {/* Participation Rate (Donut Chart) */}
                <div className="modern-graph-card">
                    <div className="graph-header">
                        <FiUsers style={{ color: '#0EA5E9', fontSize: '1.4rem' }} /> <h3>Participation Rate</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', minWidth: 0, height: 300 }}>
                        {participationData && participationData.length > 0 ? (
                            <ResponsiveContainer width="99%" height={300}>
                                <PieChart>
                                    <Pie data={participationData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {participationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No participation data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Question Difficulty */}
                <div className="modern-graph-card graph-card-full">
                    <div className="graph-header">
                        <FiTrendingUp style={{ color: '#8B5CF6', fontSize: '1.4rem' }} /> <h3>Question-wise Performance</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', minWidth: 0, height: 350 }}>
                        {questionAnalysis && questionAnalysis.length > 0 ? (
                            <ResponsiveContainer width="99%" height={350}>
                                <ComposedChart data={questionAnalysis} margin={{ top: 20, left: -20, right: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                    <YAxis domain={[0, 100]} tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                    <Bar dataKey="correctPct" name="% Correct" barSize={35} radius={[6, 6, 0, 0]} animationDuration={1000}>
                                        {questionAnalysis.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.correctPct < 30 ? '#F43F5E' : entry.correctPct > 80 ? '#10B981' : '#8B5CF6'} />
                                        ))}
                                    </Bar>
                                    <Line type="monotone" dataKey="correctPct" name="Trend" stroke="#3B82F6" strokeWidth={3} dot={{ r: 5, fill: '#0F172A', strokeWidth: 2 }} animationDuration={1000} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No question analysis available
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '1.5rem', marginTop: '1.5rem', justifyContent: 'center', fontSize: '0.9rem', color: '#94A3B8', fontWeight: 500 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: 12, height: 12, background: '#10B981', display: 'inline-block', borderRadius: 3 }}></span> Very Easy (&gt;80%)</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: 12, height: 12, background: '#8B5CF6', display: 'inline-block', borderRadius: 3 }}></span> Moderate</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ width: 12, height: 12, background: '#F43F5E', display: 'inline-block', borderRadius: 3 }}></span> Hard (&lt;30%)</span>
                    </div>
                </div>

                {/* Top 10 Leaderboard (Horizontal Bar Chart) */}
                <div className="modern-graph-card graph-card-full">
                    <div className="graph-header">
                        <FiAward style={{ color: '#F59E0B', fontSize: '1.4rem' }} /> <h3>Top 10 Students</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', minWidth: 0, height: 400 }}>
                        {leaderboardData && leaderboardData.length > 0 ? (
                            <ResponsiveContainer width="99%" height={400}>
                                <BarChart data={leaderboardData} layout="vertical" margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                    <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                    <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#E2E8F0', fontWeight: '500' }} tickLine={false} axisLine={false} />
                                    <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Bar dataKey="score" name="Score %" radius={[0, 6, 6, 0]} barSize={20} animationDuration={1000}>
                                        {leaderboardData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={index < 3 ? '#F59E0B' : '#3B82F6'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No leaderboard data available
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default FacultyLiveAnalysis;
