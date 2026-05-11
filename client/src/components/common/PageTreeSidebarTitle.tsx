import { ReactNode } from 'react';

interface PageTreeSidebarTitleProps {
  title: ReactNode;
  action?: ReactNode;
  collapsed?: boolean;
}

export function PageTreeSidebarTitle({ title, action, collapsed }: PageTreeSidebarTitleProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      {!collapsed && <h2 className="text-sm font-semibold text-gray-700">{title}</h2>}
      {action || <div className="h-8 w-8 shrink-0" />}
    </div>
  );
}
