import { ReactNode } from 'react';
import { Users } from 'lucide-react';
import { AiProgressOverlay } from '../../components/common/AiProgressOverlay';

interface RecordsContentProps {
  selected: boolean;
  children: ReactNode;
  spellcheckProgress: { completed: number; total: number } | null;
  spellcheckStopping: boolean;
  onStopSpellcheck: () => void;
}

export function RecordsContent({
  selected,
  children,
  spellcheckProgress,
  spellcheckStopping,
  onStopSpellcheck,
}: RecordsContentProps) {
  if (!selected) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Users size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">왼쪽에서 영역을 선택하세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {spellcheckProgress && (
        <AiProgressOverlay
          title="맞춤법 검사 중"
          detail={`${spellcheckProgress.completed}/${spellcheckProgress.total}`}
          progress={(spellcheckProgress.completed / Math.max(spellcheckProgress.total, 1)) * 100}
          stopping={spellcheckStopping}
          onStop={onStopSpellcheck}
          tone="green"
        />
      )}
      {children}
    </div>
  );
}
