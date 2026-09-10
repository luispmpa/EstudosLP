export type QuestionType = "multiple_choice" | "true_false";
export type CatalogKind =
  | "project"
  | "notebook"
  | "subject"
  | "topic"
  | "subtopic"
  | "tag"
  | "board"
  | "organization"
  | "position";
export interface Catalog {
  id: string;
  kind: CatalogKind;
  name: string;
  parent_id: string | null;
  archived: boolean;
  position: number;
}
export interface Alternative {
  key: string;
  text: string;
  explanation: string;
}
export interface QuestionInput {
  external_id?: string | null;
  source: string;
  type: QuestionType;
  statement: string;
  alternatives: Alternative[];
  correct_answer: string;
  general_explanation: string;
  year?: number | null;
  level?: string | null;
  difficulty?: string | null;
  source_url?: string | null;
  notes?: string;
  catalog_ids?: string[];
  board?: string;
  organization?: string;
  position?: string;
  subject?: string;
  topic?: string;
  subtopic?: string;
  tags?: string[];
  projects?: string[];
  notebooks?: string[];
}
export interface Question extends QuestionInput {
  id: string;
  favorite: boolean;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  next_review_at: string | null;
  review_status: "active" | "suspended" | "removed" | null;
  attempt_count: number;
  error_count: number;
  last_correct: boolean | null;
  schedule_version: number;
}
export type IntervalUnit = "minute" | "hour" | "day";
export interface Interval {
  id: string;
  label: string;
  value: number;
  unit: IntervalUnit;
  position: number;
  active: boolean;
  color?: string;
}
export interface Policy {
  id: string;
  scope: "global" | "project" | "notebook" | "question";
  target_id: string | null;
  name: string;
  intervals: Interval[];
}
export interface StudyContext {
  project_id?: string | null;
  notebook_id?: string | null;
}
export interface Filters extends StudyContext {
  days?: number;
  query?: string;
  catalog_ids?: string[];
  year_min?: number;
  year_max?: number;
  favorite?: boolean;
  mode?: "all" | "due" | "new" | "errors" | "recurring" | "recovered";
  sort?: "newest" | "oldest" | "due";
  page?: number;
  page_size?: number;
}
export interface Attempt {
  id: string;
  question_id: string;
  answered_at: string;
  answer: string;
  correct_answer: string;
  is_correct: boolean;
  elapsed_ms: number;
  statement_snapshot: string;
  context: StudyContext;
  interval_snapshot: Interval | null;
  next_review_at: string | null;
  schedule_version: number;
}
export interface ReviewEvent {
  id: string;
  schedule_version: number;
  question_id: string;
  attempt_id: string | null;
  created_at: string;
  action: string;
  interval_snapshot: Interval | null;
  next_review_at: string | null;
}
export interface Page<T> {
  items: T[];
  total: number;
}
export interface HistoryFilters extends Filters {
  days?: number;
  correct?: boolean;
  question_id?: string;
  ascending?: boolean;
}
export interface Dashboard {
  today: {
    answered: number;
    correct: number;
    incorrect: number;
    elapsed_ms: number;
    reviewed: number;
  };
  due: number;
  overdue: number;
  new_questions: number;
  total_questions: number;
  daily: { date: string; answered: number; correct: number }[];
  weak_subjects: { name: string; answered: number; correct: number }[];
  forecast: { date: string; count: number }[];
}
export type DuplicatePolicy = "skip" | "update" | "cancel";
export interface ImportReport {
  id: string;
  file_name: string;
  created_at: string;
  received: number;
  inserted: number;
  updated: number;
  skipped: number;
  duplicates: number;
  errors: number;
}
export interface ImportItemResult {
  index: number;
  status: "inserted" | "updated" | "skipped" | "error";
  question_id?: string;
  error?: string;
}
export interface ImportResult {
  report: ImportReport;
  items: ImportItemResult[];
}
