export interface SubjectItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
  class_id: number;
  fixedDomains: { name: string; max_score: number; sort_order: number }[];
  customDomains: { id: number; name: string }[];
  has_source?: number;
}

export interface SubjectDomainRow {
  id?: number | string;
  year?: number;
  semester?: number;
  grade?: number;
  subject?: string;
  credit?: number;
  eval_type: '지필' | '수행' | '기록' | string;
  name: string;
  reflected: 'O' | 'X' | string;
  ratio: number | string;
  max_score: number | string;
  sort_order?: number;
  source_filename?: string;
}

export interface SetechItem {
  id?: number;
  type: string;
  title: string;
  prompt: string;
  extensions: string;
  sort_order: number;
}

export interface EvalItem {
  id?: number;
  name: string;
  score: string;
  item_type: 'llm' | 'formula';
  rubric: string;
  sort_order: number;
}

export interface StandardRef {
  domain_name_ref: string;
  code: string;
  content: string;
}

export interface AiPromptRow {
  prompt_key: string;
  prompt: string;
}
