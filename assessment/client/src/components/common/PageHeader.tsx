import { ReactNode } from 'react';
import { PageHeaderAction, PageHeaderActions } from './PageHeaderActions';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  leading?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode | PageHeaderAction[];
  hideTitle?: boolean;
}

function renderActions(actions: ReactNode | PageHeaderAction[] | undefined) {
  if (!actions) return null;
  if (Array.isArray(actions)) return <PageHeaderActions actions={actions} />;
  return <div className="flex gap-2">{actions}</div>;
}

export function PageHeader({ eyebrow, leading, title, actions, hideTitle }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-200 bg-white shrink-0">
      <div className="min-w-0 flex-1">
        {leading || (
          <>
            {eyebrow && <div className="text-xs text-gray-500 mb-0.5">{eyebrow}</div>}
            {!hideTitle && title && <h2 className="text-lg font-bold text-gray-900">{title}</h2>}
          </>
        )}
      </div>
      {renderActions(actions)}
    </div>
  );
}
