import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend,
    ComposedChart, Line
} from 'recharts';
import {
    FiUsers, FiCheckCircle, FiPercent, FiTrendingUp,
    FiPieChart, FiAward, FiAlertCircle, FiBarChart2
} from 'react-icons/fi';

const FacultyLiveAnalysis = ({ leaderboard = [], responses = [], absentStudents = [], totalQuestions, quiz }) => {

    // --- BULLETPROOF RESPONSIVE CHART WIDTH HOOK ---
    const gridRef = useRef(null);
    const [chartWidth, setChartWidth] = useState(500);

    useEffect(() => {
        // Calculate chart width based on grid columns
        const updateWidth = () => {
            if (gridRef.current) {
                // Determine if we are in 1 column or 2 column layout based on screen width
                const padding = 60; // Approximate card paddings
                const containerWidth = gridRef.current.clientWidth;
                // If container is wide enough (CSS grid applies 2 columns above ~950px), split it, else full width
                const calculatedWidth = containerWidth > 950 ? (containerWidth / 2) - padding : containerWidth - padding;
                setChartWidth(Math.max(300, calculatedWidth));
            }
        };

        updateWidth();
        window.addEventListener('resize', updateWidth);
        return () => window.removeEventListener('resize', updateWidth);
    }, []);
    // -----------------------------------------------

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
                topic: q.topic,
                fill: correctPct < 30 ? '#F43F5E' : correctPct > 80 ? '#10B981' : '#8B5CF6'
            };
        });
        console.log('[DEBUG] FacultyLiveAnalysis - questionAnalysis:', result);
        return result;
    }, [responses, quiz]);

    // 4. Section-wise Performance Analysis (Avg Score per Section)
    const sectionAnalysis = useMemo(() => {
        const stats = {};

        // 1. Initialize with eligible sections from quiz configuration if present
        if (quiz?.accessControl?.allowedBranches) {
            quiz.accessControl.allowedBranches.forEach(branch => {
                if (branch.sections && branch.sections.length > 0) {
                    branch.sections.forEach(sec => {
                        const key = `${branch.name}-${sec}`;
                        stats[key] = { section: key, totalScore: 0, count: 0 };
                    });
                }
            });
        }

        // 2. Aggregate actual scores from responses
        responses.forEach(r => {
            const student = r.student || r.userId;
            const dept = student?.department;
            const sec = student?.section;

            if (dept && sec) {
                const key = `${dept.toUpperCase()}-${sec.toUpperCase()}`;
                if (!stats[key]) {
                    stats[key] = { section: key, totalScore: 0, count: 0 };
                }
                stats[key].totalScore += (r.totalScore || 0);
                stats[key].count++;
            }
        });

        const result = Object.values(stats).map(s => ({
            section: s.section,
            avgScore: s.count > 0 ? Number((s.totalScore / s.count).toFixed(1)) : 0,
            fill: '#6366F1'
        })).sort((a, b) => a.section.localeCompare(b.section));

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

    const leaderboardData = useMemo(() => {
        if (!leaderboard || leaderboard.length === 0) return [];
        return leaderboard.slice(0, 10).map((entry, idx) => ({
            rank: entry.rank || idx + 1,
            // Use rollNumber if available, otherwise fallback to truncated name
            name: entry.student?.rollNumber || entry.userId?.rollNumber || (entry.student?.name || entry.userId?.name || 'Unknown').split(' ')[0],
            score: entry.percentage || ((entry.totalScore / (quiz?.totalPoints || 100)) * 100) || 0,
            fill: idx < 3 ? '#F59E0B' : '#3B82F6'
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
            <div className="modern-graphs-grid" ref={gridRef}>

                {/* Score Distribution */}
                <div className="modern-graph-card">
                    <div className="graph-header">
                        <FiBarChart2 style={{ color: '#3B82F6', fontSize: '1.4rem' }} /> <h3>Score Distribution</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        {scoreDistribution && scoreDistribution.length > 0 && scoreDistribution.some(d => d.students > 0) ? (
                            <BarChart width={chartWidth} height={300} data={scoreDistribution} margin={{ left: -20, top: 20, right: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="range" tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <Tooltip content={CustomTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend verticalAlign="top" height={36} />
                                <Bar dataKey="students" name="Count of Students" fill="#3B82F6" radius={[6, 6, 0, 0]} barSize={40} isAnimationActive={false} />
                            </BarChart>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No score data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Section-wise Performance */}
                <div className="modern-graph-card">
                    <div className="graph-header">
                        <FiPieChart style={{ color: '#F59E0B', fontSize: '1.4rem' }} /> <h3>Section Performance (Avg)</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        {sectionAnalysis && sectionAnalysis.length > 0 ? (
                            <BarChart width={chartWidth} height={300} data={sectionAnalysis} margin={{ left: -20, top: 20, right: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="section" tick={{ fill: '#94A3B8', fontSize: 10 }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                <Tooltip content={CustomTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend verticalAlign="top" height={36} />
                                <Bar dataKey="avgScore" name="Average Marks" fill="#6366F1" radius={[6, 6, 0, 0]} barSize={Math.max(20, 150 / sectionAnalysis.length)} isAnimationActive={false} />
                            </BarChart>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94A3B8' }}>
                                No section performance data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Participation Rate (Donut Chart) */}
                <div className="modern-graph-card">
                    <div className="graph-header">
                        <FiUsers style={{ color: '#0EA5E9', fontSize: '1.4rem' }} /> <h3>Participation Rate</h3>
                    </div>
                    <div className="graph-container-box" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        {participationData && participationData.length > 0 ? (
                            <PieChart width={chartWidth} height={300}>
                                <Pie data={participationData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" isAnimationActive={false} />
                                <Tooltip content={CustomTooltip} />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
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
                    <div className="graph-container-box" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        {questionAnalysis && questionAnalysis.length > 0 ? (
                            <ComposedChart width={gridRef.current?.clientWidth || chartWidth * 2} height={350} data={questionAnalysis} margin={{ top: 20, left: -20, right: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                <Tooltip content={CustomTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="correctPct" name="% Correct" barSize={35} radius={[6, 6, 0, 0]} isAnimationActive={false} />
                                <Line type="monotone" dataKey="correctPct" name="Trend" stroke="#3B82F6" strokeWidth={3} dot={{ r: 5, fill: '#0F172A', strokeWidth: 2 }} isAnimationActive={false} />
                            </ComposedChart>
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
                    <div className="graph-container-box" style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                        {leaderboardData && leaderboardData.length > 0 ? (
                            <BarChart width={gridRef.current?.clientWidth || chartWidth * 2} height={400} data={leaderboardData} layout="vertical" margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                                <YAxis dataKey="name" type="category" width={80} tick={{ fill: '#E2E8F0', fontWeight: '500' }} tickLine={false} axisLine={false} />
                                <Tooltip content={CustomTooltip} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                <Legend verticalAlign="top" height={36} />
                                <Bar dataKey="score" name="Performance Score %" radius={[0, 6, 6, 0]} barSize={20} isAnimationActive={false} />
                            </BarChart>
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
