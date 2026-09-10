import { useEffect, useMemo, useRef, useState } from 'react';
import type { Area, Project, Task } from '../types';
import { searchTasks } from '../lib/views';
import { formatTimestamp, shortDate } from '../lib/dates';
import { Search } from './Icons';

interface Props {
  tasks: Task[];
  projects: Project[];
  areas: Area[];
  onPick: (task: Task) => void;
  onClose: () => void;
}

export default function SearchOverlay({ tasks, projects, areas, onPick, onClose }: Props) {
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchTasks(q, tasks, projects, areas), [q, tasks, projects, areas]);
  const pName = new Map(projects.map((p) => [p.id, p.name]));
  const aName = new Map(areas.map((a) => [a.id, a.name]));

  useEffect(() => {
    ref.current?.focus();
  }, []);
  useEffect(() => setIndex(0), [q]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[index]) onPick(results[index]);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-stone-900/20 p-4 pt-[12vh] backdrop-blur-[2px]" onClick={onClose}>
      <div className="fade-in w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-stone-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-stone-100 px-4">
          <Search className="text-stone-400" />
          <input
            ref={ref}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search tasks, notes, projects, areas…"
            className="h-12 flex-1 bg-transparent text-[15px]"
          />
          <kbd className="hidden rounded border border-stone-200 px-1.5 text-[10px] text-stone-400 md:inline">esc</kbd>
        </div>
        {q.trim() && (
          <ul className="max-h-[50vh] overflow-y-auto p-1.5">
            {results.length === 0 && <li className="px-3 py-6 text-center text-[14px] text-stone-400">No matches</li>}
            {results.map((t, i) => {
              const ctx = pName.get(t.project_id) || aName.get(t.area_id);
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => onPick(t)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === index ? 'bg-stone-100' : ''}`}
                  >
                    <span className={`checkbox size-4 ${t.status === 'done' ? 'checked' : ''}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[14.5px] ${t.status === 'done' ? 'text-stone-400 line-through' : ''}`}>{t.title}</span>
                      <span className="block truncate text-[12px] text-stone-400">
                        {t.status === 'done' ? `Completed ${formatTimestamp(t.completed_at)}` : t.due_date ? shortDate(t.due_date) : 'No date'}
                        {ctx ? ` · ${ctx}` : ''}
                        {t.notes ? ` · ${t.notes.slice(0, 60)}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
