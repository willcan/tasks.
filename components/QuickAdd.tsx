import { useEffect, useRef, useState } from 'react';
import type { Area, Priority, Project, Task } from '../types';
import { X } from './Icons';

interface Props {
  areas: Area[];
  projects: Project[];
  defaults?: Partial<Task>;
  autoFocus?: boolean;
  onSubmit: (task: Partial<Task> & { title: string }) => void;
  onClose: () => void;
}

const PRIORITIES: { value: Priority; label: string; dot: string }[] = [
  { value: 'none', label: 'None', dot: 'bg-stone-300' },
  { value: 'low', label: 'Low', dot: 'bg-stone-400' },
  { value: 'medium', label: 'Med', dot: 'bg-amber-500' },
  { value: 'high', label: 'High', dot: 'bg-red-500' },
];

/** Inline task creator: title on top, one row of options underneath. Enter adds and stays open for the next one. */
export default function QuickAdd({ areas, projects, defaults = {}, autoFocus, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState(defaults.due_date || '');
  const [dueTime, setDueTime] = useState(defaults.due_time || '');
  const [priority, setPriority] = useState<Priority>(defaults.priority || 'none');
  const [areaId, setAreaId] = useState(defaults.area_id || '');
  const [projectId, setProjectId] = useState(defaults.project_id || '');
  const [recurrence, setRecurrence] = useState(defaults.recurrence || '');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const visibleProjects = projects.filter((p) => !p.archived && (!areaId || p.area_id === areaId));

  const submit = () => {
    const t = title.trim();
    if (!t) return;
    onSubmit({ title: t, due_date: dueDate, due_time: dueDate ? dueTime : '', priority, area_id: areaId, project_id: projectId, recurrence });
    setTitle('');
    ref.current?.focus();
  };

  return (
    <div
      className="fade-in rounded-xl bg-white p-3 shadow-sm ring-1 ring-stone-200"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'SELECT') {
          e.preventDefault();
          submit();
        }
      }}
    >
      <div className="flex items-center gap-3">
        <span className="checkbox" />
        <input
          ref={ref}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="min-w-0 flex-1 bg-transparent text-[15px] leading-6"
          enterKeyHint="done"
          autoCapitalize="sentences"
        />
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          <X width={14} height={14} />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[30px]">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={ctl} aria-label="Due date" />
        {dueDate && <input type="time" value={dueTime} onChange={(e) => setDueTime(e.target.value)} className={ctl} aria-label="Due time" />}

        <div className="inline-flex rounded-md bg-stone-100 p-0.5" role="radiogroup" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(p.value)}
              className={`flex items-center gap-1.5 rounded px-2 py-1 text-[12px] transition ${priority === p.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
            >
              {p.value !== 'none' && <span className={`size-1.5 rounded-full ${p.dot}`} />}
              {p.label}
            </button>
          ))}
        </div>

        <select value={areaId} onChange={(e) => { setAreaId(e.target.value); setProjectId(''); }} className={sel} aria-label="Area">
          <option value="">Inbox</option>
          {areas.filter((a) => !a.archived).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {visibleProjects.length > 0 && (
          <select
            value={projectId}
            onChange={(e) => {
              const p = projects.find((x) => x.id === e.target.value);
              setProjectId(e.target.value);
              if (p) setAreaId(p.area_id);
            }}
            className={sel}
            aria-label="Project"
          >
            <option value="">No project</option>
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className={sel} aria-label="Repeat">
          <option value="">No repeat</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
        </select>

        <button
          type="button"
          onClick={submit}
          disabled={!title.trim()}
          className="ml-auto rounded-md bg-stone-900 px-3 py-1.5 text-[12.5px] font-medium text-white transition hover:bg-stone-800 disabled:opacity-30"
        >
          Add task
        </button>
      </div>
    </div>
  );
}

const ctl = 'focus-ring h-8 rounded-md border border-stone-200 bg-white px-2 text-[12.5px] text-stone-700 hover:border-stone-300 min-h-0';
const sel =
  'focus-ring h-8 appearance-none rounded-md border border-stone-200 bg-white pl-2 pr-6 text-[12.5px] text-stone-700 hover:border-stone-300 bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2378716c%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[position:right_6px_center] bg-no-repeat';
