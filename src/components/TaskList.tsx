import { useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { Area, Project, Task } from '../types';
import type { Group } from '../lib/views';
import TaskRow from './TaskRow';
import QuickAdd from './QuickAdd';
import { Plus } from './Icons';

interface Props {
  groups: Group[];
  projects: Project[];
  areas: Area[];
  selectedId: string | null;
  showDate: boolean;
  showContext: boolean;
  showCompleted?: boolean;
  sortable?: boolean;
  emptyText: string;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: (task: Partial<Task> & { title: string }) => void;
}

export default function TaskList({
  groups,
  projects,
  areas,
  selectedId,
  showDate,
  showContext,
  showCompleted,
  sortable = true,
  emptyText,
  onSelect,
  onToggle,
  onReorder,
  onAdd,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const areaName = new Map(areas.map((a) => [a.id, a.name]));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const group = groups.find((g) => g.tasks.some((t) => t.id === active.id));
    if (!group || !group.tasks.some((t) => t.id === over.id)) return;
    const ids = group.tasks.map((t) => t.id);
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };

  const total = groups.reduce((n, g) => n + g.tasks.length, 0);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
      <div className="space-y-7">
        {groups.map((g) => {
          const showHeader = Boolean(g.title);
          if (!g.tasks.length && !g.alwaysShow && addingIn !== g.key) return null;
          return (
            <section key={g.key} className="fade-in">
              {showHeader && (
                <header className="group/h mb-1 flex items-baseline gap-2 px-3">
                  <h2 className={`text-[13px] font-semibold tracking-wide uppercase ${g.key === 'overdue' ? 'text-red-600' : 'text-stone-500'}`}>{g.title}</h2>
                  {g.subtitle && <span className="text-[12.5px] text-stone-400">{g.subtitle}</span>}
                  {g.tasks.length > 0 && <span className="text-[12.5px] tabular-nums text-stone-300">{g.tasks.length}</span>}
                  {g.defaults && (
                    <button
                      type="button"
                      aria-label={`Add task to ${g.title}`}
                      onClick={() => setAddingIn(g.key)}
                      className="ml-auto rounded p-1 text-stone-300 opacity-0 transition hover:bg-stone-100 hover:text-stone-600 group-hover/h:opacity-100 focus-visible:opacity-100"
                    >
                      <Plus width={14} height={14} />
                    </button>
                  )}
                </header>
              )}
              <SortableContext items={g.tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                <ul className="-mx-0">
                  {g.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      projectName={showContext ? projectName.get(t.project_id) : undefined}
                      areaName={showContext && !t.project_id ? areaName.get(t.area_id) : undefined}
                      selected={t.id === selectedId}
                      showDate={showDate && !g.hideDate}
                      showCompleted={showCompleted}
                      sortable={sortable}
                      onSelect={onSelect}
                      onToggle={onToggle}
                    />
                  ))}
                </ul>
              </SortableContext>
              {addingIn === g.key && (
                <QuickAdd
                  autoFocus
                  areas={areas}
                  projects={projects}
                  defaults={g.defaults}
                  onSubmit={onAdd}
                  onClose={() => setAddingIn(null)}
                />
              )}
              {!g.tasks.length && showHeader && addingIn !== g.key && total > 0 && <p className="px-3 py-1.5 text-[14px] text-stone-300">No tasks</p>}
            </section>
          );
        })}
        {total === 0 && !addingIn && (
          <div className="px-3 pt-10 text-center">
            <p className="text-[15px] text-stone-400">{emptyText}</p>
          </div>
        )}
      </div>
    </DndContext>
  );
}
