import { ReactNode } from 'react';
import { PageTreeSidebarTitle } from './PageTreeSidebarTitle';
import { PageTreeSidebarNotices, PageTreeSidebarNoticeConfig } from './PageTreeSidebarNotices';
import { PageTreeSidebarTree, PageTreeSidebarTreeContent } from './PageTreeSidebarTree';
import { PageTreeSidebarUpload, PageTreeSidebarUploadConfig } from './PageTreeSidebarUpload';
import { TreeNodeLike } from './TreeNodeView';

export interface PageTreeSidebarConfig<T extends TreeNodeLike<T>> {
  title: ReactNode;
  titleAction?: ReactNode;
  upload?: ReactNode | PageTreeSidebarUploadConfig;
  notices?: PageTreeSidebarNoticeConfig[];
  tree: PageTreeSidebarTreeContent<T>;
  collapsed?: boolean;
}

interface PageTreeSidebarProps<T extends TreeNodeLike<T>> {
  config: PageTreeSidebarConfig<T>;
}

export function PageTreeSidebar<T extends TreeNodeLike<T>>({ config }: PageTreeSidebarProps<T>) {
  return (
    <aside className={`${config.collapsed ? 'w-14' : 'w-72'} border-r border-gray-200 bg-white flex flex-col shrink-0 transition-[width] duration-200`}>
      <div className="p-3 border-b border-gray-200 shrink-0 space-y-2">
        <PageTreeSidebarTitle title={config.title} action={config.titleAction} collapsed={config.collapsed} />
        <PageTreeSidebarUpload upload={config.upload} />
        <PageTreeSidebarNotices notices={config.notices} />
      </div>
      <PageTreeSidebarTree tree={config.tree} />
    </aside>
  );
}
