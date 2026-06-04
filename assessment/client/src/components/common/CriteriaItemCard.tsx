import { ReactNode } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';

interface CriteriaItemCardProps {
  checked: boolean;
  title: string;
  instruction: string;
  result: string;
  titlePlaceholder: string;
  instructionPlaceholder: string;
  resultPlaceholder: string;
  resultLabel: string;
  score?: string;
  scoreLabel?: string;
  draggable?: boolean;
  onCheckedChange: (checked: boolean) => void;
  onTitleChange: (value: string) => void;
  onInstructionChange: (value: string) => void;
  onResultChange: (value: string) => void;
  onScoreChange?: (value: string) => void;
  onRemove: () => void;
  extraHeader?: ReactNode;
  instructionDisabled?: boolean;
}

export function CriteriaItemCard({
  checked,
  title,
  instruction,
  result,
  titlePlaceholder,
  instructionPlaceholder,
  resultPlaceholder,
  resultLabel,
  score,
  scoreLabel = '배점:',
  draggable,
  onCheckedChange,
  onTitleChange,
  onInstructionChange,
  onResultChange,
  onScoreChange,
  onRemove,
  extraHeader,
  instructionDisabled,
}: CriteriaItemCardProps) {
  return (
    <div className={`bg-white border rounded-lg p-4 shadow-sm ${checked ? 'border-blue-400 ring-1 ring-blue-200' : 'border-gray-200'}`}>
      <div className="flex gap-3 items-center mb-3">
        <input
          type="checkbox"
          className="w-4 h-4 shrink-0 accent-blue-500"
          checked={checked}
          onChange={e => onCheckedChange(e.target.checked)}
        />
        {draggable && <GripVertical size={16} className="text-gray-300 cursor-grab shrink-0" />}
        <input
          className="input flex-1 text-sm font-medium"
          placeholder={titlePlaceholder}
          value={title}
          onChange={e => onTitleChange(e.target.value)}
        />
        {score !== undefined && onScoreChange && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-sm text-gray-600">{scoreLabel}</span>
            <input
              className="input w-16 text-sm text-center"
              type="number"
              placeholder="2"
              value={score}
              onChange={e => onScoreChange(e.target.value)}
            />
          </div>
        )}
        {extraHeader}
        <button
          className="p-1.5 hover:bg-red-50 text-red-400 rounded transition-colors shrink-0"
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="flex gap-3 items-start">
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium">지시 사항</span>
          <textarea
            className="textarea w-full text-sm leading-relaxed resize-y"
            style={{ minHeight: '90px' }}
            placeholder={instructionPlaceholder}
            value={instruction}
            onChange={e => onInstructionChange(e.target.value)}
            disabled={instructionDisabled}
          />
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <span className="text-xs text-gray-500 font-medium">{resultLabel}</span>
          <textarea
            className="textarea w-full text-sm leading-relaxed resize-y"
            style={{ minHeight: '90px' }}
            placeholder={resultPlaceholder}
            value={result}
            onChange={e => onResultChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
