import React from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import { ServiceHealthResponse } from '../types';

interface DashboardLayoutProps {
  children: React.ReactNode;
  healthData: ServiceHealthResponse | null;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'loading';
  onRefreshHealth: () => void;
  isRefreshing: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  children,
  healthData,
  healthStatus,
  onRefreshHealth,
  isRefreshing,
  activeTab,
  setActiveTab,
}) => {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Clean Minimal Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          healthData={healthData}
          healthStatus={healthStatus}
          onRefreshHealth={onRefreshHealth}
          isRefreshing={isRefreshing}
          activeTab={activeTab}
        />
        <main className="flex-1 overflow-y-auto p-6 md:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
