import React, { useState, useEffect } from 'react';
import {
  Calendar,
  CheckCircle,
  RefreshCw,
  Search,
  Plus,
  X,
  Play,
  Check,
} from 'lucide-react';
import {
  fetchSessions,
  fetchSessionRecords,
  createSession,
  startSession,
  closeSession,
  overrideRecord,
} from '../../services/attendanceApi';
import {
  AttendanceSession,
  AttendanceRecord,
  SessionCreatePayload,
} from '../../types/attendance';

export const AttendancePage: React.FC = () => {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Create Session Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [sessionFormData, setSessionFormData] = useState<SessionCreatePayload>({
    session_code: `SESS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
    class_name: 'CSE-4A',
    subject: 'Computer Science',
    room: 'Room 204',
    scheduled_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:30',
  });
  const [creatingSession, setCreatingSession] = useState<boolean>(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await fetchSessions();
      setSessions(data);
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const loadRecords = async (sessionId: string) => {
    if (!sessionId) {
      setRecords([]);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchSessionRecords(sessionId);
      setRecords(data);
    } catch (err) {
      console.error('Failed to load session records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedSessionId) {
      loadRecords(selectedSessionId);
    }
  }, [selectedSessionId]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const handleCreateSessionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingSession(true);
    try {
      const newSess = await createSession(sessionFormData);
      setIsCreateModalOpen(false);
      await loadSessions();
      setSelectedSessionId(newSess.id);
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || 'Failed to create session.');
    } finally {
      setCreatingSession(false);
    }
  };

  const handleStartSession = async (sessId: string) => {
    try {
      await startSession(sessId);
      loadSessions();
    } catch (err) {
      alert('Could not start session.');
    }
  };

  const handleCloseSession = async (sessId: string) => {
    if (!confirm('Close this attendance session and finalize records?')) return;
    try {
      await closeSession(sessId, true);
      loadSessions();
    } catch (err) {
      alert('Could not close session.');
    }
  };

  const handleOverride = async (record: AttendanceRecord, newStatus: 'PRESENT' | 'ABSENT') => {
    try {
      await overrideRecord(record.id, {
        status: newStatus === 'PRESENT' ? 'MANUAL_PRESENT' : 'MANUAL_ABSENT',
        remarks: 'Manual faculty override',
      });
      loadRecords(selectedSessionId);
    } catch (err) {
      alert('Failed to override record.');
    }
  };

  const filteredRecords = records.filter((item) => {
    const matchesSearch =
      search === '' ||
      item.student_name.toLowerCase().includes(search.toLowerCase()) ||
      item.student_code.toLowerCase().includes(search.toLowerCase()) ||
      item.roll_number.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      filterStatus === 'ALL' || item.status.toUpperCase().includes(filterStatus.toUpperCase());

    return matchesSearch && matchesStatus;
  });

  const presentCount = records.filter((r) => r.status === 'PRESENT' || r.status === 'MANUAL_PRESENT').length;
  const absentCount = records.filter((r) => r.status === 'ABSENT' || r.status === 'MANUAL_ABSENT').length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Attendance Sessions</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Create class sessions, monitor student rosters, and manage attendance overrides.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSessionFormData({
                session_code: `SESS-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
                class_name: 'CSE-4A',
                subject: '',
                room: 'Room 204',
                scheduled_date: new Date().toISOString().split('T')[0],
                start_time: '09:00',
                end_time: '10:30',
              });
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Session</span>
          </button>
        </div>
      </div>

      {/* Session Selector & Active Session Controls */}
      {sessions.length > 0 && selectedSession && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 shrink-0">Selected Session:</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject} ({s.class_name}) - {s.scheduled_date} [{s.status}]
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {selectedSession.status === 'SCHEDULED' && (
              <button
                onClick={() => handleStartSession(selectedSession.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start Session</span>
              </button>
            )}

            {selectedSession.status === 'ACTIVE' && (
              <button
                onClick={() => handleCloseSession(selectedSession.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Finalize & Close Session</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Metric Cards */}
      {selectedSession && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            onClick={() => setFilterStatus('ALL')}
            className={`p-4 rounded-xl border text-left transition ${
              filterStatus === 'ALL'
                ? 'bg-white border-blue-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium text-slate-500">Total Enrolled / Recorded</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{records.length}</div>
          </button>

          <button
            onClick={() => setFilterStatus('PRESENT')}
            className={`p-4 rounded-xl border text-left transition ${
              filterStatus === 'PRESENT'
                ? 'bg-white border-emerald-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium text-emerald-600">Present</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{presentCount}</div>
          </button>

          <button
            onClick={() => setFilterStatus('ABSENT')}
            className={`p-4 rounded-xl border text-left transition ${
              filterStatus === 'ABSENT'
                ? 'bg-white border-rose-500 shadow-sm'
                : 'bg-white border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="text-xs font-medium text-rose-600">Absent</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{absentCount}</div>
          </button>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student records..."
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 shadow-sm"
          />
        </div>
      </div>

      {/* Records Table or Empty State */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
            Loading attendance records...
          </div>
        ) : sessions.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Calendar className="w-8 h-8 text-slate-300 mx-auto" />
            <h3 className="text-base font-semibold text-slate-800">No attendance sessions yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create a class session to begin taking face attendance.
            </p>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create First Session</span>
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            No attendance records found matching your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-4 py-3.5">Roll Number</th>
                  <th className="px-4 py-3.5">Time Seen</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5 text-right">Override Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((item) => {
                  const isPresent = item.status.includes('PRESENT');
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900">{item.student_name}</div>
                        <div className="text-[10px] text-slate-400">{item.student_code}</div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-700 font-medium">{item.roll_number}</td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {item.first_seen
                          ? new Date(item.first_seen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '-'}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                            isPresent
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.status === 'LATE'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-rose-50 text-rose-700'
                          }`}
                        >
                          {isPresent && <CheckCircle className="w-3 h-3" />}
                          <span>{item.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-2">
                        {isPresent ? (
                          <button
                            onClick={() => handleOverride(item, 'ABSENT')}
                            className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-1 rounded hover:bg-rose-50"
                          >
                            Mark Absent
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOverride(item, 'PRESENT')}
                            className="text-xs text-emerald-600 hover:text-emerald-800 font-medium px-2 py-1 rounded hover:bg-emerald-50"
                          >
                            Mark Present
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Create Session */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-base">Create Attendance Session</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSessionSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Subject / Course Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Data Structures & Algorithms"
                  value={sessionFormData.subject}
                  onChange={(e) => setSessionFormData({ ...sessionFormData, subject: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Class Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CSE-4A"
                    value={sessionFormData.class_name}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, class_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Room / Hall</label>
                  <input
                    type="text"
                    placeholder="e.g. Room 204"
                    value={sessionFormData.room}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, room: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Date</label>
                  <input
                    type="date"
                    required
                    value={sessionFormData.scheduled_date}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, scheduled_date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Start Time</label>
                  <input
                    type="time"
                    required
                    value={sessionFormData.start_time}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, start_time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-slate-700">End Time</label>
                  <input
                    type="time"
                    required
                    value={sessionFormData.end_time}
                    onChange={(e) => setSessionFormData({ ...sessionFormData, end_time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingSession}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm flex items-center gap-1.5"
                >
                  {creatingSession && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create Session</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
