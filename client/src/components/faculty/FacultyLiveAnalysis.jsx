import { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    PieChart, Pie, Cell, Legend
} from 'recharts';
import {
    FiTrendingUp, FiClock, FiCheckCircle, FiUsers,
    FiPieChart, FiBarChart2, FiActivity, FiAlertCircle
} from 'react-icons/fi';

const FacultyLiveAnalysis = ({ leaderboard = [], responses = [], absentStudents = [], totalQuestions, quiz }) => {

    const attendanceData = useMemo(() => {
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

    const COLORS = ['#6366F1', '#10B981', '#F43F5E', '#F59E0B', '#0EA5E9'];

    return (
        <div className="faculty-analysis-dashboard">
            {/* Quick Stats */}
            <div className="analysis-card visual-card attendance-card" style={{ gridColumn: 'span 2' }}>
                <div className="card-header-visual">
                    <FiUsers className="icon-blue" />
                    <h3>Live Status Overview</h3>
                </div>
                <div className="attendance-content">
                    <div className="attendance-stats">
                        <div className="attendance-main-pill">
                            <span className="rate">{attendanceData.rate}%</span>
                            <span className="lbl">Attendance</span>
                        </div>
                        <div className="attendance-breakdown">
                            <div className="att-item success">
                                <span className="val">{attendanceData.attended}</span>
                                <span className="lab">Present</span>
                            </div>
                            <div className="att-item danger">
                                <span className="val">{attendanceData.absent}</span>
                                <span className="lab">Absent</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Attendance Chart */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiPieChart className="icon-purple" />
                    <h3>Attendance Distribution</h3>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <PieChart width={300} height={200}>
                        <Pie
                            data={attendanceData.chart}
                            cx={150}
                            cy={100}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {attendanceData.chart.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </div>
            </div>

            {/* Accuracy Chart */}
            <div className="analysis-card visual-card">
                <div className="card-header-visual">
                    <FiCheckCircle className="icon-emerald" />
                    <h3>Accuracy Overview</h3>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <PieChart width={300} height={200}>
                        <Pie
                            data={accuracyOverview}
                            cx={150}
                            cy={100}
                            innerRadius={60}
                            outerRadius={80}
                            dataKey="value"
                        >
                            {accuracyOverview.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                </div>
            </div>

            <div className="analysis-card visual-card full-width insight-banner">
                <div className="insight-content">
                    <FiActivity className="insight-icon" />
                    <div className="text">
                        <h4>Real-time Monitoring</h4>
                        <p>Showing live updates as students submit their responses. Navigate to 'Ranking' for detailed student-wise progress.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FacultyLiveAnalysis;
