import { ReactNode, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Folder,
  LucideIcon,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

export type TreeNodeKind = 'year' | 'semester' | 'grade' | 'subject' | 'domain' | 'room' | 'class';

export interface TreeNodeLike<TNode> {
  key?: string;
  path?: string;
  label: string;
  kind?: TreeNodeKind;
  children?: TNode[];
  isCustom?: boolean;
  domainName?: string;
  room?: string;
}

export type TreeEditingItem = { key: string; value: string };

interface TreeNodeViewProps<TNode extends TreeNodeLike<TNode>> {
  node: TNode;
  depth?: number;
  selected?: (node: TNode) => boolean;
  clickable?: (node: TNode) => boolean;
  onSelect?: (node: TNode) => void;
  canAdd?: (node: TNode) => boolean;
  onAdd?: (node: TNode) => void;
  canDelete?: (node: TNode) => boolean;
  onDelete?: (node: TNode) => void;
  actions?: (node: TNode) => ReactNode;
  editing?: TreeEditingItem | null;
  onEditChange?: (value: string) => void;
  onEditCommit?: () => void;
  onEditCancel?: () => void;
  getKind?: (node: TNode) => TreeNodeKind;
  getKey?: (node: TNode) => string;
  getOpenKey?: (node: TNode) => string | null;
  openStates?: Record<string, boolean>;
  onToggleOpen?: (key: string) => void;
  icon?: (node: TNode) => ReactNode;
  rowClassName?: (node: TNode, selected: boolean) => string;
}

function defaultKind<TNode extends TreeNodeLike<TNode>>(node: TNode): TreeNodeKind {
  if (node.kind) return node.kind;
  if (node.room) return 'room';
  if (node.domainName) return 'domain';
  return 'subject';
}

function iconClass(kind: TreeNodeKind, node: TreeNodeLike<unknown>) {
  if (kind === 'domain') return node.isCustom ? 'text-purple-500' : 'text-green-500';
  if (kind === 'room' || kind === 'class') return 'text-green-500';
  return 'text-blue-400';
}

function IconForKind({ kind, node, size = 13 }: { kind: TreeNodeKind; node: TreeNodeLike<unknown>; size?: number }) {
  const Icon: LucideIcon =
    kind === 'domain'
      ? node.isCustom ? BookOpen : ClipboardCheck
      : kind === 'room'
        ? FileSpreadsheet
        : kind === 'class'
          ? Users
          : Folder;
  return <Icon size={size} className={`shrink-0 ${iconClass(kind, node)}`} />;
}

export function TreeIconButton({
  title,
  onClick,
  children,
  variant = 'neutral',
  visible = 'hover',
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  variant?: 'neutral' | 'blue' | 'red' | 'green' | 'purple';
  visible?: 'always' | 'hover' | 'hidden';
}) {
  const color =
    variant === 'red' ? 'text-red-400 hover:bg-red-100 hover:text-red-600' :
      variant === 'blue' ? 'text-blue-500 hover:bg-blue-100' :
        variant === 'green' ? 'text-green-600 hover:bg-green-100' :
          variant === 'purple' ? 'text-violet-600 hover:bg-violet-100' :
            'text-gray-500 hover:bg-gray-100';
  const visibility =
    visible === 'hidden' ? 'invisible' :
      visible === 'always' ? '' :
        'opacity-0 group-hover:opacity-100';
  return (
    <button
      className={`${visibility} p-0.5 rounded transition-all ${color}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

export function TreeNodeView<TNode extends TreeNodeLike<TNode>>({
  node,
  depth = 0,
  selected,
  clickable,
  onSelect,
  canAdd,
  onAdd,
  canDelete,
  onDelete,
  actions,
  editing,
  onEditChange,
  onEditCommit,
  onEditCancel,
  getKind = defaultKind,
  getKey = (n) => n.key || n.path || n.label,
  getOpenKey = (n) => n.path || n.key || null,
  openStates,
  onToggleOpen,
  icon,
  rowClassName,
}: TreeNodeViewProps<TNode>) {
  const kind = getKind(node);
  const children = node.children || [];
  const hasChildren = children.length > 0;
  const openKey = getOpenKey(node);
  const [localOpen, setLocalOpen] = useState(true);
  const open = openKey && openStates ? (openStates[openKey] ?? true) : localOpen;
  const isEditing = !!editing && editing.key === getKey(node);
  const isSelected = selected?.(node) ?? false;
  const isClickable = clickable?.(node) ?? false;
  const paddingLeft = `${8 + depth * 14}px`;
  const rowClass = rowClassName?.(node, isSelected) ??
    `group flex items-center gap-1 py-1.5 pr-5 rounded text-sm transition-colors ${isSelected
      ? 'bg-blue-100 text-blue-700 font-medium'
      : isClickable
        ? 'cursor-pointer hover:bg-gray-100 text-gray-700'
        : 'hover:bg-gray-50 text-gray-600 font-medium'
    }`;

  const toggleOpen = () => {
    if (!hasChildren) return;
    if (openKey && onToggleOpen) onToggleOpen(openKey);
    else setLocalOpen((current) => !current);
  };

  const label = isEditing ? (
    <input
      className="input h-6 flex-1 px-1.5 py-0 text-xs"
      value={editing.value}
      autoFocus
      onChange={(event) => onEditChange?.(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onEditCommit?.();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          onEditCancel?.();
        }
      }}
      onBlur={onEditCommit}
    />
  ) : (
    <span className="flex-1 truncate">{node.label}</span>
  );

  return (
    <div>
      <div
        className={rowClass}
        style={{ paddingLeft }}
        onClick={() => {
          if (!isEditing && isClickable) onSelect?.(node);
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleOpen();
            }}
            className="p-0.5 hover:bg-gray-200 rounded text-gray-500"
            title={open ? '접기' : '펼치기'}
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-[17px] shrink-0" />
        )}
        {icon ? icon(node) : <IconForKind kind={kind} node={node} size={kind === 'room' || kind === 'class' ? 14 : 13} />}
        {label}
        <div className="flex items-center gap-0.5 shrink-0">
          {actions?.(node)}
          {canAdd?.(node) && onAdd && (
            <TreeIconButton title="하위 항목 추가" onClick={() => onAdd(node)} variant="blue">
              <Plus size={13} />
            </TreeIconButton>
          )}
          {canDelete?.(node) && onDelete && (
            <TreeIconButton title="삭제" onClick={() => onDelete(node)} variant="red">
              <Trash2 size={13} />
            </TreeIconButton>
          )}
        </div>
      </div>
      {open && children.map((child, index) => (
        <TreeNodeView
          key={getKey(child) || index}
          node={child}
          depth={depth + 1}
          selected={selected}
          clickable={clickable}
          onSelect={onSelect}
          canAdd={canAdd}
          onAdd={onAdd}
          canDelete={canDelete}
          onDelete={onDelete}
          actions={actions}
          editing={editing}
          onEditChange={onEditChange}
          onEditCommit={onEditCommit}
          onEditCancel={onEditCancel}
          getKind={getKind}
          getKey={getKey}
          getOpenKey={getOpenKey}
          openStates={openStates}
          onToggleOpen={onToggleOpen}
          icon={icon}
          rowClassName={rowClassName}
        />
      ))}
    </div>
  );
}

export { Download, Plus, Trash2 };
