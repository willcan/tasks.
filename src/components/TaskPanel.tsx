import { useEffect, useRef, useState } from 'react';
import type { Area, Priority, Project, Task } from '../types';
import { formatTimestamp, longDate } from '../lib/dates';
import { parseRecurrence, serializeRecurrence, type Unit } from '../lib/recurrence';
import { uuid } from '../lib/store';
import { PROGRESS } from '../lib/progress';
import { Check, Plus, Trash, X } from './Icons';

interface Props {
  task: Task;
  areas: Area[];
  projects: Project[];
  onChange: (changes: Partial<Task>) => void;
  onComplete: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function TaskPanel({ task, areas, projects, onChange, onComplete, onRestore, onDelete, onClose }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newSub, setNewSub] = useState('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const done = task.status === 'done';

  useEffect(() => {
    setConfirmDelete(false);
    autosize(titleRef.current);
    autosize(notesRef.current);
  }, [task.id]);
  useEffect(() => autosize(titleRef.current), [task.title]);
  useEffect(() => autosize(notesRef.current), [task.notes]);

  const rec = parseRecurrence(task.recurrence);
  const recMode = !rec ? 'none' : rec.n === 1 ? rec.unit : 'custom';
  const [customN, setCustomN] = useState(rec && rec.n > 1 ? rec.n : 2);
  const [customUnit, setCustomUnit] = useState<Unit>(rec?.unit || 'weeks');

  const setRecurrenceMode = (mode: string) => {
    if (mode === 'none') return onChange({ recurrence: '' });
    if (mode === 'custom') return onChange({ recurrence: serializeRecurrence({ n: customN, unit: customUnit }) });
    onChange({ recurrence: serializeRecurrence({ n: 1, unit: mode as Unit }) });
  };

  const visibleProjects = projects.filter((p) => !p.archived && (!task.area_id || p.area_id === task.area_id));
  const areaOptions = areas.filter((a) => !a.archived || a.id === task.area_id);

  const addSub = () => {
    const title = newSub.trim();
    if (!title) return;
    onChange({ subtasks: [...task.subtasks, { id: uuid(), title, done: false }] });
    setNewSub('');
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <button type="button" onClick={done ? onRestore : onComplete} className="focus-ring flex items-center gap-2 rounded-md py-1 pr-2 text-[13px] text-stone-500 hover:text-stone-900">
          <span className={`checkbox ${done ? 'checked' : ''}`}>{done && <Check width={11} height={11} className="text-white" />}</span>
          {done ? 'Completed' : 'Mark complete'}
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="focus-ring -mr-2 rounded-md p-2 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
          <X />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-8">
        <textarea
          ref={titleRef}
          value={task.title}
          rows={1}
          onChange={(e) => onChange({ title: e.target.value.replace(/\n/g, '') })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              notesRef.current?.focus();
            }
          }}
          placeholder="Task title"
          className={`w-full resize-none bg-transparent text-[20px] font-semibold leading-7 tracking-tight ${done ? 'text-stone-400 line-through' : ''}`}
        />
        <textarea
          ref={notesRef}
          value={task.notes}
          rows={2}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Notes"
          className="mt-1 w-full resize-none bg-transparent text-[14.5px] leading-6 text-stone-700"
        />

        <div className="mt-5 space-y-1 border-t border-stone-100 pt-4">
          <Field label="Area">
            <select value={task.area_id} onChange={(e) => onChange({ area_id: e.target.value, project_id: '' })} className={selectCls}>
              <option value="">None (Inbox)</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Project">
            <select
              value={task.project_id}
              onChange={(e) => {
                const p = projects.find((x) => x.id === e.target.value);
                onChange({ project_id: e.target.value, area_id: p ? p.area_id : task.area_id });
              }}
              className={selectCls}
            >
              <option value="">None</option>
              {visibleProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Due">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" value={task.due_date} onChange={(e) => onChange({ due_date: e.target.value, ...(e.target.value ? {} : { due_time: '' }) })} className={inputCls} />
              {task.due_date && (
                <input type="time" value={task.due_time} onChange={(e) => onChange({ due_time: e.target.value })} className={inputCls} placeholder="Time" />
              )}
              {task.due_date && (
                <button type="button" onClick={() => onChange({ due_date: '', due_time: '' })} className="text-[12.5px] text-stone-400 hover:text-stone-700">Clear</button>
              )}
            </div>
          </Field>
          <Field label="Priority">
            <div className="inline-flex rounded-md bg-stone-100 p-0.5">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChange({ priority: p.value })}
                  className={`rounded px-2.5 py-1 text-[12.5px] transition ${task.priority === p.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Progress">
            <div className="flex flex-wrap gap-1">
              {PROGRESS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => onChange({ progress: p.value })}
                  className={`rounded-md border px-2.5 py-1 text-[12.5px] transition ${
                    !done && task.progress === p.value
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-200 text-stone-600 hover:border-stone-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              <button
                type="button"
                onClick={done ? undefined : onComplete}
                className={`rounded-md border px-2.5 py-1 text-[12.5px] transition ${
                  done ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 text-stone-600 hover:border-stone-400'
                }`}
              >
                Completed
              </button>
            </div>
          </Field>
          <Field label="Repeat">
            <div className="flex flex-wrap items-center gap-2">
              <select value={recMode} onChange={(e) => setRecurrenceMode(e.target.value)} className={selectCls}>
                <option value="none">Never</option>
                <option value="days">Daily</option>
                <option value="weeks">Weekly</option>
                <option value="months">Monthly</option>
                <option value="custom">Custom…</option>
              </select>
              {recMode === 'custom' && (
                <span className="flex items-center gap-1.5 text-[13px] text-stone-500">
                  every
                  <input
                    type="number"
                    min={1}
                    value={customN}
                    onChange={(e) => {
                      const n = Math.max(1, Number(e.target.value) || 1);
                      setCustomN(n);
                      onChange({ recurrence: serializeRecurrence({ n, unit: customUnit }) });
                    }}
                    className={`${inputCls} w-14`}
                  />
                  <select
                    value={customUnit}
                    onChange={(e) => {
                      const unit = e.target.value as Unit;
                      setCustomUnit(unit);
                      onChange({ recurrence: serializeRecurrence({ n: customN, unit }) });
                    }}
                    className={selectCls}
                  >
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                    <option value="months">months</option>
                  </select>
                </span>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-5 border-t border-stone-100 pt-4">
          <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-stone-400">Subtasks</h3>
          <ul>
            {task.subtasks.map((s) => (
              <li key={s.id} className="group flex items-center gap-2.5 py-1.5">
                <button
                  type="button"
                  aria-label="Toggle subtask"
                  onClick={() => onChange({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })}
                  className={`checkbox size-4 ${s.done ? 'checked' : ''}`}
                >
                  {s.done && <Check width={10} height={10} className="text-white" />}
                </button>
                <input
                  value={s.title}
                  onChange={(e) => onChange({ subtasks: task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)) })}
                  className={`min-w-0 flex-1 bg-transparent text-[14px] ${s.done ? 'text-stone-400 line-through' : ''}`}
                />
                <button
                  type="button"
                  aria-label="Remove subtask"
                  onClick={() => onChange({ subtasks: task.subtasks.filter((x) => x.id !== s.id) })}
                  className="rounded p-1 text-stone-300 opacity-0 transition hover:text-stone-600 group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X width={12} height={12} />
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2.5 py-1.5">
            <Plus width={14} height={14} className="ml-0.5 text-stone-300" />
            <input
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addSub()}
              onBlur={addSub}
              placeholder="Add subtask"
              className="min-w-0 flex-1 bg-transparent text-[14px]"
              enterKeyHint="done"
            />
          </div>
        </div>

        <div className="mt-6 border-t border-stone-100 pt-4 text-[12px] leading-5 text-stone-400">
          <p>Created {formatTimestamp(task.created_at)}</p>
          {task.completed_at && <p>Completed {formatTimestamp(task.completed_at)}</p>}
          {task.due_date && <p>Due {longDate(task.due_date)}</p>}
        </div>

        <div className="mt-5">
          {confirmDelete ? (
            <div className="flex items-center gap-3 text-[13px]">
              <span className="text-stone-500">Delete permanently?</span>
              <button type="button" onClick={onDelete} className="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="text-stone-500 hover:text-stone-900">Cancel</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-[13px] text-stone-400 hover:text-red-600">
              <Trash width={14} height={14} /> Delete task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const selectCls =
  'focus-ring appearance-none rounded-md border border-stone-200 bg-white px-2.5 py-1.5 pr-7 text-[13.5px] hover:border-stone-300 bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2712%27 height=%2712%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%2378716c%27 stroke-width=%272%27%3E%3Cpath d=%27m6 9 6 6 6-6%27/%3E%3C/svg%3E")] bg-[length:12px] bg-[position:right_8px_center] bg-no-repeat';
const inputCls = 'focus-ring rounded-md border border-stone-200 bg-white px-2.5 py-1.5 text-[13.5px] hover:border-stone-300';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="w-16 shrink-0 pt-1.5 text-[12.5px] text-stone-400">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = '0px';
  el.style.height = el.scrollHeight + 'px';
}
