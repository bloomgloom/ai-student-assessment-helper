import { BookOpen } from 'lucide-react';

export interface SetechCriteriaPanelItem {
  type: string;
  title: string;
  prompt: string;
  extensions: string;
  sort_order: number;
}

interface SetechCriteriaPanelsProps {
  items: SetechCriteriaPanelItem[];
  onMetaPromptChange: (type: string, value: string) => void;
  onPromptChange: (type: string, value: string) => void;
  onGenerate: (type: string, metaPrompt: string) => void;
}

function getMetaPrompt(item?: SetechCriteriaPanelItem) {
  try {
    return JSON.parse(item?.extensions || '{}').metaPrompt || '';
  } catch {
    return '';
  }
}

export function SetechCriteriaPanels({ items, onMetaPromptChange, onPromptChange, onGenerate }: SetechCriteriaPanelsProps) {
  return (
    <div className="space-y-4">
      {['공통', '종합'].map((type) => {
        const item = items.find(i => i.type === type);
        const metaPrompt = getMetaPrompt(item);
        const label = type === '공통' ? '세특 공통 기준' : '종합 세특 기준';
        const desc = type === '공통'
          ? '모든 영역별 세특 및 종합 세특을 작성할 때 AI에게 공통으로 지시할 프롬프트입니다.'
          : '최종 학기말 세특을 작성할 때 사용할 프롬프트입니다.';

        return (
          <div key={type} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-blue-400" />
              <span className="font-medium text-gray-700 text-sm">{label}</span>
              <span className="text-xs text-gray-400 ml-1">{desc}</span>
            </div>
            <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
              <span className="text-xs text-gray-500 font-medium">지시 사항</span>
              <div />
              <span className="text-xs text-gray-500 font-medium">생성된 기준</span>
              <textarea
                className="textarea w-full text-sm leading-relaxed resize-y"
                style={{ minHeight: '100px' }}
                placeholder={`${label} 위한 지시사항을 입력하세요.`}
                value={metaPrompt}
                onChange={e => onMetaPromptChange(type, e.target.value)}
              />
              <button
                className="btn-rainbow px-3 text-xs flex items-center justify-center gap-1 whitespace-nowrap"
                style={{ alignSelf: 'stretch' }}
                onClick={() => onGenerate(type, metaPrompt)}
                title={`AI로 ${label} 생성`}
              >
                ✨ 생성
              </button>
              <textarea
                className="textarea w-full text-sm leading-relaxed resize-y"
                style={{ minHeight: '100px' }}
                placeholder="생성된 기준이 여기에 표시됩니다. 직접 수정도 가능합니다."
                value={item?.prompt || ''}
                onChange={e => onPromptChange(type, e.target.value)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

