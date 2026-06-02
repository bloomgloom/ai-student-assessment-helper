import { ReactNode } from 'react';

interface TreeViewProps<T> {
  nodes: T[];
  empty: ReactNode;
  children: (node: T, index: number) => ReactNode;
  addYearButton?: ReactNode;
  className?: string;
}

export function TreeView<T>({ nodes, empty, children, addYearButton, className = 'p-1.5' }: TreeViewProps<T>) {
  return (
    <div className={`flex-1 overflow-y-auto scrollbar-stable group/tree ${className}`}>
      {nodes.length === 0 ? (
        empty
      ) : (
        <>
          {nodes.map(children)}
          {addYearButton && <div className="mt-1">{addYearButton}</div>}
        </>
      )}
    </div>
  );
}
