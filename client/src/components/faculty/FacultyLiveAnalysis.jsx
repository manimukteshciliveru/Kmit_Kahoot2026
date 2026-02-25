import React, { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, Legend
} from 'recharts';
import { FiTrendingUp, FiClock, FiCheckCircle, FiUsers, FiPieChart } from 'react-icons/fi';

const FacultyLiveAnalysis = ({ leaderboard, totalQuestions, quiz }) => {

    // 1. Overall Ranking Data (Top 10)
    const rankingData = useMemo(() => {
        return leaderboard
            .slice(0, 10)
            .map(entry => ({
                name: entry.userId?.name || entry.studentName,
                score: entry.totalScore,
                accuracy: entry.percentage || 0
            }));
    }, [leaderboard]);

    // 2. Section-wise Analysis
    const sectionData = useMemo(() => {
        const sections = {};
        leaderboard.forEach(entry => {
            const sec = entry.userId?.section || 'Unknown';
            if (!sections[sec]) sections[sec] = { name: sec, count: 0, totalScore: 0, accuracySum: 0 };
            sections[sec].count++;
            sections[sec].totalScore += entry.totalScore;
            sections[sec].accuracySum += (entry.percentage || 0);
        });

        return Object.values(sections).map(s => ({
            name: s.name,
            avgScore: Math.round(s.totalScore / s.count),
            avgAccuracy: Math.round(s.accuracySum / s.count),
            participants: s.count
        }));
    }, [leaderboard]);

    // 3. Question-wise Analysis
    const questionData = useMemo(() => {
        if (!quiz?.questions) return [];

        return quiz.questions.map((q, idx) => {
            let correct = 0;
            let attempted = 0;

            leaderboard.forEach(entry => {
                const ans = entry.answers?.find(a => a.questionId.toString() === q._id.toString());
                if (ans) {
                    attempted++;
                    if (ans.isCorrect) correct++;
                }
            });

            return {
                name: `Q${idx + 1}`,
                accuracy: attempted > 0 ? Math.round((correct / attempted) * 100) : 0,
                correct,
                wrong: attempted - correct
            };
        });
    }, [leaderboard, quiz]);

    // 4. Time Analysis (Average Time per Question)
    const timeData = useMemo(() => {
        if (!quiz?.questions) return [];

        return quiz.questions.map((q, idx) => {
            let totalTime = 0;
            let count = 0;

            leaderboard.forEach(entry => {
                const ans = entry.answers?.find(a => a.questionId.toString() === q._id.toString());
                if (ans && ans.timeTaken) {
                    totalTime += ans.timeTaken;
                    count++;
                }
            });

            return {
                name: `Q${idx + 1}`,
                avgTime: count > 0 ? Number((totalTime / count / 1000).toFixed(1)) : 0 // in seconds
            };
        });
    }, [leaderboard, quiz]);

    // COLORS for charts
    const COLORS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B', '#0EA5E9', '#A855F7'];

    return (
        <div className="faculty-analysis-grid">

            {/* 1. Overall Ranking Chart */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiTrendingUp className="icon-blue" />
                    <h3>Overall Ranking (Top 10)</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={rankingData} layout="vertical" margin={{ left: 40, right: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.1} />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                            <Tooltip
                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                            />
                            <Bar dataKey="score" fill="var(--primary)" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 2. Section-wise Comparison */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiPieChart className="icon-green" />
                    <h3>Section-wise Performance</h3>
                </div>
                <div className="chart-container-flex">
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={sectionData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="participants"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            >
                                {sectionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div className="mini-stats">
                        {sectionData.map((s, i) => (
                            <div key={i} className="mini-stat-item">
                                <span className="stat-label">{s.name} Acc:</span>
                                <span className="stat-value">{s.avgAccuracy}%</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 3. Question-wise Analysis */}
            <div className="analysis-card visual-card full-width">
                <div className="card-header-visual">
                    <FiCheckCircle className="icon-rose" />
                    <h3>Question-wise Accuracy (%)</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={questionData}>
                            <defs>
                                <linearGradient id="colorAcc" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="name" />
                            <YAxis unit="%" />
                            <Tooltip />
                            <Area type="monotone" dataKey="accuracy" stroke="var(--success)" fillOpacity={1} fill="url(#colorAcc)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 4. Time Analysis */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiClock className="icon-yellow" />
                    <h3>Average Response Time (s)</h3>
                </div>
                <div className="chart-container">
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={timeData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="avgTime" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 5. Improvement / Participation Tracker */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiUsers className="icon-blue" />
                    <h3>Live Participation Stats</h3>
                </div>
                <div className="participation-metrics">
                    <div className="metric-box">
                        <span className="metric-val">{leaderboard.length}</span>
                        <span className="metric-lab">Total Participating</span>
                    </div>
                    <div className="metric-box green">
                        <span className="metric-val">
                            {Math.round(leaderboard.reduce((acc, curr) => acc + (curr.percentage || 0), 0) / (leaderboard.length || 1))}%
                        </span>
                        <span className="metric-lab">Avg Group Accuracy</span>
                    </div>
                    <div className="metric-box purple">
                        <span className="metric-val">
                            {leaderboard.filter(e => e.status === 'completed').length}
                        </span>
                        <span className="metric-lab">Final Submissions</span>
                    </div>
                </div>
                <div className="improvement-note">
                    <strong>💡 Insight:</strong> {
                        questionData.length > 0 ?
                            `Question ${questionData.sort((a, b) => a.accuracy - b.accuracy)[0].name.slice(1)} is the toughest so far.`
                            : 'Collecting data...'
                    }
                </div>
            </div>

        </div>
    );
};

export default FacultyLiveAnalysis;
