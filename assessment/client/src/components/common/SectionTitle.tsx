import { ReactNode } from 'react';

interface SectionTitleProps {
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}

export function SectionTitle({ icon, children, actions }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2">
      <h3 className="font-semibold text-gray-800 flex items-center gap-2">
        {icon}
        {children}
      </h3>
      {actions}
    </div>
  );
}

