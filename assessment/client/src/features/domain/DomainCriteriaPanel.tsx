import { KeyboardEvent, PointerEvent, ReactNode, useRef, useState } from 'react';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { CriteriaItemSection } from '../../components/common/CriteriaItemSection';
import { AiChatMessage } from './types';

interface DomainCriteriaPromptConfig {
  label: string;
  placeholder: string;
  generateLabel?: string;
  messages: AiChatMessage[];
  draft: string;
  generating?: boolean;
  chatting?: boolean;
  disabled?: boolean;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onGenerate: () => void;
  onClearChat: () => void;
}

interface DomainCriteriaItemsConfig {
  title: string;
  addLabel: string;
  empty?: ReactNode;
  children: ReactNode;
  generating?: boolean;
  generateDisabled?: boolean;
  onGenerate?: () => void;
  onAdd: () => void;
}

interface DomainCriteriaPanelProps {
  top?: ReactNode;
  prompt: ReactNode | DomainCriteriaPromptConfig;
  items: DomainCriteriaItemsConfig;
}

interface DomainCriteriaSplitProps {
  left: ReactNode;
  right: ReactNode;
}

const SPLITTER_WIDTH = 16;
const MIN_PANE_WIDTH = 240;
const DEFAULT_LEFT_RATIO = 40;

export function DomainCriteriaSplit({ left, right }: DomainCriteriaSplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [leftRatio, setLeftRatio] = useState(DEFAULT_LEFT_RATIO);
  const [dragging, setDragging] = useState(false);

  const clampRatio = (ratio: number) => {
    const contentWidth = (containerRef.current?.clientWidth || 0) - SPLITTER_WIDTH;
    if (contentWidth <= 0) return Math.min(80, Math.max(20, ratio));
    const minimumRatio = Math.min(50, (MIN_PANE_WIDTH / contentWidth) * 100);
    return Math.min(100 - minimumRatio, Math.max(minimumRatio, ratio));
  };

  const resizeFromPointer = (clientX: number) => {
    const bounds = containerRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const contentWidth = bounds.width - SPLITTER_WIDTH;
    if (contentWidth <= 0) return;
    const leftWidth = clientX - bounds.left - SPLITTER_WIDTH / 2;
    setLeftRatio(clampRatio((leftWidth / contentWidth) * 100));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    resizeFromPointer(event.clientX);
  };

  const stopDragging = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home') return;
    event.preventDefault();
    if (event.key === 'Home') setLeftRatio(DEFAULT_LEFT_RATIO);
    else setLeftRatio(current => clampRatio(current + (event.key === 'ArrowLeft' ? -2 : 2)));
  };

  return (
    <div
      ref={containerRef}
      className={`flex h-full min-h-0 min-w-0 ${dragging ? 'select-none' : ''}`}
    >
      <div
        className="min-h-0 min-w-0"
        style={{ flexBasis: 0, flexGrow: leftRatio }}
      >
        {left}
      </div>
      <div
        className="group relative flex w-4 shrink-0 cursor-col-resize touch-none items-center justify-center focus:outline-none"
        role="separator"
        aria-label="채팅 창과 프롬프트 창 너비 조절"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(leftRatio)}
        tabIndex={0}
        title="드래그하여 너비 조절 · 더블클릭하여 40:60 복원"
        onPointerDown={handlePointerDown}
        onPointerMove={event => {
          if (dragging) resizeFromPointer(event.clientX);
        }}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onLostPointerCapture={() => setDragging(false)}
        onDoubleClick={() => setLeftRatio(DEFAULT_LEFT_RATIO)}
        onKeyDown={handleKeyDown}
      >
        <div
          className={`h-12 w-1 rounded-full transition-colors ${
            dragging ? 'bg-blue-500' : 'bg-gray-300 group-hover:bg-blue-400 group-focus:bg-blue-500'
          }`}
        />
      </div>
      <div
        className="min-h-0 min-w-0"
        style={{ flexBasis: 0, flexGrow: 100 - leftRatio }}
      >
        {right}
      </div>
    </div>
  );
}

function isPromptConfig(prompt: ReactNode | DomainCriteriaPromptConfig): prompt is DomainCriteriaPromptConfig {
  return !!prompt && typeof prompt === 'object' && 'label' in prompt && 'onGenerate' in prompt;
}

export function DomainCriteriaPromptView({ prompt }: { prompt: ReactNode | DomainCriteriaPromptConfig }) {
  if (!isPromptConfig(prompt)) return <>{prompt}</>;

  return (
    <div className="flex h-full min-h-[420px] flex-col rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-800">{prompt.label}</h3>
        <button
          className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={prompt.onClearChat}
          disabled={prompt.disabled || prompt.chatting || prompt.generating || (prompt.messages.length === 0 && !prompt.draft.trim())}
          title="채팅 삭제"
          aria-label="채팅 삭제"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
        {prompt.messages.length === 0 ? (
          <p className="rounded border border-dashed border-gray-200 bg-gray-50 px-3 py-8 text-center text-xs leading-relaxed text-gray-400">
            필요한 조건을 채팅으로 정리한 뒤 생성 버튼을 누르세요.
          </p>
        ) : (
          prompt.messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 bg-gray-50 text-gray-700'
                }`}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="border-t border-gray-100 p-3">
        <div className="flex gap-2">
          <textarea
            className="textarea min-h-[72px] flex-1 resize-y text-sm leading-relaxed"
            placeholder={prompt.placeholder}
            value={prompt.draft}
            onChange={e => prompt.onDraftChange(e.target.value)}
            disabled={prompt.disabled || prompt.chatting || prompt.generating}
          />
          <button
            className="btn-secondary self-stretch px-3"
            onClick={prompt.onSend}
            disabled={prompt.disabled || prompt.chatting || prompt.generating || !prompt.draft.trim()}
            title="입력"
            aria-label="입력"
          >
            {prompt.chatting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          </button>
        </div>
        <button
          className="btn-rainbow mt-2 flex w-full items-center justify-center gap-1.5 py-2 text-xs"
          onClick={prompt.onGenerate}
          disabled={prompt.disabled || prompt.chatting || prompt.generating}
        >
          {prompt.generating ? <><Loader2 size={12} className="animate-spin" /> 생성 중...</> : <>{prompt.generateLabel || '항목 생성'}</>}
        </button>
      </div>
    </div>
  );
}

export function DomainCriteriaItemsView({ items }: { items: DomainCriteriaItemsConfig }) {
  return (
    <CriteriaItemSection
      title={items.title}
      addLabel={items.addLabel}
      generating={items.generating}
      generateDisabled={items.generateDisabled}
      onGenerate={items.onGenerate}
      onAdd={items.onAdd}
      empty={items.empty}
    >
      {items.children}
    </CriteriaItemSection>
  );
}

export function DomainCriteriaPanel({ top, prompt, items }: DomainCriteriaPanelProps) {
  return (
    <DomainCriteriaSplit
      left={<DomainCriteriaPromptView prompt={prompt} />}
      right={(
        <div className="h-full min-h-0 min-w-0 space-y-4 overflow-auto pb-4 pr-1 scrollbar-stable">
          {top}
          <DomainCriteriaItemsView items={items} />
        </div>
      )}
    />
  );
}
