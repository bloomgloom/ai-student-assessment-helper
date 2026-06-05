import { TreeNodeKind } from '../../components/common/TreeNodeView';

export interface ClassItem {
  id: number;
  year: number;
  semester: number;
  grade: number;
  subject: string;
  room: string;
  scoring_filename: string;
  comments_filename: string;
}

export interface Student {
  id: number;
  student_num: number;
  name: string;
  personal_num?: string;
}

export interface EvalItem {
  name: string;
  score: string;
  item_type: 'llm' | 'formula';
  sort_order: number;
}

export interface ScoringContent {
  [key: string]: string | number | Record<string, string> | undefined;
  total?: string | number;
  __reasons?: Record<string, string>;
  __llmError?: string;
  __llmErrorResult?: string;
}

export interface ContentItem {
  student_id: number;
  content_type: string;
  domain: string;
  content: string;
}

export interface SpellcheckResult {
  taggedText: string;
  correctedText: string;
  correctionCount: number;
}

export interface RecordsTreeNode {
  kind: TreeNodeKind;
  year?: number;
  semester?: number;
  grade?: number;
  subject?: string;
  room?: string;
  domain?: string;
  classItem?: ClassItem;
  label: string;
  children?: RecordsTreeNode[];
  path?: string;
}

export type RecordsUploadMessage = {
  type: 'success' | 'warn' | 'error';
  text: string;
};
