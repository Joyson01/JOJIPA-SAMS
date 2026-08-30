import React, { useState, useEffect, useCallback } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  Play,
  Square,
  Plus,
  ArrowLeft,
  RefreshCw,
  Edit3,
  X,
} from 'lucide-react';
import {
  fetchSessions,
  fetchSessionById,
  createSession,
  startSession,
  closeSession,
  fetchSessionRecords,
  overrideRecord,
} from '../../services/attendanceApi';
import { fetchSubjects, fetchClasses } from '../../services/subjectApi';
import { fetchCameras } from '../../services/cameraApi';
import {
  AttendanceRecord,
  AttendanceSession,
  SessionCreatePayload,
} from '../../types/attendance';
import { Subject, ClassSection } from '../../types/subject';
import { CameraDevice } from '../../types/camera';

export const AttendancePage: React.FC = () => {
  // Session List State
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters
  const [filterClass, setFilterClass] = useState<string>('');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterDateRange, setFilterDateRange] = useState<string>('all'); // all, today, this_week

  // Selected Session Detail View
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<AttendanceSession | null>(null);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false);
  const [recordFilterStatus, setRecordFilterStatus] = useState<string>('');

  // Dropdown reference data
  const [availableSubjects, setAvailableSubjects] = useState<Subject[]>([]);
  const [availableClasses, setAvailableClasses] = useState<ClassSection[]>([]);
  const [availableCameras, setAvailableCameras] = useState<CameraDevice[]>([]);

  // Create Session Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<SessionCreatePayload>({
    class_name: '',
    subject: '',
    subject_id: '',
    class_id: '',
    room: 'Room 204',
    scheduled_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    late_threshold_minutes: 10,
    attendance_mode: 'AI_FACE_RECOGNITION',
    camera_id: '',
  });

  // Manual Override / Excused Modal
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState<boolean>(false);
  const [selectedRecord, setSelectedRecord] = useState<AttendanceRecord | null>(null);
  const [overrideStatus, setOverrideStatus] = useState<string>('PRESENT');
  const [overrideRemarks, setOverrideRemarks] = useState<string>('');
  const [overrideSubmitting, setOverrideSubmitting] = useState<boolean>(false);

  // Form error message
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Sessions
  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      let dateParam: string | undefined = undefined;
      if (filterDateRange === 'today') {
        dateParam = new Date().toISOString().split('T')[0];
      }

      const list = await fetchSessions({
        class_name: filterClass || undefined,
        subject_id: filterSubject || undefined,
        status: filterStatus || undefined,
        scheduled_date: dateParam,
      });
      setSessions(list);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [filterClass, filterSubject, filterStatus, filterDateRange]);

  // Load Reference Data (Subjects, Classes, Cameras)
  const loadReferenceData = async () => {
    try {
      const [subjList, clsList, camList] = await Promise.all([
        fetchSubjects(undefined, undefined, 'ACTIVE'),
        fetchClasses(undefined, undefined, 'ACTIVE'),
        fetchCameras(),
      ]);
      setAvailableSubjects(subjList);
      setAvailableClasses(clsList);
      setAvailableCameras(camList);

      if (clsList.length > 0 && !createForm.class_name) {
        setCreateForm((prev) => ({
          ...prev,
          class_name: clsList[0].name,
          class_id: clsList[0].id,
        }));
      }
      if (subjList.length > 0 && !createForm.subject) {
        setCreateForm((prev) => ({
          ...prev,
          subject: subjList[0].name,
          subject_id: subjList[0].id,
        }));
      }
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  };

  useEffect(() => {
    loadSessions();
    loadReferenceData();
  }, [loadSessions]);

  // Load Selected Session Records
  const loadSessionDetails = useCallback(async (sessionId: string) => {
    setLoadingRecords(true);
    try {
      const [sess, recList] = await Promise.all([
        fetchSessionById(sessionId),
        fetchSessionRecords(sessionId, recordFilterStatus || undefined),
      ]);
      setSelectedSession(sess);
      setRecords(recList);
    } catch (err) {
      console.error('Failed to load session details:', err);
    } finally {
      setLoadingRecords(false);
    }
  }, [recordFilterStatus]);

  useEffect(() => {
    if (selectedSessionId) {
      loadSessionDetails(selectedSessionId);
    }
  }, [selectedSessionId, loadSessionDetails]);

  // Handle Start Session
  const handleStart = async (sessionId: string) => {
    try {
      await startSession(sessionId);
      loadSessions();
      if (selectedSessionId === sessionId) {
        loadSessionDetails(sessionId);
      }
    } catch (err) {
      alert('Failed to start session.');
    }
  };

  // Handle Close Session
  const handleClose = async (sessionId: string) => {
    if (
      window.confirm(
        'Are you sure you want to finalize and close this session? Any unverified enrolled students in this class will be automatically marked ABSENT.'
      )
    ) {
      try {
        await closeSession(sessionId, true);
        loadSessions();
        if (selectedSessionId === sessionId) {
          loadSessionDetails(sessionId);
        }
      } catch (err) {
        alert('Failed to close session.');
      }
    }
  };

  // Handle Create Session Submit
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!createForm.class_name) {
      setErrorMessage('Please select an academic class.');
      return;
    }
    if (!createForm.subject) {
      setErrorMessage('Please select an academic subject.');
      return;
    }

    try {
      await createSession(createForm);
      setIsCreateModalOpen(false);
      loadSessions();
    } catch (err: any) {
      setErrorMessage(
        err.response?.data?.detail?.message ||
        err.response?.data?.detail ||
        'Failed to schedule session.'
      );
    }
  };

  // Handle Manual Override / Excused Submit
  const handleOverrideSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;
    setOverrideSubmitting(true);
    try {
      await overrideRecord(selectedRecord.id, {
        status: overrideStatus as any,
        remarks: overrideRemarks || 'Faculty approved adjustment',
      });
      setIsOverrideModalOpen(false);
      setSelectedRecord(null);
      if (selectedSessionId) {
        loadSessionDetails(selectedSessionId);
      }
      loadSessions();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || 'Failed to update attendance record.');
    } finally {
      setOverrideSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* VIEW A: SESSION DETAIL VIEW */}
      {selectedSessionId && selectedSession ? (
        <div className="space-y-6">
          {/* Back button & Title Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setSelectedSessionId(null);
                  setSelectedSession(null);
                  setRecords([]);
                }}
                className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span>{selectedSession.subject}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">
                    {selectedSession.class_name}
                  </span>
                </h1>
                <div className="flex items-center gap-4 text-xs text-slate-500 mt-1">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{selectedSession.scheduled_date}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {selectedSession.start_time.slice(0, 5)} - {selectedSession.end_time.slice(0, 5)}
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{selectedSession.room}</span>
                  </span>
                  <span>(Late after {selectedSession.late_threshold_minutes}m)</span>
                </div>
              </div>
            </div>

            {/* Session Action Buttons */}
            <div className="flex items-center gap-2">
              {selectedSession.status === 'SCHEDULED' && (
                <button
                  onClick={() => handleStart(selectedSession.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Attendance</span>
                </button>
              )}
              {selectedSession.status === 'ACTIVE' && (
                <button
                  onClick={() => handleClose(selectedSession.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Close & Mark Absentees</span>
                </button>
              )}
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg ${
                  selectedSession.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : selectedSession.status === 'COMPLETED'
                    ? 'bg-slate-100 text-slate-700'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    selectedSession.status === 'ACTIVE'
                      ? 'bg-emerald-500 animate-pulse'
                      : selectedSession.status === 'COMPLETED'
                      ? 'bg-slate-400'
                      : 'bg-amber-500'
                  }`}
                ></span>
                <span>{selectedSession.status}</span>
              </span>
            </div>
          </div>

          {/* Metric Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="text-slate-400 text-xs font-medium">Total Records</div>
              <div className="text-2xl font-bold text-slate-900 mt-1">
                {selectedSession.total_records}
              </div>
            </div>
            <div className="bg-white border border-emerald-100 rounded-xl p-4 shadow-sm">
              <div className="text-emerald-600 text-xs font-medium">Present (On-Time)</div>
              <div className="text-2xl font-bold text-emerald-700 mt-1">
                {selectedSession.present_count}
              </div>
            </div>
            <div className="bg-white border border-amber-100 rounded-xl p-4 shadow-sm">
              <div className="text-amber-600 text-xs font-medium">Late Arrival</div>
              <div className="text-2xl font-bold text-amber-700 mt-1">
                {selectedSession.late_count}
              </div>
            </div>
            <div className="bg-white border border-rose-100 rounded-xl p-4 shadow-sm">
              <div className="text-rose-600 text-xs font-medium">Absent</div>
              <div className="text-2xl font-bold text-rose-700 mt-1">
                {selectedSession.absent_count}
              </div>
            </div>
            <div className="bg-white border border-purple-100 rounded-xl p-4 shadow-sm">
              <div className="text-purple-600 text-xs font-medium">Excused Leave</div>
              <div className="text-2xl font-bold text-purple-700 mt-1">
                {selectedSession.excused_count}
              </div>
            </div>
          </div>

          {/* Attendance Roster Table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm space-y-4">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Attendance Roster</h3>
              <div className="flex items-center gap-2">
                <select
                  value={recordFilterStatus}
                  onChange={(e) => setRecordFilterStatus(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-700 focus:bg-white focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="ABSENT">Absent</option>
                  <option value="EXCUSED">Excused</option>
                </select>
                <button
                  onClick={() => loadSessionDetails(selectedSession.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {loadingRecords ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
                Loading records...
              </div>
            ) : records.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs space-y-1">
                <Users className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p className="font-medium text-slate-700">No attendance marked yet</p>
                <p className="text-slate-400 max-w-xs mx-auto">
                  Start the session to recognize student faces or record manual attendance.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Roll Number</th>
                    <th className="py-3 px-4">First Seen</th>
                    <th className="py-3 px-4">Last Seen</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((rec) => {
                    const isPresent = rec.status === 'PRESENT' || rec.status === 'MANUAL_PRESENT';
                    const isLate = rec.status === 'LATE';
                    const isExcused = rec.status === 'EXCUSED' || rec.status === 'MANUAL_EXCUSED';

                    return (
                      <tr key={rec.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          {rec.student_name}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700">{rec.roll_number}</td>
                        <td className="py-3.5 px-4 text-slate-700">
                          {new Date(rec.first_seen).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700">
                          {new Date(rec.last_seen).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              isPresent
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isLate
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : isExcused
                                ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            <span>{rec.status.replace('MANUAL_', '')}</span>
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                            {rec.source}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedRecord(rec);
                              setOverrideStatus(rec.status.replace('MANUAL_', ''));
                              setOverrideRemarks(rec.remarks || '');
                              setIsOverrideModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition"
                            title="Manual Override / Excuse"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* VIEW B: SESSIONS LIST VIEW */
        <div className="space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Attendance Sessions
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                Schedule, monitor, and finalize automated attendance sessions for classes.
              </p>
            </div>

            <button
              onClick={() => {
                setErrorMessage(null);
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Session</span>
            </button>
          </div>

          {/* Clean Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center gap-3">
            {/* Date Range Quick Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
              <button
                onClick={() => setFilterDateRange('all')}
                className={`px-3 py-1 rounded-md transition ${
                  filterDateRange === 'all' ? 'bg-white shadow text-slate-900 font-bold' : ''
                }`}
              >
                All Dates
              </button>
              <button
                onClick={() => setFilterDateRange('today')}
                className={`px-3 py-1 rounded-md transition ${
                  filterDateRange === 'today' ? 'bg-white shadow text-slate-900 font-bold' : ''
                }`}
              >
                Today
              </button>
            </div>

            {/* Class Filter */}
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="">All Classes</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Subject Filter */}
            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="">All Subjects</option>
              {availableSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 focus:bg-white focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="SCHEDULED">Scheduled</option>
              <option value="ACTIVE">Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <button
              onClick={() => {
                setFilterClass('');
                setFilterSubject('');
                setFilterStatus('');
                setFilterDateRange('all');
              }}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1"
            >
              Clear
            </button>
          </div>

          {/* Session Cards Grid or Clean Empty State */}
          {loading ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-blue-600 mb-2" />
              Loading attendance sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-sm">
              <Calendar className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-semibold text-slate-800">
                No attendance sessions yet.
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Schedule an academic attendance session to begin face-recognition attendance tracking.
              </p>
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setIsCreateModalOpen(true);
                }}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create First Session</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((sess) => {
                const isActive = sess.status === 'ACTIVE';
                const isCompleted = sess.status === 'COMPLETED';

                return (
                  <div
                    key={sess.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:border-slate-300 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-sm">{sess.subject}</h3>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold">
                          {sess.class_name}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : isCompleted
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive
                                ? 'bg-emerald-500 animate-pulse'
                                : isCompleted
                                ? 'bg-slate-400'
                                : 'bg-amber-500'
                            }`}
                          ></span>
                          <span>{sess.status}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{sess.scheduled_date}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {sess.start_time.slice(0, 5)} - {sess.end_time.slice(0, 5)}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{sess.room}</span>
                        </span>
                        <span className="font-medium text-slate-700">
                          {sess.present_count} Present • {sess.late_count} Late • {sess.absent_count} Absent
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {sess.status === 'SCHEDULED' && (
                        <button
                          onClick={() => handleStart(sess.id)}
                          className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition flex items-center gap-1"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Start</span>
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedSessionId(sess.id)}
                        className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE SESSION */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Schedule Attendance Session</h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              {/* Class / Section Dropdown */}
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Class / Section *</label>
                {availableClasses.length === 0 ? (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    No classes available. Please register a class in Academic Setup first.
                  </div>
                ) : (
                  <select
                    required
                    value={createForm.class_id || ''}
                    onChange={(e) => {
                      const cls = availableClasses.find((c) => c.id === e.target.value);
                      setCreateForm({
                        ...createForm,
                        class_id: e.target.value,
                        class_name: cls ? cls.name : '',
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select Class / Batch</option>
                    {availableClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.department})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Subject Dropdown */}
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Subject *</label>
                {availableSubjects.length === 0 ? (
                  <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                    No subjects available. Please add a subject in Academic Setup first.
                  </div>
                ) : (
                  <select
                    required
                    value={createForm.subject_id || ''}
                    onChange={(e) => {
                      const subj = availableSubjects.find((s) => s.id === e.target.value);
                      setCreateForm({
                        ...createForm,
                        subject_id: e.target.value,
                        subject: subj ? subj.name : '',
                      });
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select Subject</option>
                    {availableSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Room and Date */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Room / Hall *</label>
                  <input
                    type="text"
                    required
                    value={createForm.room}
                    onChange={(e) => setCreateForm({ ...createForm, room: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Scheduled Date *</label>
                  <input
                    type="date"
                    required
                    value={createForm.scheduled_date}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, scheduled_date: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Start & End Time */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={createForm.start_time}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, start_time: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">End Time *</label>
                  <input
                    type="time"
                    required
                    value={createForm.end_time}
                    onChange={(e) => setCreateForm({ ...createForm, end_time: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Late Threshold & Camera */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Late After (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={createForm.late_threshold_minutes}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        late_threshold_minutes: parseInt(e.target.value) || 10,
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-medium text-slate-700">Camera Source</label>
                  <select
                    value={createForm.camera_id || ''}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        camera_id: e.target.value,
                        camera_ids: e.target.value ? [e.target.value] : [],
                      })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">(Default Live Camera)</option>
                    {availableCameras.map((cam) => (
                      <option key={cam.id} value={cam.id}>
                        {cam.name} ({cam.location})
                      </option>
                    ))}
                  </select>
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
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm"
                >
                  Save Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL OVERRIDE / EXCUSED ABSENCE */}
      {isOverrideModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Manual Attendance Override</h3>
                <p className="text-xs text-slate-500">
                  {selectedRecord.student_name} ({selectedRecord.roll_number})
                </p>
              </div>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleOverrideSubmit} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-slate-700">Attendance Status *</label>
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                >
                  <option value="PRESENT">PRESENT</option>
                  <option value="LATE">LATE</option>
                  <option value="ABSENT">ABSENT</option>
                  <option value="EXCUSED">EXCUSED (Approved Leave)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-medium text-slate-700">Reason / Remark *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Student submitted authorized medical certificate"
                  value={overrideRemarks}
                  onChange={(e) => setOverrideRemarks(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOverrideModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideSubmitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm flex items-center gap-1"
                >
                  {overrideSubmitting && <RefreshCw className="w-3 h-3 animate-spin" />}
                  <span>Save Override</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
