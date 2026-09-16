import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Task } from '../types';
import { formatTime, formatTimestamp, shortDate, today } from '../lib/dates';
import { Check, Notes, Repeat } from './Icons';
import { progressLabel } from '../lib/progress';

interface Props {
  task: Task;
  projectName?: string;
  areaName?: string;
  selected: boolean;
  showDate: boolean;
  showCompleted?: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  sortable?: boolean;
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-stone-400',
};

export default function TaskRow({ task, projectName, areaName, selected, showDate, showCompleted, onSelect, onToggle, sortable = true }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !sortable });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const done = task.status === 'done';
  const overdue = !done && task.due_date && task.due_date < today();
  const subDone = task.subtasks.filter((s) => s.done).length;
  const context = projectName || areaName;
  const progressing = !done && task.progress !== 'not_started';

  return (
    <li
      ref={setNodeRef}
      style={style}
      {...(sortable ? { ...attributes, ...listeners } : {})}
      onClick={() => onSelect(task.id)}
      className={`group relative flex items-start gap-3 rounded-lg px-3 py-2.5 select-none cursor-default transition-colors duration-100 ${
        isDragging ? 'z-10 bg-white shadow-lg ring-1 ring-stone-200' : selected ? 'bg-stone-100' : 'hover:bg-stone-50'
      }`}
    >
      <button
        type="button"
        aria-label={done ? 'Restore task' : 'Complete task'}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`checkbox mt-[3px] ${done ? 'checked' : ''}`}
      >
        {progressing && !done ? (
          <span className={`size-2 rounded-full group-hover:hidden ${task.progress === 'paused' ? 'bg-stone-300' : 'bg-stone-700'}`} />
        ) : null}
        <Check width={11} height={11} className={`text-white transition-opacity ${done ? 'opacity-100' : progressing ? 'hidden group-hover:block group-hover:text-stone-300' : 'opacity-0 group-hover:opacity-100 group-hover:text-stone-300'}`} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          {task.priority !== 'none' && <span className={`mt-1 size-1.5 shrink-0 self-center rounded-full ${PRIORITY_DOT[task.priority]}`} />}
          <span className={`truncate text-[15px] leading-6 ${done ? 'text-stone-400 line-through decoration-stone-300' : ''}`}>{task.title}</span>
        </div>
        {(context || (showDate && task.due_date) || task.notes || task.subtasks.length > 0 || task.recurrence || showCompleted || progressing) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[12.5px] leading-4 text-stone-400">
            {showCompleted && task.completed_at && <span>Completed {formatTimestamp(task.completed_at)}</span>}
            {showDate && task.due_date && (
              <span className={overdue ? 'text-red-600' : task.due_date === today() ? 'text-stone-600' : ''}>
                {shortDate(task.due_date)}
                {task.due_time ? ` · ${formatTime(task.due_time)}` : ''}
              </span>
            )}
            {!showDate && task.due_time && <span className="text-stone-500">{formatTime(task.due_time)}</span>}
            {progressing && <span className="text-stone-500">{progressLabel(task.progress)}</span>}
            {context && <span className="truncate">{context}</span>}
            {task.subtasks.length > 0 && (
              <span>
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {task.recurrence && <Repeat width={12} height={12} />}
            {task.notes && <Notes width={12} height={12} />}
          </div>
        )}
      </div>
    </li>
  );
}
