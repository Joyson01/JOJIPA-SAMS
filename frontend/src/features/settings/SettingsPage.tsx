import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, Activity, Server, Database, Cpu } from 'lucide-react';
import { fetchHealthStatus, apiClient } from '../../services/api';
import { ServiceHealthResponse } from '../../types';

export const SettingsPage: React.FC = () => {
  const [institutionName, setInstitutionName] = useState<string>('Campus University');
  const [threshold, setThreshold] = useState<number>(0.65);
  const [autoMarkAttendance, setAutoMarkAttendance] = useState<boolean>(true);
  const [saved, setSaved] = useState<boolean>(false);

  // Diagnostics State
  const [health, setHealth] = useState<ServiceHealthResponse | null>(null);
  const [loadingHealth, setLoadingHealth] = useState<boolean>(false);

  const loadDiagnostics = async () => {
    setLoadingHealth(true);
    try {
      const [healthRes, threshRes] = await Promise.allSettled([
        fetchHealthStatus(),
        apiClient.get('/recognition/thresholds'),
      ]);
      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value);
      }
      if (threshRes.status === 'fulfilled' && threshRes.value.data.known_threshold) {
        setThreshold(threshRes.value.data.known_threshold);
      }
    } catch (err) {
      console.error('Failed to fetch diagnostics:', err);
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => {
    loadDiagnostics();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.put('/recognition/thresholds', {
        known_threshold: threshold,
        uncertain_threshold: Math.max(0.35, threshold - 0.20),
        margin_threshold: 0.05,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to update thresholds:', err);
      alert('Could not update backend thresholds.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Settings & Diagnostics</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure campus attendance parameters and review backend engine diagnostics.
        </p>
      </div>

      {saved && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>Settings saved successfully.</span>
        </div>
      )}

      {/* General Settings Form */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-5">
        <h2 className="text-base font-semibold text-slate-900 border-b border-slate-100 pb-2">
          Campus Attendance Preferences
        </h2>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-700">Institution Name</label>
          <input
            type="text"
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-700">Face Recognition Match Threshold</label>
            <span className="text-xs font-mono font-bold text-blue-600">{threshold}</span>
          </div>
          <input
            type="range"
            min="0.40"
            max="0.85"
            step="0.01"
            value={threshold}
            onChange={(e) => setThreshold(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <p className="text-[11px] text-slate-400">
            Cosine similarity cutoff for identity verification (standard: 0.65).
          </p>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-700">Automated Attendance Marking</div>
            <div className="text-[11px] text-slate-400">Mark students present upon verified face consensus</div>
          </div>
          <input
            type="checkbox"
            checked={autoMarkAttendance}
            onChange={(e) => setAutoMarkAttendance(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
          />
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Preferences</span>
          </button>
        </div>
      </form>

      {/* System Diagnostics Section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            <span>System Diagnostics</span>
          </h2>
          <button
            onClick={loadDiagnostics}
            disabled={loadingHealth}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            {loadingHealth ? 'Refreshing...' : 'Refresh Status'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Server className="w-4 h-4 text-slate-400" />
              <span>Backend API</span>
            </div>
            <div className="text-base font-bold text-slate-900">
              {health ? health.service_name : 'FastAPI'}
            </div>
            <p className="text-[11px] text-emerald-600 font-mono">Status: {health?.status || 'Online'}</p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Database className="w-4 h-4 text-slate-400" />
              <span>Database Engine</span>
            </div>
            <div className="text-base font-bold text-slate-900">
              {health?.database.db_type.toUpperCase() || 'SQLite'}
            </div>
            <p className="text-[11px] text-slate-500 font-mono">
              Latency: {health?.database.latency_ms.toFixed(2)}ms
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 space-y-1">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Cpu className="w-4 h-4 text-slate-400" />
              <span>AI Biometric Models</span>
            </div>
            <div className="text-base font-bold text-slate-900">SCRFD + ArcFace</div>
            <p className="text-[11px] text-emerald-600 font-mono">ONNX Runtime Active</p>
          </div>
        </div>
      </div>
    </div>
  );
};
