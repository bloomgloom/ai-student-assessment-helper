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

export interface AssignmentResource {
  id: number;
  filename: string;
  filepath: string;
  mime_type: string;
  size: number;
  uploaded_at: string;
}

export interface AssignmentClassSnapshot {
  id: number;
  assessment_class_id: number;
  room: string;
  student_count: number;
}

export interface AssignmentConfig {
  id: number;
  year: number;
  semester: number;
  grade: number;
  subject: string;
  domain_name: string;
  title: string;
  guide_md: string;
  allowed_extensions: string;
  max_file_size_mb: number;
  max_files: number;
  is_open: number;
  share_code: string;
  viewer_code: string;
  updated_at: string;
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

export interface CommentsItem {
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

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
