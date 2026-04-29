import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import {
  Settings, BookOpen, ClipboardList, ListChecks, Loader2, Square,
  AlertCircle, CheckCircle2, Menu
} from 'lucide-react';
import { useState } from 'react';
import SettingsPage from './pages/SettingsPage';
import CriteriaPage from './pages/CriteriaPage';
import DomainPage from './pages/DomainPage';
import RecordsPage from './pages/RecordsPage';
import { ArtifactStandalonePage } from './components/ArtifactViewer';
import { useAiBatchStore } from './stores/aiBatchStore';

function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
  const links = [
    { to: '/criteria', label: '기준 관리', icon: BookOpen },
    { to: '/domains', label: '영역 관리', icon: ListChecks },
    { to: '/records',  label: '기록 관리', icon: ClipboardList },
    { to: '/settings', label: '환경 설정', icon: Settings },
  ];

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('sidebarCollapsed', next ? '1' : '0');
  };

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-52'} min-h-screen bg-gray-900 text-gray-100 flex flex-col transition-[width] duration-200 shrink-0`}>
      <div className={`border-b border-gray-700 ${collapsed ? 'px-2 py-3' : 'px-3 py-4'}`}>
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded text-gray-300 hover:bg-gray-800 hover:text-white"
            onClick={toggleCollapsed}
            title={collapsed ? '메뉴 펼치기' : '메뉴 접기'}
          >
            <Menu size={18} />
          </button>
          {!collapsed && (
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight">학생 평가 도우미</h1>
              <p className="text-xs text-gray-400 mt-0.5">AI 세특·채점 보조</p>
            </div>
          )}
        </div>
      </div>
      <nav className="flex-1 py-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'} py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon size={16} />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>
      <div className={`border-t border-gray-700 py-3 text-xs text-gray-500 ${collapsed ? 'text-center' : 'px-4'}`}>
        {collapsed ? 'v1' : 'v1.0.0'}
      </div>
    </aside>
  );
}

function AiBatchBanner() {
  const job = useAiBatchStore(state => state.currentJob);
  const stopBatch = useAiBatchStore(state => state.stopBatch);
  const clearFinished = useAiBatchStore(state => state.clearFinished);

  if (!job) return null;

  const running = job.status === 'running' || job.status === 'stopping';
  const failed = job.status === 'error';
  const completed = job.status === 'completed';
  const percent = (job.completed / Math.max(job.total, 1)) * 100;

  return (
    <div className={`shrink-0 border-b px-4 py-2 ${
      failed
        ? 'border-red-200 bg-red-50'
        : completed
          ? 'border-green-200 bg-green-50'
          : 'border-blue-200 bg-blue-50'
    }`}>
      <div className="flex items-center gap-3 text-sm">
        {running ? (
          <Loader2 size={15} className="animate-spin text-blue-600 shrink-0" />
        ) : failed ? (
          <AlertCircle size={15} className="text-red-600 shrink-0" />
        ) : (
          <CheckCircle2 size={15} className="text-green-600 shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className={`truncate ${failed ? 'text-red-700' : completed ? 'text-green-700' : 'text-blue-700'}`}>
              {job.classLabel} · {job.message}
            </span>
            <span className="shrink-0 text-gray-500">{job.completed}/{job.total}</span>
          </div>
          <div className={`mt-1 h-1.5 overflow-hidden rounded-full ${failed ? 'bg-red-200' : completed ? 'bg-green-200' : 'bg-blue-200'}`}>
            <div
              className={`h-full rounded-full transition-all ${failed ? 'bg-red-500' : completed ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {running ? (
          <button className="btn-secondary text-xs py-1.5 shrink-0" onClick={stopBatch} disabled={job.status === 'stopping'}>
            <Square size={12} /> 중단
          </button>
        ) : (
          <button className="btn-secondary text-xs py-1.5 shrink-0" onClick={clearFinished}>
            닫기
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Routes>
          <Route path="/artifacts/:id/view" element={<ArtifactStandalonePage />} />
          <Route path="*" element={
            <>
              <Sidebar />
              <main className="flex-1 min-w-0 flex flex-col">
                <AiBatchBanner />
                <div className="flex-1 overflow-auto">
                  <Routes>
                    <Route path="/" element={<CriteriaPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/criteria" element={<CriteriaPage />} />
                    <Route path="/domains" element={<DomainPage />} />
                    <Route path="/records" element={<RecordsPage />} />
                  </Routes>
                </div>
              </main>
            </>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
