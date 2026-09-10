export type Priority = 'none' | 'low' | 'medium' | 'high';
export type Status = 'open' | 'done';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

/** Mirrors a row in the Tasks sheet. Dates are 'YYYY-MM-DD', times 'HH:MM', timestamps ISO. */
export interface Task {
  id: string;
  title: string;
  notes: string;
  area_id: string;
  project_id: string;
  due_date: string;
  due_time: string;
  priority: Priority;
  status: Status;
  subtasks: Subtask[];
  /** 'daily' | 'weekly' | 'monthly' | 'every:N:days|weeks|months' | '' */
  recurrence: string;
  sort_order: number;
  created_at: string;
  completed_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  name: string;
  area_id: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Area {
  id: string;
  name: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export type View =
  | { kind: 'inbox' }
  | { kind: 'today' }
  | { kind: 'upcoming' }
  | { kind: 'all' }
  | { kind: 'completed' }
  | { kind: 'area'; id: string }
  | { kind: 'project'; id: string };

export type SyncState = 'idle' | 'saving' | 'offline' | 'error';
