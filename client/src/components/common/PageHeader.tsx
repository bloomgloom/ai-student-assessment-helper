import { ReactNode } from 'react';

interface PageHeaderProps {
  eyebrow?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  hideTitle?: boolean;
}

export function PageHeader({ eyebrow, title, actions, hideTitle }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-white shrink-0">
      <div>
        {eyebrow && <div className="text-xs text-gray-500 mb-0.5">{eyebrow}</div>}
        {!hideTitle && title && <h2 className="text-lg font-bold text-gray-900">{title}</h2>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

