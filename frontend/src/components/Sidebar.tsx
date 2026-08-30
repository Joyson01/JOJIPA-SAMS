import React from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Camera,
  Video,
  CheckSquare,
  BarChart2,
  Tv,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users },
    { id: 'subjects', label: 'Subjects', icon: BookOpen },
    { id: 'enrollment', label: 'Enrollment', icon: Camera },
    { id: 'live', label: 'Live Attendance', icon: Video },
    { id: 'attendance', label: 'Attendance', icon: CheckSquare },
    { id: 'reports', label: 'Reports', icon: BarChart2 },
    { id: 'cameras', label: 'Cameras', icon: Tv },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-200">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
          S
        </div>
        <div>
          <h1 className="font-bold text-base text-slate-900 leading-none">SAMS</h1>
          <p className="text-[11px] text-slate-500 font-medium mt-0.5">Smart Attendance</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700 font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Subtle Footer */}
      <div className="p-4 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          System Online
        </span>
        <span className="text-[11px] text-slate-400">v1.0</span>
      </div>
    </aside>
  );
};
