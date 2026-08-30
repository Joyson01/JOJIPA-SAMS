import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  Percent,
  Play,
  Clock,
  Video,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  MapPin,
  ArrowRight,
  RefreshCw,
  Plus,
  BookOpen,
  Camera,
  Activity,
} from 'lucide-react';
import { fetchDashboardSummary } from '../services/dashboardApi';
import { DashboardSummaryResponse } from '../types/dashboard';

interface DashboardOverviewProps {
  onNavigate?: (tab: string, studentId?: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadData = useCallback(async (showFullLoading = false) => {
    if (showFullLoading) setLoading(true);
    setIsRefreshing(true);
    setError(null);
    try {
      const summary = await fetchDashboardSummary();
      setData(summary);
    } catch (err: any) {
      console.error('Failed to load dashboard summary:', err);
      setError('Unable to load dashboard data. Please check connection and try again.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(true);
    // Real-time polling every 8 seconds while dashboard is open
    const interval = setInterval(() => {
      loadData(false);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Greeting based on client time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded w-48"></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl"></div>
          ))}
        </div>
        <div className="h-40 bg-slate-200 rounded-2xl"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 bg-slate-200 rounded-2xl"></div>
          <div className="h-64 bg-slate-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-white border border-rose-200 rounded-2xl p-12 text-center space-y-4 max-w-md mx-auto my-12 shadow-sm">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-slate-900">Dashboard Unavailable</h3>
        <p className="text-xs text-slate-500">{error}</p>
        <button
          onClick={() => loadData(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Loading</span>
        </button>
      </div>
    );
  }

  const summary = data?.summary || {
    total_students: 0,
    enrolled_students: 0,
    pending_enrollment: 0,
    present_today: 0,
    absent_today: 0,
    late_today: 0,
    excused_today: 0,
    attendance_rate_pct: 0,
  };

  const activeSession = data?.active_session;
  const todaySessions = data?.today_sessions || [];
  const upcomingSessions = data?.upcoming_sessions || [];
  const trend = data?.attendance_trend || [];
  const cameras = data?.cameras || [];
  const recentActivities = data?.recent_activities || [];
  const exceptions = data?.exceptions || [];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {getGreeting()}, Administrator. Real-time institutional overview.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadData(false)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 text-xs font-medium shadow-sm transition disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isRefreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: TOP 5 SUMMARY METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Students */}
        <div
          onClick={() => onNavigate && onNavigate('students')}
          className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 shadow-sm cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Students
            </span>
            <Users className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5">
            {summary.total_students}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {summary.total_students > 0
              ? `${summary.enrolled_students} face enrolled`
              : 'No students registered'}
          </p>
        </div>

        {/* Card 2: Face Enrolled */}
        <div
          onClick={() => onNavigate && onNavigate('enrollment')}
          className="bg-white border border-slate-200 hover:border-emerald-300 rounded-xl p-4 shadow-sm cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Face Enrolled
            </span>
            <UserCheck className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1.5">
            {summary.enrolled_students}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {summary.pending_enrollment > 0
              ? `${summary.pending_enrollment} pending capture`
              : summary.total_students > 0
              ? 'All students enrolled'
              : 'No enrolled faces'}
          </p>
        </div>

        {/* Card 3: Present Today */}
        <div
          onClick={() => onNavigate && onNavigate('attendance')}
          className="bg-white border border-slate-200 hover:border-emerald-300 rounded-xl p-4 shadow-sm cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Present Today
            </span>
            <UserCheck className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold text-emerald-700 mt-1.5">
            {summary.present_today}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {summary.present_today > 0 ? "Across today's sessions" : 'No attendance recorded'}
          </p>
        </div>

        {/* Card 4: Absent Today */}
        <div
          onClick={() => onNavigate && onNavigate('attendance')}
          className="bg-white border border-slate-200 hover:border-rose-300 rounded-xl p-4 shadow-sm cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Absent Today
            </span>
            <UserX className="w-4 h-4 text-rose-500 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold text-rose-700 mt-1.5">
            {summary.absent_today}
          </div>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            {summary.absent_today > 0 ? 'Unmarked / absentees' : 'Zero absentees'}
          </p>
        </div>

        {/* Card 5: Attendance Rate */}
        <div
          onClick={() => onNavigate && onNavigate('reports')}
          className="bg-white border border-slate-200 hover:border-blue-300 rounded-xl p-4 shadow-sm cursor-pointer transition group col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Attendance Rate
            </span>
            <Percent className="w-4 h-4 text-blue-600 group-hover:scale-110 transition" />
          </div>
          <div className="text-2xl font-bold text-blue-700 mt-1.5">
            {summary.attendance_rate_pct}%
          </div>
          <p className="text-[11px] text-slate-400 mt-1 truncate">
            Institutional rate
          </p>
        </div>
      </div>

      {/* SECTION 2: ACTIVE SESSION BANNER */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        {activeSession ? (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  LIVE ATTENDANCE ACTIVE
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">
                  {activeSession.class_name}
                </span>
              </div>

              <h2 className="text-xl font-bold text-slate-900">
                {activeSession.subject}
              </h2>

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{activeSession.room}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    {activeSession.start_time} – {activeSession.end_time} ({activeSession.elapsed_minutes}m elapsed)
                  </span>
                </span>
                <span className="flex items-center gap-1">
                  <Video className="w-3.5 h-3.5 text-slate-400" />
                  <span>Camera: {activeSession.camera_name || 'Room Webcam'}</span>
                </span>
              </div>
            </div>

            {/* Present Roster Counter & Action Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:self-center">
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-center min-w-[140px]">
                <div className="text-[11px] font-semibold text-slate-500 uppercase">Present Roster</div>
                <div className="text-xl font-bold text-slate-900 mt-0.5">
                  <span className="text-emerald-600">{activeSession.present_count}</span>
                  <span className="text-slate-400 text-sm font-normal"> / {activeSession.total_roster_count}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate && onNavigate('live')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Open Live Attendance</span>
                </button>
                <button
                  onClick={() => onNavigate && onNavigate('attendance')}
                  className="inline-flex items-center gap-1 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
                >
                  <span>View Session</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">No active attendance session</h3>
                <p className="text-xs text-slate-500">
                  Ready to launch real-time face recognition and presence tracking for a scheduled class.
                </p>
              </div>
            </div>

            <button
              onClick={() => onNavigate && onNavigate('live')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm self-start sm:self-center"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start Attendance</span>
            </button>
          </div>
        )}
      </div>

      {/* SECTION 3: TODAY'S ATTENDANCE & CAMERA STATUS (2-COLUMN) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Today's Attendance Sessions (2 Columns on Desktop) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Today's Attendance</h2>
              <p className="text-xs text-slate-500">Sessions scheduled for today's date</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('attendance')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              <span>All Sessions</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {todaySessions.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs space-y-2">
              <Calendar className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-medium text-slate-700">No attendance sessions scheduled for today</p>
              <p className="text-slate-400 max-w-xs mx-auto">
                Schedule a session in the Attendance module to track classroom attendance.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Subject & Class</th>
                    <th className="py-2.5 px-3">Room</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Present / Total</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {todaySessions.map((sess) => (
                    <tr key={sess.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-3 font-semibold text-slate-900">
                        <div>{sess.subject}</div>
                        <div className="text-[11px] text-blue-600 font-bold">{sess.class_name}</div>
                      </td>
                      <td className="py-3 px-3 text-slate-700">{sess.room}</td>
                      <td className="py-3 px-3 text-slate-700 font-mono">
                        {sess.start_time} - {sess.end_time}
                      </td>
                      <td className="py-3 px-3 font-medium">
                        <span className="text-emerald-700 font-bold">{sess.present_count + sess.late_count}</span>
                        <span className="text-slate-400"> / {sess.total_roster_count || sess.total_records}</span>
                        {sess.absent_count > 0 && (
                          <span className="text-rose-600 text-[10px] ml-1.5">({sess.absent_count} abs)</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            sess.status === 'ACTIVE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : sess.status === 'COMPLETED'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              sess.status === 'ACTIVE'
                                ? 'bg-emerald-500 animate-pulse'
                                : sess.status === 'COMPLETED'
                                ? 'bg-slate-400'
                                : 'bg-amber-500'
                            }`}
                          ></span>
                          <span>{sess.status}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onNavigate && onNavigate('attendance')}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Camera Status (1 Column on Desktop) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Camera Status</h2>
              <p className="text-xs text-slate-500">Live hardware & stream health</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('cameras')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              <span>Manage</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {cameras.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs space-y-2">
              <Camera className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-medium text-slate-700">No cameras configured</p>
              <button
                onClick={() => onNavigate && onNavigate('cameras')}
                className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-semibold"
              >
                <Plus className="w-3 h-3" />
                <span>Add First Camera</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {cameras.map((cam) => {
                const isStreaming = cam.status === 'STREAMING' || cam.status === 'CONNECTED';
                return (
                  <div
                    key={cam.id}
                    onClick={() => onNavigate && onNavigate('cameras')}
                    className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition cursor-pointer flex items-center justify-between"
                  >
                    <div className="space-y-0.5">
                      <div className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                        <span>{cam.name}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({cam.location})</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {cam.last_frame_seconds_ago !== null && cam.last_frame_seconds_ago !== undefined
                          ? `Last frame: ${cam.last_frame_seconds_ago}s ago`
                          : 'No recent frames'}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        isStreaming
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isStreaming ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                        }`}
                      ></span>
                      <span>{cam.status}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 4: ATTENDANCE TREND & UPCOMING SESSIONS (2-COLUMN) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Attendance Trend Chart (2 Columns on Desktop) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Attendance Trend</h2>
              <p className="text-xs text-slate-500">Daily attendance rate over the past 14 days</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('reports')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
            >
              <span>Full Analytics</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {trend.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs space-y-1">
              <Activity className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-medium text-slate-700">Not enough attendance data for a trend</p>
              <p className="text-slate-400 max-w-sm mx-auto">
                Attendance trends will appear automatically after daily attendance sessions are conducted.
              </p>
            </div>
          ) : (
            <div className="space-y-4 pt-2">
              <div className="flex items-end gap-2 h-36 border-b border-slate-100 pb-2">
                {trend.map((t, idx) => (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end group">
                    <span className="text-[10px] text-slate-500 opacity-0 group-hover:opacity-100 transition font-bold">
                      {t.attendance_pct}%
                    </span>
                    <div
                      className="w-full bg-blue-100 group-hover:bg-blue-600 rounded-t-md transition-all duration-300"
                      style={{ height: `${Math.max(8, t.attendance_pct)}%` }}
                    ></div>
                    <span className="text-[10px] text-slate-500 font-medium">{t.day_label}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                <span>Calculated from verified attendance records</span>
                <span className="font-semibold text-slate-700">
                  Avg: {summary.attendance_rate_pct}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Upcoming Sessions (1 Column on Desktop) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-bold text-slate-900 text-base">Upcoming Sessions</h2>
              <p className="text-xs text-slate-500">Next scheduled classes</p>
            </div>
            <button
              onClick={() => onNavigate && onNavigate('attendance')}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
            >
              View All
            </button>
          </div>

          {upcomingSessions.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-xs space-y-1">
              <Clock className="w-8 h-8 mx-auto text-slate-300" />
              <p className="font-medium text-slate-700">No upcoming sessions</p>
              <p className="text-slate-400 max-w-xs mx-auto">
                Schedule future classes in the Attendance module.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {upcomingSessions.map((u) => (
                <div
                  key={u.id}
                  onClick={() => onNavigate && onNavigate('attendance')}
                  className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 transition cursor-pointer flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="font-semibold text-slate-900 text-xs">{u.subject}</div>
                    <div className="text-[11px] text-slate-500">
                      {u.class_name} • {u.room} • {u.start_time}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    UPCOMING
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 5: RECENT ACTIVITY (FULL-WIDTH) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900 text-base">Recent Activity</h2>
            <p className="text-xs text-slate-500">Live chronological record of attendance, recognition, and audit events</p>
          </div>
        </div>

        {recentActivities.length === 0 ? (
          <div className="py-10 text-center text-slate-400 text-xs space-y-1">
            <Activity className="w-8 h-8 mx-auto text-slate-300" />
            <p className="font-medium text-slate-700">No recent activity</p>
            <p className="text-slate-400">Events will appear here as attendance sessions run.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentActivities.map((act) => (
              <div key={act.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      act.event_type === 'ATTENDANCE'
                        ? 'bg-emerald-50 text-emerald-600'
                        : act.event_type === 'UNKNOWN_FACE'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    {act.event_type === 'ATTENDANCE' ? (
                      <UserCheck className="w-3.5 h-3.5" />
                    ) : act.event_type === 'UNKNOWN_FACE' ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : (
                      <Activity className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{act.title}</div>
                    <div className="text-[11px] text-slate-400">{act.subtitle}</div>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-slate-400">{act.time_ago}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTION 6: NEEDS ATTENTION & QUICK ACTIONS (2-COLUMN) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Needs Attention / Exceptions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 text-base">Needs Attention</h2>

          {exceptions.length === 0 ? (
            <div className="py-8 flex items-center gap-3 text-emerald-700 bg-emerald-50/60 p-4 rounded-xl border border-emerald-100">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              <div>
                <div className="font-semibold text-xs text-emerald-900">Everything looks good</div>
                <div className="text-[11px] text-emerald-700">No unresolved attendance issues or offline cameras.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {exceptions.map((exc, idx) => (
                <div
                  key={idx}
                  onClick={() => exc.action_tab && onNavigate && onNavigate(exc.action_tab)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                    exc.severity === 'danger'
                      ? 'bg-rose-50/70 border-rose-200 text-rose-900 hover:bg-rose-100/70'
                      : exc.severity === 'warning'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900 hover:bg-amber-100/70'
                      : 'bg-blue-50/70 border-blue-200 text-blue-900 hover:bg-blue-100/70'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs">{exc.title}</div>
                    <div className="text-[11px] text-slate-600">{exc.description}</div>
                  </div>
                  {exc.action_tab && (
                    <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
          <h2 className="font-bold text-slate-900 text-base">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onNavigate && onNavigate('students')}
              className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition mb-2">
                <Plus className="w-4 h-4" />
              </div>
              <div className="font-bold text-xs text-slate-900">Register Student</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Add a new student profile</div>
            </button>

            <button
              onClick={() => onNavigate && onNavigate('live')}
              className="p-3.5 rounded-xl bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-200 transition text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition mb-2">
                <Play className="w-4 h-4" />
              </div>
              <div className="font-bold text-xs text-slate-900">Start Attendance</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Launch live camera scanning</div>
            </button>

            <button
              onClick={() => onNavigate && onNavigate('subjects')}
              className="p-3.5 rounded-xl bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-200 transition text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition mb-2">
                <BookOpen className="w-4 h-4" />
              </div>
              <div className="font-bold text-xs text-slate-900">Manage Subjects</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Subjects & class sections</div>
            </button>

            <button
              onClick={() => onNavigate && onNavigate('cameras')}
              className="p-3.5 rounded-xl bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-200 transition text-left group"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition mb-2">
                <Camera className="w-4 h-4" />
              </div>
              <div className="font-bold text-xs text-slate-900">Add Camera</div>
              <div className="text-[11px] text-slate-500 mt-0.5">Webcam, mobile, or RTSP</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
