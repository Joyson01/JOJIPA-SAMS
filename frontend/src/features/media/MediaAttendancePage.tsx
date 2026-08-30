import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Image as ImageIcon,
  Film,
  Upload,
  Play,
  RefreshCw,
  CheckCircle2,
  HelpCircle,
  Trash2,
  X,
  StopCircle,
  FileVideo,
  FileImage,
  Plus,
} from 'lucide-react';
import { fetchSessions } from '../../services/attendanceApi';
import { AttendanceSession } from '../../types/attendance';
import {
  analyzeImageAttendance,
  processVideoAttendance,
  fetchMediaJobs,
  fetchMediaJob,
  cancelMediaJob,
  deleteMediaJob,
} from '../../services/mediaAttendanceApi';
import {
  MediaAnalysisResponse,
  MediaJobResponse,
} from '../../types/mediaAttendance';

export const MediaAttendancePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'IMAGE' | 'VIDEO'>('IMAGE');
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState<boolean>(true);

  // Image Mode State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [analyzingImage, setAnalyzingImage] = useState<boolean>(false);
  const [imageResult, setImageResult] = useState<MediaAnalysisResponse | null>(null);

  // Video Mode State
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    duration: string;
    resolution: string;
    size: string;
  } | null>(null);
  const [sampleFps, setSampleFps] = useState<number>(3.0);
  const [activeVideoJob, setActiveVideoJob] = useState<MediaJobResponse | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState<boolean>(false);

  // History & Jobs State
  const [jobs, setJobs] = useState<MediaJobResponse[]>([]);
  const [selectedJobDetails, setSelectedJobDetails] = useState<MediaJobResponse | null>(null);

  const pollIntervalRef = useRef<any>(null);

  // Load Sessions & Job History
  const loadData = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const [sessionList, jobList] = await Promise.all([
        fetchSessions(),
        fetchMediaJobs(),
      ]);
      setSessions(sessionList);
      setJobs(jobList);

      const active = sessionList.find((s) => s.status === 'ACTIVE');
      if (active) {
        setSelectedSessionId(active.id);
      } else if (sessionList.length > 0) {
        setSelectedSessionId(sessionList[0].id);
      }
    } catch (err) {
      console.error('Failed to load media attendance resources:', err);
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Video Progress Polling
  useEffect(() => {
    if (activeVideoJob && (activeVideoJob.status === 'PROCESSING' || activeVideoJob.status === 'QUEUED')) {
      pollIntervalRef.current = setInterval(async () => {
        try {
          const updated = await fetchMediaJob(activeVideoJob.id);
          setActiveVideoJob(updated);
          if (updated.status === 'COMPLETED' || updated.status === 'FAILED' || updated.status === 'CANCELLED') {
            clearInterval(pollIntervalRef.current);
            // Refresh history table
            const refreshedJobs = await fetchMediaJobs();
            setJobs(refreshedJobs);
          }
        } catch (e) {
          console.warn('Job poll error:', e);
        }
      }, 1500);
    }

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [activeVideoJob]);

  // Handle Image Selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setImageResult(null);

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle Video Selection & Metadata Extraction
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setVideoFile(file);
    setActiveVideoJob(null);

    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const videoElem = document.createElement('video');
    videoElem.preload = 'metadata';
    videoElem.onloadedmetadata = () => {
      window.URL.revokeObjectURL(videoElem.src);
      const totalSec = Math.round(videoElem.duration);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      setVideoMetadata({
        duration: `${mins}m ${secs}s`,
        resolution: `${videoElem.videoWidth}x${videoElem.videoHeight}`,
        size: `${sizeMb} MB`,
      });
    };
    videoElem.src = URL.createObjectURL(file);
  };

  // Submit Image Analysis
  const handleAnalyzeImage = async () => {
    if (!imageFile || !selectedSessionId) return;

    setAnalyzingImage(true);
    setImageResult(null);
    try {
      const res = await analyzeImageAttendance(selectedSessionId, imageFile);
      setImageResult(res);
      const refreshedJobs = await fetchMediaJobs();
      setJobs(refreshedJobs);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Image analysis failed.');
    } finally {
      setAnalyzingImage(false);
    }
  };

  // Submit Video Processing
  const handleAnalyzeVideo = async () => {
    if (!videoFile || !selectedSessionId) return;

    setUploadingVideo(true);
    try {
      const job = await processVideoAttendance(selectedSessionId, videoFile, sampleFps);
      setActiveVideoJob(job);
      const refreshedJobs = await fetchMediaJobs();
      setJobs(refreshedJobs);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to submit video for processing.');
    } finally {
      setUploadingVideo(false);
    }
  };

  // Cancel Video Job
  const handleCancelJob = async (jobId: string) => {
    try {
      await cancelMediaJob(jobId);
      if (activeVideoJob?.id === jobId) {
        setActiveVideoJob((prev) => (prev ? { ...prev, status: 'CANCELLED' } : null));
      }
      const refreshedJobs = await fetchMediaJobs();
      setJobs(refreshedJobs);
    } catch (err) {
      alert('Could not cancel job.');
    }
  };

  // Delete Job
  const handleDeleteJob = async (jobId: string) => {
    if (window.confirm('Delete this media processing record and file?')) {
      try {
        await deleteMediaJob(jobId);
        if (activeVideoJob?.id === jobId) setActiveVideoJob(null);
        if (selectedJobDetails?.id === jobId) setSelectedJobDetails(null);
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
      } catch (err) {
        alert('Failed to delete media job.');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Media Attendance</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Run attendance processing on an image or prerecorded video.
        </p>
      </div>

      {/* Tabs: Image vs Video */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('IMAGE')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'IMAGE'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Image Attendance</span>
        </button>

        <button
          onClick={() => setActiveTab('VIDEO')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'VIDEO'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          <Film className="w-4 h-4" />
          <span>Video Attendance</span>
        </button>
      </div>

      {/* Session Selector Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Target Attendance Session *</label>
          <p className="text-xs text-slate-400">Select the classroom session to record attendance against.</p>
        </div>

        <div className="flex items-center gap-2">
          {loadingSessions ? (
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />
              Loading sessions...
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">No attendance sessions available.</span>
              <a
                href="/attendance"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs hover:bg-blue-100 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Session</span>
              </a>
            </div>
          ) : (
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500 shadow-inner"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject} ({s.class_name}) - [{s.status}]
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* TAB 1: IMAGE ATTENDANCE */}
      {activeTab === 'IMAGE' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">Upload Classroom Photo</h2>
            <p className="text-xs text-slate-500">
              Upload a group photo or single student portrait. Faces are detected, aligned, quality-filtered, and matched with enrolled gallery embeddings.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition border border-blue-200">
                <Upload className="w-4 h-4" />
                <span>Choose Image (JPG, PNG, WebM)</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleImageSelect} className="hidden" />
              </label>

              {imageFile && (
                <span className="text-xs font-mono text-slate-600 truncate max-w-xs">
                  ✓ {imageFile.name} ({(imageFile.size / 1024).toFixed(0)} KB)
                </span>
              )}
            </div>

            {/* Image Preview & Action */}
            {imagePreviewUrl && (
              <div className="space-y-4 pt-2">
                <div className="relative max-h-96 rounded-xl overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center shadow-inner">
                  <img src={imagePreviewUrl} alt="Classroom Preview" className="max-h-96 object-contain" />
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={handleAnalyzeImage}
                    disabled={analyzingImage || !selectedSessionId}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                  >
                    {analyzingImage ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Analyzing Photo & Marking Attendance...</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        <span>Analyze Image</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Image Analysis Results */}
          {imageResult && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Image Processing Results</h3>
                  <p className="text-xs text-slate-500">
                    Session: {imageResult.session_subject} ({imageResult.session_class}) · Latency: {imageResult.processing_time_ms} ms
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Completed</span>
                </span>
              </div>

              {/* Stat Summary Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-slate-400 font-medium">Faces Detected</div>
                  <div className="text-lg font-bold text-slate-900 mt-0.5">{imageResult.faces_detected}</div>
                </div>
                <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-emerald-600 font-medium">Recognized</div>
                  <div className="text-lg font-bold text-emerald-700 mt-0.5">{imageResult.recognized_count}</div>
                </div>
                <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-blue-600 font-medium">Attendance Marked</div>
                  <div className="text-lg font-bold text-blue-700 mt-0.5">{imageResult.attendance_marked_count}</div>
                </div>
                <div className="bg-amber-50/60 border border-amber-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-amber-600 font-medium">Uncertain</div>
                  <div className="text-lg font-bold text-amber-700 mt-0.5">{imageResult.uncertain_count}</div>
                </div>
                <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-slate-500 font-medium">Unknown</div>
                  <div className="text-lg font-bold text-slate-700 mt-0.5">{imageResult.unknown_count}</div>
                </div>
              </div>

              {/* Table of Recognized Students */}
              {imageResult.recognized_students.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-800">Verified Students Marked Present</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Roll / Code</th>
                          <th className="p-3">Confidence</th>
                          <th className="p-3">Attendance Status</th>
                          <th className="p-3">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {imageResult.recognized_students.map((st, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 font-bold text-slate-900">{st.student_name}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">
                              {st.roll_number || st.student_code || '—'}
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-600">{st.confidence_pct}%</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                {st.attendance_status}
                              </span>
                            </td>
                            <td className="p-3 text-[11px] text-slate-400">{st.remarks || 'Media Image'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Unresolved Faces Review Section */}
              {imageResult.unresolved_faces.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-2">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                    <span>Unresolved / Non-Enrolled Faces ({imageResult.unresolved_faces.length})</span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    These faces did not meet the confidence threshold or are not registered in the student gallery. No attendance was marked.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {imageResult.unresolved_faces.map((unres, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between font-bold text-slate-800">
                          <span>{unres.face_id}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] ${
                              unres.decision === 'UNCERTAIN'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {unres.decision}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Quality Score: {unres.quality_score} · Conf: {unres.confidence_pct}%
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{unres.rejection_reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: VIDEO ATTENDANCE */}
      {activeTab === 'VIDEO' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900">Upload Recorded Classroom Video</h2>
            <p className="text-xs text-slate-500">
              Upload a recorded lecture (MP4, AVI, MKV, WebM). Frames are sampled at configurable FPS, tracked sequentially with ByteTrack, temporally verified, and logged once per student.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4">
              <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition border border-blue-200">
                <Upload className="w-4 h-4" />
                <span>Choose Video File (MP4, AVI, MKV, MOV)</span>
                <input type="file" accept="video/mp4,video/avi,video/mkv,video/quicktime,video/webm" onChange={handleVideoSelect} className="hidden" />
              </label>

              {videoFile && (
                <span className="text-xs font-mono text-slate-600 truncate max-w-xs">
                  ✓ {videoFile.name}
                </span>
              )}
            </div>

            {/* Video Metadata Card */}
            {videoMetadata && (
              <div className="grid grid-cols-3 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3.5 text-center text-xs">
                <div>
                  <div className="text-slate-400 text-[10px]">Duration</div>
                  <div className="font-bold text-slate-800 mt-0.5">{videoMetadata.duration}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">Resolution</div>
                  <div className="font-bold text-slate-800 mt-0.5">{videoMetadata.resolution}</div>
                </div>
                <div>
                  <div className="text-slate-400 text-[10px]">File Size</div>
                  <div className="font-bold text-slate-800 mt-0.5">{videoMetadata.size}</div>
                </div>
              </div>
            )}

            {/* Sampling FPS & Start Action */}
            {videoFile && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs">
                  <label className="font-semibold text-slate-700">Analysis Sampling Rate:</label>
                  <select
                    value={sampleFps}
                    onChange={(e) => setSampleFps(parseFloat(e.target.value))}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800"
                  >
                    <option value="1.0">1 FPS (Fastest / Low Density)</option>
                    <option value="2.0">2 FPS (Balanced)</option>
                    <option value="3.0">3 FPS (Recommended)</option>
                    <option value="5.0">5 FPS (High Precision)</option>
                  </select>
                </div>

                <button
                  onClick={handleAnalyzeVideo}
                  disabled={uploadingVideo || !selectedSessionId || activeVideoJob?.status === 'PROCESSING'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md transition disabled:opacity-50"
                >
                  {uploadingVideo ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Uploading Video File...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Start Video Analysis</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Active Job Progress View */}
          {activeVideoJob && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Video Processing Status</h3>
                  <p className="text-xs text-slate-500">
                    {activeVideoJob.filename} · {activeVideoJob.resolution} · {activeVideoJob.duration_sec}s
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                      activeVideoJob.status === 'COMPLETED'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : activeVideoJob.status === 'PROCESSING'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                        : activeVideoJob.status === 'CANCELLED'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {activeVideoJob.status}
                  </span>

                  {activeVideoJob.status === 'PROCESSING' && (
                    <button
                      onClick={() => handleCancelJob(activeVideoJob.id)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition border border-rose-200"
                    >
                      <StopCircle className="w-3.5 h-3.5" />
                      <span>Cancel</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span>Processing Progress</span>
                  <span>{activeVideoJob.progress_pct}%</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${activeVideoJob.progress_pct}%` }}
                  />
                </div>
              </div>

              {/* Real Telemetry Counter */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-slate-400 text-[10px]">Frames Processed</div>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {activeVideoJob.frames_processed} / {activeVideoJob.frames_total}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-slate-400 text-[10px]">Faces Tracked</div>
                  <div className="font-bold text-slate-800 mt-0.5">{activeVideoJob.faces_detected_total}</div>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                  <div className="text-emerald-600 text-[10px]">Recognized Students</div>
                  <div className="font-bold text-emerald-700 mt-0.5">{activeVideoJob.recognized_count}</div>
                </div>
                <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                  <div className="text-blue-600 text-[10px]">Attendance Marked</div>
                  <div className="font-bold text-blue-700 mt-0.5">{activeVideoJob.attendance_marked_count}</div>
                </div>
              </div>

              {/* Completed Video Summary */}
              {activeVideoJob.status === 'COMPLETED' && activeVideoJob.summary_json?.recognized && (
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800">Verified Students Marked Present</h4>
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                        <tr>
                          <th className="p-3">Student Name</th>
                          <th className="p-3">Time Span</th>
                          <th className="p-3">Observations</th>
                          <th className="p-3">Max Confidence</th>
                          <th className="p-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {activeVideoJob.summary_json.recognized.map((st, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="p-3 font-bold text-slate-900">{st.student_name}</td>
                            <td className="p-3 font-mono text-[11px] text-slate-500">
                              {st.first_seen} - {st.last_seen}
                            </td>
                            <td className="p-3 font-mono text-[11px] font-semibold text-slate-700">
                              {st.observation_count} frames
                            </td>
                            <td className="p-3 font-mono font-bold text-emerald-600">{st.confidence_pct}%</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                {st.attendance_status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Processing History Section */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">Media Processing History</h3>
            <p className="text-xs text-slate-500">All image and video attendance processing jobs.</p>
          </div>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-500" />
            <span>Refresh</span>
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs space-y-2">
            <Film className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="font-semibold text-slate-700">No media processed yet</p>
            <p className="text-slate-400 max-w-sm mx-auto text-[11px]">
              Upload a classroom photo or recorded video above to create your first attendance processing job.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200 font-semibold">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Media Type</th>
                  <th className="p-3">Filename</th>
                  <th className="p-3">Session</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Faces Detected</th>
                  <th className="p-3">Attendance Marked</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-[11px] text-slate-500 font-mono">
                      {new Date(job.created_at).toLocaleDateString()} {new Date(job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          job.media_type === 'IMAGE'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-purple-50 text-purple-700'
                        }`}
                      >
                        {job.media_type === 'IMAGE' ? <FileImage className="w-3 h-3" /> : <FileVideo className="w-3 h-3" />}
                        <span>{job.media_type}</span>
                      </span>
                    </td>
                    <td className="p-3 font-semibold text-slate-800 truncate max-w-[150px]">{job.filename}</td>
                    <td className="p-3 text-slate-600">
                      {job.session_subject ? `${job.session_subject} (${job.session_class})` : job.session_id.slice(0, 8)}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700'
                            : job.status === 'PROCESSING'
                            ? 'bg-blue-50 text-blue-700 animate-pulse'
                            : job.status === 'CANCELLED'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="p-3 font-mono">{job.faces_detected_total}</td>
                    <td className="p-3 font-mono font-bold text-emerald-600">{job.attendance_marked_count}</td>
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedJobDetails(job)}
                          className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition"
                        >
                          View
                        </button>
                        <button
                          onClick={() => handleDeleteJob(job.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition"
                          title="Delete job"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Job Details View */}
      {selectedJobDetails && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>{selectedJobDetails.filename}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-normal">
                    {selectedJobDetails.media_type}
                  </span>
                </h3>
                <p className="text-xs text-slate-500">
                  Session: {selectedJobDetails.session_subject} ({selectedJobDetails.session_class})
                </p>
              </div>
              <button onClick={() => setSelectedJobDetails(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center text-xs">
              <div>
                <div className="text-slate-400 text-[10px]">Detected Faces</div>
                <div className="font-bold text-slate-800 mt-0.5">{selectedJobDetails.faces_detected_total}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Recognized</div>
                <div className="font-bold text-emerald-600 mt-0.5">{selectedJobDetails.recognized_count}</div>
              </div>
              <div>
                <div className="text-slate-400 text-[10px]">Attendance Marked</div>
                <div className="font-bold text-blue-600 mt-0.5">{selectedJobDetails.attendance_marked_count}</div>
              </div>
            </div>

            {/* Recognized Students Breakdown */}
            {selectedJobDetails.summary_json?.recognized && selectedJobDetails.summary_json.recognized.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-800">Verified Students ({selectedJobDetails.summary_json.recognized.length})</h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden text-xs">
                  {selectedJobDetails.summary_json.recognized.map((st, idx) => (
                    <div key={idx} className="p-3 bg-white flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{st.student_name}</div>
                        <div className="text-[11px] text-slate-400">
                          {st.roll_number || st.student_code} · {st.remarks || 'Recognized'}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-bold text-emerald-600 text-xs">{st.confidence_pct}%</span>
                        <div className="text-[10px] text-slate-400">PRESENT</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">No students recognized in this media job.</div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedJobDetails(null)}
                className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
