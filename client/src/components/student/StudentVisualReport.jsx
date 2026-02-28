import React, { useMemo, useState, useEffect } from 'react';
import {
    PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
    BarChart, Bar, XAxis, YAxis, CartesianGrid,
    LineChart, Line, ReferenceLine,
    AreaChart, Area
} from 'recharts';
import {
    FiTarget, FiAward, FiClock, FiActivity, FiPieChart,
    FiBarChart2, FiTrendingUp
} from 'react-icons/fi';
import { responseAPI } from '../../services/api';

const StudentVisualReport = ({ report, analytics, leaderboard, user }) => {

    const [historyData, setHistoryData] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const res = await responseAPI.getHistory({ limit: 10 });
                if (res.data?.success) {
                    // Extract data for line chart, sorted chronologically (oldest to newest)
                    const sortedResponses = [...res.data.data.responses].reverse();
                    const trendData = sortedResponses.map((r, idx) => ({
                        quiz: r.quizId?.title || `Quiz ${idx + 1}`,
                        score: r.percentage || 0,
                        date: new Date(r.createdAt).toLocaleDateString()
                    }));
                    setHistoryData(trendData);
                }
            } catch (error) {
                console.error('Failed to fetch history for historical trend', error);
            } finally {
                setLoadingHistory(false);
            }
        };
        fetchHistory();
    }, []);

    // 1. Performance Summary Cards handled in QuizReport, but let's build the visual top row

    // 2. Accuracy Pie Chart Data
    const accuracyData = useMemo(() => {
        const data = [
            { name: 'Correct', value: analytics.correct || 0, color: '#10B981' },
            { name: 'Wrong', value: analytics.incorrect || 0, color: '#F43F5E' },
            { name: 'Unattempted', value: analytics.unattempted || 0, color: '#94A3B8' }
        ].filter(d => d.value > 0);
        console.log('[DEBUG] StudentVisualReport - accuracyData:', data);
        return data;
    }, [analytics]);

    // 3. Section-wise Performance
    const sectionData = useMemo(() => {
        const topics = {};
        (report.quizId?.questions || []).forEach(q => {
            const topic = q.topic || 'General';
            if (!topics[topic]) topics[topic] = { topic, total: 0, correct: 0, wrong: 0 };
            topics[topic].total++;
        });

        (report.answers || []).forEach(ans => {
            const qIdStr = String(ans.questionId || (ans.question && ans.question._id));
            const q = (report.quizId?.questions || []).find(q => String(q._id) === qIdStr);
            const topic = q?.topic || 'General';
            if (topics[topic]) {
                if (ans.isCorrect || ans.scoreAwarded > 0) topics[topic].correct++;
                else topics[topic].wrong++;
            }
        });

        const result = Object.values(topics).map(t => ({
            name: t.topic,
            Accuracy: t.total > 0 ? Number(((t.correct / t.total) * 100).toFixed(1)) : 0,
            Correct: t.correct,
            Wrong: t.wrong,
            Total: t.total
        }));

        console.log('[DEBUG] StudentVisualReport - sectionData:', result);
        return result;
    }, [report]);

    // 4. Time Spent Per Question (Line Chart)
    const timeData = useMemo(() => {
        const questions = report.quizId?.questions || [];
        const answers = report.answers || [];

        // Calculate average time to find spikes
        let totalTime = 0;
        const validTimes = [];

        const mapped = questions.map((q, idx) => {
            const ans = answers.find(a => String(a.questionId || (a.question && a.question._id)) === String(q._id));
            const timeSeconds = ans && ans.timeTaken ? Number((Math.max(0, ans.timeTaken) / 1000).toFixed(1)) : 0;
            if (timeSeconds > 0) validTimes.push(timeSeconds);
            return {
                name: `Q${idx + 1}`,
                time: timeSeconds,
                isCorrect: ans?.isCorrect || false
            };
        });

        const avgGlobalTime = validTimes.length ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length : 0;

        const result = { data: mapped, averageLine: Number(avgGlobalTime.toFixed(1)) };
        console.log('[DEBUG] StudentVisualReport - timeData:', result);
        return result;
    }, [report]);

    const CustomTooltipPie = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div style={{ background: 'var(--bg-card)', padding: '10px 15px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <p style={{ margin: 0, color: payload[0].payload.color, fontWeight: 'bold' }}>
                        {payload[0].name}: {payload[0].value} Questions
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {((payload[0].value / analytics.totalQuestions) * 100).toFixed(1)}% of total
                    </p>
                </div>
            );
        }
        return null;
    };

    const CustomTooltipBar = ({ active, payload, label }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div style={{ background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    <p style={{ margin: '0 0 8px 0', fontWeight: 'bold', color: 'var(--text-primary)' }}>{label}</p>
                    <p style={{ margin: '3px 0', color: 'var(--primary)', fontSize: '0.9rem' }}>Accuracy: {data.Accuracy}%</p>
                    <p style={{ margin: '3px 0', color: '#10B981', fontSize: '0.9rem' }}>Correct: {data.Correct}</p>
                    <p style={{ margin: '3px 0', color: '#F43F5E', fontSize: '0.9rem' }}>Wrong: {data.Wrong}</p>
                    <p style={{ margin: '3px 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Total: {data.Total}</p>
                </div>
            );
        }
        return null;
    };

    // Time Chart Spike Dots
    const CustomizedDot = (props) => {
        const { cx, cy, value, payload } = props;
        const isSpike = value > timeData.averageLine * 2; // Arbitrary spike logic > 2x average

        if (isSpike) {
            return (
                <svg x={cx - 5} y={cy - 5} width={10} height={10} fill="#F59E0B" viewBox="0 0 10 10">
                    <circle cx="5" cy="5" r="5" />
                </svg>
            );
        }
        return (
            <svg x={cx - 3} y={cy - 3} width={6} height={6} fill={payload.isCorrect ? '#10B981' : '#F43F5E'} viewBox="0 0 6 6">
                <circle cx="3" cy="3" r="3" />
            </svg>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', margin: '2rem 0' }}>

            {/* Top Row: Performance Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid var(--primary)', textAlign: 'center' }}>
                    <FiTarget style={{ fontSize: '1.5rem', color: 'var(--primary)', marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{report.totalScore}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Score</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid #10B981', textAlign: 'center' }}>
                    <FiActivity style={{ fontSize: '1.5rem', color: '#10B981', marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{analytics.accuracy}%</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Accuracy %</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid #F59E0B', textAlign: 'center' }}>
                    <FiAward style={{ fontSize: '1.5rem', color: '#F59E0B', marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)' }}>#{analytics.rank}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Global Rank</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid var(--accent)', textAlign: 'center' }}>
                    <FiClock style={{ fontSize: '1.5rem', color: 'var(--accent)', marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{Math.max(0, (report.totalTimeTaken || 0) / 1000).toFixed(0)}s</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Time</div>
                </div>
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', borderBottom: '4px solid #F43F5E', textAlign: 'center' }}>
                    <FiPieChart style={{ fontSize: '1.5rem', color: '#F43F5E', marginBottom: '0.5rem' }} />
                    <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--text-primary)' }}>{analytics.attempted}/{analytics.totalQuestions}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Attempted</div>
                </div>
            </div>

            {/* Middle Row: Graphs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>

                {/* Accuracy Pie Chart */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', fontSize: '1.1rem' }}>
                        <FiPieChart color="var(--primary)" /> Overall Accuracy
                    </h3>
                    <div style={{ width: '100%', height: '250px' }}>
                        {accuracyData && accuracyData.length > 0 ? (
                            <ResponsiveContainer>
                                <PieChart>
                                    <Pie data={accuracyData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {accuracyData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomTooltipPie />} />
                                    <Legend verticalAlign="bottom" height={36} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                No accuracy data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Section-wise Performance Bar Chart */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', fontSize: '1.1rem' }}>
                        <FiBarChart2 color="var(--primary)" /> Section Performance
                    </h3>
                    <div style={{ width: '100%', height: '250px' }}>
                        {sectionData && sectionData.length > 0 ? (
                            <ResponsiveContainer>
                                <BarChart data={sectionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="barColor" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.2} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} domain={[0, 100]} />
                                    <Tooltip content={<CustomTooltipBar />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                                    <Bar dataKey="Accuracy" fill="url(#barColor)" radius={[4, 4, 0, 0]} animationDuration={1000} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                No section data available
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '2rem' }}>
                {/* Personal Score Trend Analysis Line Chart */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', fontSize: '1.1rem' }}>
                        <FiTrendingUp color="var(--primary)" /> Personal Score Trend
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Your score progression across recent quizzes.</p>
                    <div style={{ width: '100%', minWidth: 0, height: 300 }}>
                        {loadingHistory ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                Loading historical data...
                            </div>
                        ) : historyData && historyData.length > 0 ? (
                            <ResponsiveContainer width="99%" height={300}>
                                <LineChart data={historyData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                                    <XAxis dataKey="quiz" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} domain={[0, 100]} />
                                    <RechartsTooltip
                                        contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                        cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        stroke="#8B5CF6"
                                        strokeWidth={3}
                                        dot={{ r: 5, fill: '#0F172A', strokeWidth: 2, stroke: '#8B5CF6' }}
                                        activeDot={{ r: 7 }}
                                        animationDuration={1500}
                                        name="Score %"
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                No historical data available
                            </div>
                        )}
                    </div>
                </div>

                {/* Bottom Row: Time Analysis Area Chart */}
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '12px', boxShadow: 'var(--shadow-sm)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0 0 1rem 0', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', fontSize: '1.1rem' }}>
                        <FiClock color="var(--primary)" /> Time Spent per Question
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>Time distribution across questions (orange dot indicates spike).</p>
                    <div style={{ width: '100%', minWidth: 0, height: 300 }}>
                        {timeData.data && timeData.data.length > 0 ? (
                            <ResponsiveContainer width="99%" height={300}>
                                <AreaChart data={timeData.data} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                                    <defs>
                                        <linearGradient id="colorTime" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                                    <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} />
                                    <YAxis unit="s" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} />
                                    <RechartsTooltip
                                        contentStyle={{ background: 'var(--bg-card)', border: 'none', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
                                        itemStyle={{ color: 'var(--text-primary)' }}
                                    />
                                    <ReferenceLine y={timeData.averageLine} stroke="var(--text-muted)" strokeDasharray="3 3" label={{ position: 'top', value: `Avg: ${timeData.averageLine}s`, fill: 'var(--text-muted)', fontSize: 10 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="time"
                                        stroke="var(--primary)"
                                        fillOpacity={1}
                                        fill="url(#colorTime)"
                                        strokeWidth={3}
                                        dot={<CustomizedDot />}
                                        animationDuration={1500}
                                        name="Time Taken"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                                No timing data available
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default StudentVisualReport;
