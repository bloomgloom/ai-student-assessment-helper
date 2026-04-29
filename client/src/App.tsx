import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { Settings, BookOpen, ClipboardList, ListChecks } from 'lucide-react';
import SettingsPage from './pages/SettingsPage';
import CriteriaPage from './pages/CriteriaPage';
import DomainPage from './pages/DomainPage';
import RecordsPage from './pages/RecordsPage';
import { ArtifactStandalonePage } from './components/ArtifactViewer';

function Sidebar() {
  const links = [
    { to: '/criteria', label: '기준 관리', icon: BookOpen },
    { to: '/domains', label: '영역 관리', icon: ListChecks },
    { to: '/records',  label: '기록 관리', icon: ClipboardList },
    { to: '/settings', label: '환경 설정', icon: Settings },
  ];

  return (
    <aside className="w-52 min-h-screen bg-gray-900 text-gray-100 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-base font-bold leading-tight">학생 평가 도우미</h1>
        <p className="text-xs text-gray-400 mt-0.5">AI 세특·채점 보조</p>
      </div>
      <nav className="flex-1 py-3">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-500">v1.0.0</div>
    </aside>
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
              <main className="flex-1 overflow-auto">
                <Routes>
                  <Route path="/" element={<CriteriaPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/criteria" element={<CriteriaPage />} />
                  <Route path="/domains" element={<DomainPage />} />
                  <Route path="/records" element={<RecordsPage />} />
                </Routes>
              </main>
            </>
          } />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
