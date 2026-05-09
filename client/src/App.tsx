import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import {
  Settings, BookOpen, ClipboardList, ListChecks, Loader2, Square,
  AlertCircle, CheckCircle2, Menu
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import SettingsPage from './pages/SettingsPage';
import CriteriaPage from './pages/CriteriaPage';
import DomainPage from './pages/DomainPage';
import RecordsPage from './pages/RecordsPage';
import { useAiBatchStore } from './stores/aiBatchStore';
import { useAiOverlayStore } from './stores/aiOverlayStore';

const ArtifactStandalonePage = lazy(() =>
  import('./components/ArtifactViewer').then((module) => ({ default: module.ArtifactStandalonePage }))
);

function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
  const links = [
    { to: '/criteria', label: '성취 기준 관리', icon: BookOpen },
    { to: '/domains', label: '평가 영역 관리', icon: ListChecks },
    { to: '/records', label: '채점 기록 관리', icon: ClipboardList },
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
              `flex items-center ${collapsed ? 'justify-center px-2' : 'gap-2.5 px-4'} py-2.5 text-sm transition-colors ${isActive
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

function AiOverlay() {
  const overlay = useAiOverlayStore();
  const batchJob = useAiBatchStore(state => state.currentJob);
  const stopBatch = useAiBatchStore(state => state.stopBatch);

  const batchRunning = batchJob?.status === 'running' || batchJob?.status === 'stopping';
  const batchFinished = batchJob && !batchRunning;

  const showOverlay = overlay.active || batchRunning || !!batchFinished;
  if (!showOverlay) return null;

  // Single-call overlay (DomainPage AI handlers)
  if (overlay.active) {
    const isIndeterminate = overlay.progress < 0;
    return (
      <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 flex flex-col gap-5">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Loader2 size={18} className="animate-spin text-blue-600" />
              <span className="font-semibold text-gray-800">{overlay.title}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{overlay.message}</p>
          </div>
          <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
            {isIndeterminate ? (
              <div className="h-full bg-blue-400 rounded-full animate-pulse w-full" />
            ) : (
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${overlay.progress}%` }}
              />
            )}
          </div>
          <button
            className="btn-secondary text-sm flex items-center justify-center gap-1.5"
            onClick={overlay.stop}
            disabled={overlay.stopping}
          >
            {overlay.stopping ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
            {overlay.stopping ? '중단 중...' : '중단'}
          </button>
        </div>
      </div>
    );
  }

  // Batch job overlay (RecordsPage)
  const job = batchJob!;
  const running = batchRunning;
  const failed = job.status === 'error';
  const completed = job.status === 'completed';
  const percent = (job.completed / Math.max(job.total, 1)) * 100;

  return (
    <div className={`fixed inset-0 z-[100] ${running ? 'bg-black/50' : 'bg-black/30'} flex items-center justify-center`}>
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 flex flex-col gap-5">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            {running ? (
              <Loader2 size={18} className="animate-spin text-blue-600" />
            ) : failed ? (
              <AlertCircle size={18} className="text-red-500" />
            ) : (
              <CheckCircle2 size={18} className="text-green-500" />
            )}
            <span className={`font-semibold ${failed ? 'text-red-700' : completed ? 'text-green-700' : 'text-gray-800'}`}>
              {job.classLabel}
            </span>
          </div>
          <p className={`text-sm mt-1 ${failed ? 'text-red-500' : completed ? 'text-green-600' : 'text-gray-500'}`}>
            {job.message}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{job.completed}/{job.total}</p>
        </div>
        <div className={`h-2.5 rounded-full overflow-hidden ${failed ? 'bg-red-100' : completed ? 'bg-green-100' : 'bg-gray-100'}`}>
          <div
            className={`h-full rounded-full transition-all duration-300 ${failed ? 'bg-red-400' : completed ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {running && (
          <button
            className="btn-secondary text-sm flex items-center justify-center gap-1.5"
            onClick={stopBatch}
            disabled={job.status === 'stopping'}
          >
            {job.status === 'stopping' ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
            {job.status === 'stopping' ? '중단 중...' : '중단'}
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
          <Route path="/artifacts/:id/view" element={
            <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader2 className="animate-spin text-gray-400" /></div>}>
              <ArtifactStandalonePage />
            </Suspense>
          } />
          <Route path="*" element={
            <>
              <Sidebar />
              <main className="flex-1 min-w-0 flex flex-col">
                <AiOverlay />
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
