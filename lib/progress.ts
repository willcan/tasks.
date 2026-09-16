import type { Progress } from '../types';

export const PROGRESS: { value: Progress; label: string }[] = [
  { value: 'not_started', label: 'Not started' },
  { value: 'started', label: 'Started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'paused', label: 'Paused' },
  { value: 'partial', label: 'Partially complete' },
];

export const progressLabel = (p: Progress): string => PROGRESS.find((x) => x.value === p)?.label || '';
