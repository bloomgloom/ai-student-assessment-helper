import { ReactNode } from 'react';

interface PageSidebarProps {
  title: string;
  upload?: ReactNode;
  notices?: ReactNode;
  tree: ReactNode;
}

export function PageSidebar({ title, upload, notices, tree }: PageSidebarProps) {
  return (
    <aside className="w-72 border-r border-gray-200 bg-white flex flex-col shrink-0">
      <div className="p-3 border-b border-gray-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
          <div className="h-8 w-8 shrink-0" />
        </div>
        {upload}
        {notices}
      </div>
      {tree}
    </aside>
  );
}

