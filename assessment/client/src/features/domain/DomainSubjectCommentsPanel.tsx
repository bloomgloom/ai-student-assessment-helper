import { BookOpen } from 'lucide-react';
import { CommentsItem } from './types';
import { SUBJECT_COMMENTS_TEMPLATES, getSubjectCommentsTemplate } from './constants';

interface SubjectCommentsCardProps {
  template: ReturnType<typeof getSubjectCommentsTemplate>;
  item?: CommentsItem;
  onMetaPromptChange: (type: string, metaPrompt: string) => void;
  onPromptChange: (type: string, prompt: string) => void;
  onGenerate: (type: string, metaPrompt: string) => void;
}

interface DomainSubjectCommentsPanelProps {
  items: CommentsItem[];
  onMetaPromptChange: (type: string, metaPrompt: string) => void;
  onPromptChange: (type: string, prompt: string) => void;
  onGenerate: (type: string, metaPrompt: string) => void;
}

function getMetaPrompt(item?: CommentsItem) {
  try {
    return JSON.parse(item?.extensions || '{}').metaPrompt || '';
  } catch {
    return '';
  }
}

function SubjectCommentsCard({
  template,
  item,
  onMetaPromptChange,
  onPromptChange,
  onGenerate,
}: SubjectCommentsCardProps) {
  const { type, label, description, instructionPlaceholder, promptPlaceholder } = template;
  const metaPrompt = getMetaPrompt(item);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen size={14} className="text-blue-400" />
        <span className="font-medium text-gray-700 text-sm">{label}</span>
        <span className="text-xs text-gray-400 ml-1">{description}</span>
      </div>
      <div className="grid gap-x-2 gap-y-1" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <span className="text-xs text-gray-500 font-medium">지시 사항</span>
        <div />
        <span className="text-xs text-gray-500 font-medium">생성된 기준</span>
        <textarea
          className="textarea w-full text-sm leading-relaxed resize-y"
          style={{ minHeight: '100px' }}
          placeholder={instructionPlaceholder}
          value={metaPrompt}
          onChange={(e) => onMetaPromptChange(type, e.target.value)}
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
          placeholder={promptPlaceholder}
          value={item?.prompt || ''}
          onChange={(e) => onPromptChange(type, e.target.value)}
        />
      </div>
    </div>
  );
}

export function DomainSubjectCommentsPanel({
  items,
  onMetaPromptChange,
  onPromptChange,
  onGenerate,
}: DomainSubjectCommentsPanelProps) {
  return (
    <div className="space-y-4">
      {SUBJECT_COMMENTS_TEMPLATES.map((template) => (
        <SubjectCommentsCard
          key={template.type}
          template={template}
          item={items.find(i => i.type === template.type)}
          onMetaPromptChange={onMetaPromptChange}
          onPromptChange={onPromptChange}
          onGenerate={onGenerate}
        />
      ))}
    </div>
  );
}
