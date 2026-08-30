import React, { useState, useEffect } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Percent,
  Plus,
  Play,
  FileText,
  Clock,
} from 'lucide-react';
import { fetchStudentStats } from '../services/studentApi';
import { fetchInstitutionAnalytics } from '../services/reportsApi';
import { fetchSessions } from '../services/attendanceApi';
import { StudentStats } from '../types/student';
import { InstitutionAnalyticsResponse } from '../types/reports';
import { AttendanceSession } from '../types/attendance';

interface DashboardOverviewProps {
  onNavigate?: (tab: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const [studentStats, setStudentStats] = useState<StudentStats | null>(null);
  const [analytics, setAnalytics] = useState<InstitutionAnalyticsResponse | null>(null);
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      setLoading(true);
      try {
        const [statsData, analyticsData, sessionsData] = await Promise.allSettled([
          fetchStudentStats(),
          fetchInstitutionAnalytics(),
          fetchSessions(),
        ]);

        if (statsData.status === 'fulfilled') {
          setStudentStats(statsData.value);
        }
        if (analyticsData.status === 'fulfilled') {
          setAnalytics(analyticsData.value);
        }
        if (sessionsData.status === 'fulfilled') {
          setSessions(sessionsData.value);
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const totalStudents = studentStats?.total_students ?? 0;
  
  const todayTrend = analytics?.daily_trends && analytics.daily_trends.length > 0 
    ? analytics.daily_trends[analytics.daily_trends.length - 1]
    : null;

  const presentToday = todayTrend?.present_count ?? 0;
  const absentToday = todayTrend?.absent_count ?? 0;
  const attendanceRate = analytics?.overall_attendance_rate_pct ?? (
    totalStudents > 0 && (presentToday + absentToday > 0)
      ? Math.round((presentToday / (presentToday + absentToday)) * 100)
      : 0
  );

  const activeSession = sessions.find((s) => s.status === 'ACTIVE');

  return (
    <div className="space-y-8">
      {/* Header Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
        <p className="text-sm text-slate-500 mt-1">Good morning, Administrator.</p>
      </div>

      {/* 4 Summary Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Students</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? '-' : totalStudents}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {studentStats?.enrolled_count ?? 0} face enrolled
          </p>
        </div>

        {/* Present Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Present Today</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? '-' : presentToday}
          </div>
          <p className="text-xs text-slate-400 mt-1">Recorded entries</p>
        </div>

        {/* Absent Today */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Absent Today</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? '-' : absentToday}
          </div>
          <p className="text-xs text-slate-400 mt-1">Unmarked students</p>
        </div>

        {/* Attendance Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attendance</span>
            <Percent className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-slate-900 mt-2">
            {loading ? '-' : `${attendanceRate}%`}
          </div>
          <p className="text-xs text-slate-400 mt-1">Overall institutional rate</p>
        </div>
      </div>

      {/* Today's Attendance / Active Session Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Today's Attendance</h2>
          {activeSession && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live: {activeSession.class_name} ({activeSession.subject})
            </span>
          )}
        </div>

        {/* Attendance Table or Empty State */}
        {sessions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-3">
            <Clock className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-800">No attendance recorded today</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Start a live attendance session to begin recognizing faces and tracking student presence.
            </p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('live')}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Live Attendance</span>
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Class & Subject</th>
                  <th className="px-4 py-3">Room</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50/80 transition">
                    <td className="px-5 py-3.5 font-medium text-slate-900">
                      <div>{session.subject}</div>
                      <div className="text-[11px] text-slate-500">{session.class_name}</div>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">{session.room}</td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {session.start_time.slice(0, 5)} - {session.end_time.slice(0, 5)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${
                          session.status === 'ACTIVE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate(session.status === 'ACTIVE' ? 'live' : 'attendance')}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View Session
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quick Actions Section */}
      <div className="space-y-3 pt-2">
        <h2 className="text-lg font-semibold text-slate-900">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {onNavigate && (
            <>
              <button
                onClick={() => onNavigate('students')}
                className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm transition text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Register Student</div>
                  <div className="text-xs text-slate-500">Add a new student profile</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('live')}
                className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm transition text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Play className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">Start Attendance</div>
                  <div className="text-xs text-slate-500">Launch live camera tracking</div>
                </div>
              </button>

              <button
                onClick={() => onNavigate('reports')}
                className="flex items-center gap-3 p-4 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-sm transition text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">View Reports</div>
                  <div className="text-xs text-slate-500">Export attendance records</div>
                </div>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
