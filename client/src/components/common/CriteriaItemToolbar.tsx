import { Loader2, Plus } from 'lucide-react';

interface CriteriaItemToolbarProps {
  title: string;
  generateLabel?: string;
  addLabel: string;
  generating?: boolean;
  generateDisabled?: boolean;
  showGenerate?: boolean;
  onGenerate: () => void;
  onAdd: () => void;
}

export function CriteriaItemToolbar({
  title,
  generateLabel = '생성',
  addLabel,
  generating,
  generateDisabled,
  showGenerate = true,
  onGenerate,
  onAdd,
}: CriteriaItemToolbarProps) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm font-medium text-gray-600">{title}</span>
      <div className="flex min-w-[152px] justify-end gap-2">
        <button
          className={`btn-rainbow text-xs px-2 py-1 flex items-center gap-1 ${showGenerate ? '' : 'invisible pointer-events-none'}`}
          onClick={onGenerate}
          disabled={!showGenerate || generating || generateDisabled}
          aria-hidden={!showGenerate}
          tabIndex={showGenerate ? 0 : -1}
        >
          {generating ? <><Loader2 size={12} className="animate-spin" /> 생성 중...</> : <>✨ {generateLabel}</>}
        </button>
        <button className="btn-secondary text-xs px-2 py-1" onClick={onAdd}>
          <Plus size={12} /> {addLabel}
        </button>
      </div>
    </div>
  );
}
