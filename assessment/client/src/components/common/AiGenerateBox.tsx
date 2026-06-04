import { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

interface AiGenerateBoxProps {
  label: string;
  value: string;
  placeholder: string;
  generating?: boolean;
  buttonLabel?: ReactNode;
  onChange: (value: string) => void;
  onGenerate: () => void;
  buttonClassName?: string;
  textareaClassName?: string;
  disabled?: boolean;
}

export function AiGenerateBox({
  label,
  value,
  placeholder,
  generating,
  buttonLabel,
  onChange,
  onGenerate,
  buttonClassName = 'px-3',
  textareaClassName = '',
  disabled,
}: AiGenerateBoxProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center py-1">
        <span className="text-sm font-medium text-gray-600">{label}</span>
      </div>
      <div className="flex gap-3">
        <textarea
          className={`textarea flex-1 text-sm leading-relaxed resize-y ${textareaClassName}`}
          style={{ minHeight: '72px' }}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
        />
        <button
          className={`btn-rainbow text-xs py-2 flex items-center gap-1 whitespace-nowrap shrink-0 self-stretch ${buttonClassName}`}
          onClick={onGenerate}
          disabled={generating || disabled}
        >
          {generating ? <><Loader2 size={12} className="animate-spin" /> 생성 중...</> : (buttonLabel || <>✨ 생성</>)}
        </button>
      </div>
    </div>
  );
}
