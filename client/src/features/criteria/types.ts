export interface CriteriaSubjectItem {
  year: number;
  semester: number;
  grade: number;
  subject: string;
  domain_name: string;
  credit: number;
  standards_count: number;
  has_source?: number;
}

export interface CriteriaStandardRow {
  id: number;
  domain_name: string;
  code: string;
  content: string;
  level: string;
  description: string;
}
