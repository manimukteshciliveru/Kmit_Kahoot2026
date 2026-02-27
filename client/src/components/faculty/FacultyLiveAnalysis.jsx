import React, { useMemo, useState } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend, ResponsiveContainer,
    ComposedChart, Line
} from 'recharts';
import {
    FiUsers, FiCheckCircle, FiPercent, FiTrendingUp,
    FiAward, FiAlertCircle, FiBarChart2
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

        return { totalEligible, attempted, participationRate, avgScore, highest, lowest };
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

        return Object.keys(bins).map(key => ({ range: key, students: bins[key] }));
    }, [responses, quiz]);

    // 3. Question Difficulty Analysis
    const questionAnalysis = useMemo(() => {
        const qStats = {};

        // Initialize
        if (quiz?.questions) {
            quiz.questions.forEach((q, idx) => {
                qStats[String(q._id)] = {
                    number: `Q${idx + 1}`,
                    correct: 0,
                    totalAttempts: 0,
                    topic: q.topic || 'General'
                };
            });
        }

        responses.forEach(r => {
            if (r.answers) {
                r.answers.forEach(a => {
                    if (qStats[String(a.questionId)]) {
                        qStats[String(a.questionId)].totalAttempts++;
                        if (a.isCorrect) qStats[String(a.questionId)].correct++;
                    }
                });
            }
        });

        return Object.values(qStats).map(q => {
            const correctPct = q.totalAttempts > 0 ? (q.correct / q.totalAttempts) * 100 : 0;
            return {
                name: q.number,
                correctPct: Number(correctPct.toFixed(1)),
                topic: q.topic
            };
        });
    }, [responses, quiz]);

    // 4. Section/Topic wise average
    const sectionAnalysis = useMemo(() => {
        const topics = {};
        questionAnalysis.forEach(q => {
            if (!topics[q.topic]) topics[q.topic] = { totalPct: 0, count: 0 };
            topics[q.topic].totalPct += q.correctPct;
            topics[q.topic].count++;
        });

        return Object.keys(topics).map(t => ({
            topic: t,
            avgAccuracy: Number((topics[t].totalPct / topics[t].count).toFixed(1))
        }));
    }, [questionAnalysis]);

    const COLORS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B', '#0EA5E9'];

    // Custom Tooltip for internal charts
    const CustomTooltip = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ background: 'var(--bg-card)', padding: '10px', border: '1px solid var(--border)', borderRadius: '8px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold' }}>{label}</p>
                    {payload.map((p, i) => (
                        <p key={i} style={{ color: p.color, margin: 0 }}>
                            {p.name}: {p.value} {p.name.includes('Pct') || p.name.includes('Accuracy') ? '%' : ''}
                        </p>
                    ))}
                </div>
            );
        }
        return null;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            {/* Top Metrics Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                <div className="stat-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Eligible Students</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.5rem' }}>{metrics.totalEligible}</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid var(--success)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Total Attempted</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.5rem' }}>{metrics.attempted}</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid var(--warning)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Participation %</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.5rem' }}>{metrics.participationRate}%</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid var(--accent)' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Average Score</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.5rem' }}>{metrics.avgScore} <span style={{ fontSize: '1rem', fontWeight: 'normal' }}>/ {quiz?.totalPoints || 100}</span></div>
                </div>
                <div className="stat-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #10B981' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Highest Score</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.5rem' }}>{metrics.highest}</div>
                </div>
                <div className="stat-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderLeft: '4px solid #F43F5E' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase' }}>Lowest Score</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--text-primary)', marginTop: '0.5rem' }}>{metrics.lowest}</div>
                </div>
            </div>

            {/* Middle Graphs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem' }}>

                {/* Score Distribution */}
                <div className="analysis-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><FiBarChart2 style={{ marginRight: '8px', color: 'var(--primary)' }} /> Score Distribution</h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={scoreDistribution}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.2} />
                                <XAxis dataKey="range" tick={{ fill: 'var(--text-secondary)' }} />
                                <YAxis tick={{ fill: 'var(--text-secondary)' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="students" name="Students" fill="var(--primary)" radius={[4, 4, 0, 0]} animationDuration={1000} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Section/Topic Accuracy */}
                <div className="analysis-card" style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><FiPieChart style={{ marginRight: '8px', color: 'var(--warning)' }} /> Section Analysis</h3>
                    <div style={{ height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={sectionAnalysis} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                                <XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-secondary)' }} />
                                <YAxis dataKey="topic" type="category" width={100} tick={{ fill: 'var(--text-secondary)' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="avgAccuracy" name="Avg Accuracy %" fill="var(--warning)" radius={[0, 4, 4, 0]} animationDuration={1000} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Question Difficulty */}
                <div className="analysis-card" style={{ gridColumn: '1 / -1', background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px' }}>
                    <h3 style={{ marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem' }}><FiTrendingUp style={{ marginRight: '8px', color: 'var(--accent)' }} /> Question-wise Performance</h3>
                    <div style={{ height: '350px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={questionAnalysis}>
                                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)' }} />
                                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-secondary)' }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend />
                                <Bar dataKey="correctPct" name="% Answered Correctly" fill="var(--accent)" radius={[4, 4, 0, 0]} animationDuration={1000}>
                                    {questionAnalysis.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.correctPct < 30 ? '#F43F5E' : entry.correctPct > 80 ? '#10B981' : 'var(--accent)'} />
                                    ))}
                                </Bar>
                                <Line type="monotone" dataKey="correctPct" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center', fontSize: '0.85rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: 12, height: 12, background: '#10B981', display: 'inline-block', borderRadius: 2 }}></span> Very Easy (&gt;80%)</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: 12, height: 12, background: 'var(--accent)', display: 'inline-block', borderRadius: 2 }}></span> Moderate</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><span style={{ width: 12, height: 12, background: '#F43F5E', display: 'inline-block', borderRadius: 2 }}></span> Hard (&lt;30%)</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default FacultyLiveAnalysis;
