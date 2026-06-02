export type AcademicTreeKind = 'year' | 'semester' | 'grade' | 'subject' | 'domain';

export interface AcademicTreeNode<TSubject> {
  key: string;
  label: string;
  kind: AcademicTreeKind;
  year?: number;
  semester?: number;
  grade?: number;
  subjectName?: string;
  children?: AcademicTreeNode<TSubject>[];
  subject?: TSubject;
  domainName?: string;
  isCustom?: boolean;
  isDraft?: boolean;
  parentKey?: string | null;
}

interface AcademicTreeItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
}

interface AcademicTreeDomainEntry<TSubject> {
  name: string;
  subject?: TSubject;
  isCustom?: boolean;
}

export interface AcademicTreeKeyPrefixes {
  year: string;
  semester: string;
  grade: string;
  subject: string;
  domain: string;
}

interface BuildAcademicTreeOptions<TSubject extends AcademicTreeItem> {
  keyPrefixes: AcademicTreeKeyPrefixes;
  getDomainEntries: (subjectItems: TSubject[]) => AcademicTreeDomainEntry<TSubject>[];
  getSubjectNodeSubject?: (subjectItems: TSubject[]) => TSubject | undefined;
}

export function nodeKey(parts: Array<string | number | undefined>) {
  return parts.filter(v => v !== undefined && v !== '').join('|');
}

export function nextAcademicTreeChildKind(kind?: AcademicTreeKind): AcademicTreeKind {
  if (!kind) return 'year';
  if (kind === 'year') return 'semester';
  if (kind === 'semester') return 'grade';
  if (kind === 'grade') return 'subject';
  return 'domain';
}

export function getAcademicTreeDisplayValue<TSubject>(node: AcademicTreeNode<TSubject>) {
  if (node.kind === 'year') return String(node.year ?? '');
  if (node.kind === 'semester') return String(node.semester ?? '');
  if (node.kind === 'grade') return String(node.grade ?? '');
  if (node.kind === 'subject') return node.subjectName || node.label;
  return node.domainName || node.label;
}

function parseAcademicTreeNumber(value: string, label: string) {
  const parsed = Number(value);
  if (!parsed) {
    alert(`${label}는 숫자로 입력하세요.`);
    return null;
  }
  return parsed;
}

export function createAcademicTreeScopePatch<TSubject>(
  node: AcademicTreeNode<TSubject>,
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (node.kind === 'year') {
    const year = parseAcademicTreeNumber(trimmed, '학년도');
    return year ? { year } : null;
  }
  if (node.kind === 'semester') {
    const semester = parseAcademicTreeNumber(trimmed, '학기');
    return semester ? { semester } : null;
  }
  if (node.kind === 'grade') {
    const grade = parseAcademicTreeNumber(trimmed, '학년');
    return grade ? { grade } : null;
  }
  if (node.kind === 'subject') return { subject: trimmed };
  return { domainName: trimmed };
}

export function createAcademicTreeAnchorScope<TSubject>(
  node: AcademicTreeNode<TSubject>,
  value: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (node.kind === 'year') {
    const year = parseAcademicTreeNumber(trimmed, '학년도');
    return year ? { year, semester: 0, grade: 0, subject: '' } : null;
  }
  if (node.kind === 'semester') {
    const semester = parseAcademicTreeNumber(trimmed, '학기');
    if (!semester || !node.year) return null;
    return { year: node.year, semester, grade: 0, subject: '' };
  }
  if (node.kind === 'grade') {
    const grade = parseAcademicTreeNumber(trimmed, '학년');
    if (!grade || !node.year || !node.semester) return null;
    return { year: node.year, semester: node.semester, grade, subject: '' };
  }
  if (node.kind === 'subject') {
    if (!node.year || !node.semester || !node.grade) {
      alert('상위 항목을 먼저 입력하세요.');
      return null;
    }
    return { year: node.year, semester: node.semester, grade: node.grade, subject: trimmed };
  }
  return null;
}

export function mergeAcademicDraftNodes<TSubject>(
  nodes: AcademicTreeNode<TSubject>[],
  drafts: AcademicTreeNode<TSubject>[],
  parentKey: string | null = null,
): AcademicTreeNode<TSubject>[] {
  const existingKeys = new Set(nodes.map(node => node.key));
  const directDrafts = drafts
    .filter(node => node.parentKey === parentKey && !existingKeys.has(node.key))
    .map(node => ({ ...node, children: mergeAcademicDraftNodes([], drafts, node.key) }));
  return [
    ...nodes.map(node => ({
      ...node,
      children: mergeAcademicDraftNodes(node.children || [], drafts, node.key),
    })),
    ...directDrafts,
  ];
}

export function removeAcademicDraftSubtree<TSubject>(nodes: AcademicTreeNode<TSubject>[], rootKey: string) {
  const childrenByParent = new Map<string | null | undefined, AcademicTreeNode<TSubject>[]>();
  for (const draft of nodes) {
    const children = childrenByParent.get(draft.parentKey) || [];
    children.push(draft);
    childrenByParent.set(draft.parentKey, children);
  }
  const keysToRemove = new Set<string>();
  const visit = (key: string) => {
    keysToRemove.add(key);
    for (const child of childrenByParent.get(key) || []) visit(child.key);
  };
  visit(rootKey);
  return nodes.filter(item => !keysToRemove.has(item.key));
}

export function findAcademicTreeNodeByKey<TSubject>(
  nodes: AcademicTreeNode<TSubject>[],
  key: string,
): AcademicTreeNode<TSubject> | null {
  for (const node of nodes) {
    if (node.key === key) return node;
    const child = findAcademicTreeNodeByKey(node.children || [], key);
    if (child) return child;
  }
  return null;
}

export function createAcademicDraftNode<TSubject>(
  parent: AcademicTreeNode<TSubject> | undefined,
  keyPrefix = 'draft',
): AcademicTreeNode<TSubject> {
  const kind = nextAcademicTreeChildKind(parent?.kind);
  return {
    key: `${keyPrefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    parentKey: parent?.key ?? null,
    isDraft: true,
    kind,
    label: '',
    year: parent?.year,
    semester: parent?.semester,
    grade: parent?.grade,
    subjectName: parent?.subjectName,
    subject: parent?.subject,
    children: kind === 'domain' ? undefined : [],
  };
}

export function createAcademicParentPathDrafts<TSubject>(
  keyPrefixes: Pick<AcademicTreeKeyPrefixes, 'year' | 'semester' | 'grade'>,
  scope: { year: number; semester: number; grade: number },
): AcademicTreeNode<TSubject>[] {
  const yearNode: AcademicTreeNode<TSubject> = {
    key: nodeKey([keyPrefixes.year, scope.year]),
    label: `${scope.year}학년도`,
    kind: 'year',
    year: scope.year,
    children: [],
    isDraft: true,
    parentKey: null,
  };
  const semesterNode: AcademicTreeNode<TSubject> = {
    key: nodeKey([keyPrefixes.semester, scope.year, scope.semester]),
    label: `${scope.semester}학기`,
    kind: 'semester',
    year: scope.year,
    semester: scope.semester,
    children: [],
    isDraft: true,
    parentKey: yearNode.key,
  };
  const gradeNode: AcademicTreeNode<TSubject> = {
    key: nodeKey([keyPrefixes.grade, scope.year, scope.semester, scope.grade]),
    label: `${scope.grade}학년`,
    kind: 'grade',
    year: scope.year,
    semester: scope.semester,
    grade: scope.grade,
    children: [],
    isDraft: true,
    parentKey: semesterNode.key,
  };
  return [yearNode, semesterNode, gradeNode];
}

export function buildAcademicTree<TSubject extends AcademicTreeItem>(
  items: TSubject[],
  options: BuildAcademicTreeOptions<TSubject>,
): AcademicTreeNode<TSubject>[] {
  const yearMap = new Map<number, Map<number, Map<number, Map<string, TSubject[]>>>>();

  for (const item of items) {
    if (!yearMap.has(item.year)) yearMap.set(item.year, new Map());
    const semMap = yearMap.get(item.year)!;
    if (!semMap.has(item.semester)) semMap.set(item.semester, new Map());
    const gradeMap = semMap.get(item.semester)!;
    if (!gradeMap.has(item.grade)) gradeMap.set(item.grade, new Map());
    const subjectMap = gradeMap.get(item.grade)!;
    if (!subjectMap.has(item.subject)) subjectMap.set(item.subject, []);
    subjectMap.get(item.subject)!.push(item);
  }

  const result: AcademicTreeNode<TSubject>[] = [];
  for (const [year, semMap] of [...yearMap.entries()].sort((a, b) => a[0] - b[0])) {
    const yearNode: AcademicTreeNode<TSubject> = {
      key: nodeKey([options.keyPrefixes.year, year]),
      label: `${year}학년도`,
      kind: 'year',
      year,
      children: [],
    };

    for (const [semester, gradeMap] of [...semMap.entries()].sort((a, b) => a[0] - b[0])) {
      if (semester === 0) continue;
      const semesterNode: AcademicTreeNode<TSubject> = {
        key: nodeKey([options.keyPrefixes.semester, year, semester]),
        label: `${semester}학기`,
        kind: 'semester',
        year,
        semester,
        children: [],
      };

      for (const [grade, subjectMap] of [...gradeMap.entries()].sort((a, b) => a[0] - b[0])) {
        if (grade === 0) continue;
        const gradeNode: AcademicTreeNode<TSubject> = {
          key: nodeKey([options.keyPrefixes.grade, year, semester, grade]),
          label: `${grade}학년`,
          kind: 'grade',
          year,
          semester,
          grade,
          children: [],
        };

        for (const [subject, subjectItems] of [...subjectMap.entries()].sort()) {
          if (!subject) continue;
          const subjectNodeSubject = options.getSubjectNodeSubject?.(subjectItems) ?? subjectItems[0];
          const subjectNode: AcademicTreeNode<TSubject> = {
            key: nodeKey([options.keyPrefixes.subject, year, semester, grade, subject]),
            label: subject,
            kind: 'subject',
            year,
            semester,
            grade,
            subjectName: subject,
            children: [],
            subject: subjectNodeSubject,
          };

          for (const entry of options.getDomainEntries(subjectItems).sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.name) continue;
            subjectNode.children!.push({
              key: nodeKey([options.keyPrefixes.domain, year, semester, grade, subject, entry.name]),
              label: entry.name,
              kind: 'domain',
              year,
              semester,
              grade,
              subjectName: subject,
              subject: entry.subject ?? subjectNodeSubject,
              domainName: entry.name,
              isCustom: entry.isCustom,
            });
          }
          gradeNode.children!.push(subjectNode);
        }
        semesterNode.children!.push(gradeNode);
      }
      yearNode.children!.push(semesterNode);
    }
    result.push(yearNode);
  }
  return result;
}
