import React from 'react';
import { DatabaseHealth } from '../types';
import { Database } from 'lucide-react';

interface HealthBadgeProps {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  database?: DatabaseHealth;
}

export const HealthBadge: React.FC<HealthBadgeProps> = ({ status, database }) => {
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs text-slate-400">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
        </span>
        <span>Checking backend...</span>
      </div>
    );
  }

  const isHealthy = status === 'healthy';
  const isDegraded = status === 'degraded';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium ${
          isHealthy
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : isDegraded
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}
      >
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
              isHealthy ? 'bg-emerald-400' : isDegraded ? 'bg-amber-400' : 'bg-rose-400'
            }`}
          ></span>
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${
              isHealthy ? 'bg-emerald-500' : isDegraded ? 'bg-amber-500' : 'bg-rose-500'
            }`}
          ></span>
        </span>
        <span className="capitalize">{status}</span>
      </div>

      {database && (
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/60 text-xs text-slate-300">
          <Database className="w-3.5 h-3.5 text-sky-400" />
          <span className="text-slate-400">DB:</span>
          <span className="font-mono text-sky-300 font-semibold">{database.db_type}</span>
          <span className="text-slate-500 font-mono">({database.latency_ms}ms)</span>
        </div>
      )}
    </div>
  );
};
