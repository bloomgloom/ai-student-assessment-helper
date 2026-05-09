import { ReactNode } from 'react';
import { Loader2, Square } from 'lucide-react';

type OverlayTone = 'blue' | 'green' | 'red';

interface AiProgressOverlayProps {
  title: ReactNode;
  message?: ReactNode;
  detail?: ReactNode;
  progress?: number;
  indeterminate?: boolean;
  running?: boolean;
  stopping?: boolean;
  onStop?: () => void;
  stopLabel?: string;
  stoppingLabel?: string;
  tone?: OverlayTone;
  backdrop?: 'strong' | 'soft';
  icon?: ReactNode;
}

const toneClasses: Record<OverlayTone, { icon: string; track: string; bar: string }> = {
  blue: { icon: 'text-blue-600', track: 'bg-gray-100', bar: 'bg-blue-500' },
  green: { icon: 'text-green-600', track: 'bg-green-100', bar: 'bg-green-500' },
  red: { icon: 'text-red-500', track: 'bg-red-100', bar: 'bg-red-400' },
};

export function AiProgressOverlay({
  title,
  message,
  detail,
  progress = 0,
  indeterminate = false,
  running = true,
  stopping = false,
  onStop,
  stopLabel = '중단',
  stoppingLabel = '중단 중...',
  tone = 'blue',
  backdrop = 'strong',
  icon,
}: AiProgressOverlayProps) {
  const colors = toneClasses[tone];
  const percent = Math.max(0, Math.min(100, progress));

  return (
    <div className={`fixed inset-0 z-[100] ${backdrop === 'strong' ? 'bg-black/50' : 'bg-black/30'} flex items-center justify-center`}>
      <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 flex flex-col gap-5">
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            {icon ?? <Loader2 size={18} className={`animate-spin ${colors.icon}`} />}
            <span className="font-semibold text-gray-800">{title}</span>
          </div>
          {message && <p className="text-sm text-gray-500 mt-1">{message}</p>}
          {detail && <p className="text-xs text-gray-400 mt-0.5">{detail}</p>}
        </div>
        <div className={`h-2.5 rounded-full overflow-hidden ${colors.track}`}>
          {indeterminate ? (
            <div className={`h-full rounded-full animate-pulse w-full ${colors.bar}`} />
          ) : (
            <div
              className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
              style={{ width: `${percent}%` }}
            />
          )}
        </div>
        {running && onStop && (
          <button
            className="btn-secondary text-sm flex items-center justify-center gap-1.5"
            onClick={onStop}
            disabled={stopping}
          >
            {stopping ? <Loader2 size={13} className="animate-spin" /> : <Square size={13} />}
            {stopping ? stoppingLabel : stopLabel}
          </button>
        )}
      </div>
    </div>
  );
}
