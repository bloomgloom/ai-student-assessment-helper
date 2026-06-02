import { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

interface PageTreeSidebarGuideSection {
  title?: ReactNode;
  lines: ReactNode[];
}

export interface PageTreeSidebarGuideNotice {
  type: 'guide';
  visible?: boolean;
  title?: ReactNode;
  lines?: ReactNode[];
  sections?: PageTreeSidebarGuideSection[];
  onDismiss?: () => void;
}

export interface PageTreeSidebarMessageNotice {
  type: 'message';
  visible?: boolean;
  tone: 'success' | 'warn' | 'error';
  text: ReactNode;
}

export type PageTreeSidebarNoticeConfig = PageTreeSidebarGuideNotice | PageTreeSidebarMessageNotice;

interface PageTreeSidebarNoticesProps {
  notices?: PageTreeSidebarNoticeConfig[];
}

const messageToneClass = {
  success: 'bg-green-50 border-green-200 text-green-700',
  warn: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  error: 'bg-red-50 border-red-200 text-red-700',
};

function GuideNotice({ notice }: { notice: PageTreeSidebarGuideNotice }) {
  const sections = notice.sections || (notice.lines ? [{ title: notice.title, lines: notice.lines }] : []);

  return (
    <div className="relative rounded border border-blue-200 bg-blue-50 p-2 pr-7 text-xs leading-relaxed text-blue-900">
      {notice.onDismiss && (
        <button className="absolute right-1.5 top-1.5 text-blue-500 hover:text-blue-700" onClick={notice.onDismiss} title="다시 보지 않기">
          <X size={12} />
        </button>
      )}
      {sections.map((section, index) => (
        <div key={index} className={index > 0 ? 'mt-2' : undefined}>
          {section.title && <div className={`font-medium ${section.lines.length > 0 ? 'mb-1' : ''}`}>{section.title}</div>}
          {section.lines.map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
        </div>
      ))}
    </div>
  );
}

function MessageNotice({ notice }: { notice: PageTreeSidebarMessageNotice }) {
  if (notice.tone === 'success') {
    return (
      <p className={`text-xs rounded p-2 leading-snug border ${messageToneClass.success}`}>
        {notice.text}
      </p>
    );
  }

  return (
    <div className={`flex items-start gap-1.5 text-xs rounded p-2 border ${messageToneClass[notice.tone]}`}>
      {notice.tone === 'error' ? <AlertCircle size={12} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={12} className="mt-0.5 shrink-0" />}
      <p className="whitespace-pre-wrap leading-snug">{notice.text}</p>
    </div>
  );
}

export function PageTreeSidebarNotices({ notices }: PageTreeSidebarNoticesProps) {
  if (!notices?.length) return null;

  return (
    <>
      {notices.filter(notice => notice.visible !== false).map((notice, index) => (
        notice.type === 'guide'
          ? <GuideNotice key={index} notice={notice} />
          : <MessageNotice key={index} notice={notice} />
      ))}
    </>
  );
}
