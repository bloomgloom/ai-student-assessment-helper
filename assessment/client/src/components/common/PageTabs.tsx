import { ReactNode } from 'react';

export interface PageTab<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  color?: 'amber' | 'green' | 'blue' | 'purple';
}

const activeClass = {
  amber: 'border-amber-500 text-amber-700',
  green: 'border-green-500 text-green-700',
  blue: 'border-blue-500 text-blue-700',
  purple: 'border-purple-500 text-purple-700',
};

export interface PageTabsConfig<T extends string = string> {
  value: T;
  tabs: PageTab<T>[];
  onChange: (value: T) => void;
}

export function PageTabs<T extends string>({ value, tabs, onChange }: PageTabsConfig<T>) {
  return (
    <div className="flex border-b border-gray-200 bg-white shrink-0 px-5">
      {tabs.map(tab => {
        const active = value === tab.value;
        const color = tab.color || 'blue';
        return (
          <button
            key={tab.value}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 ${active ? activeClass[color] : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            onClick={() => onChange(tab.value)}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
