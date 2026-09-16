import { useEffect, useRef, useState } from 'react';
import { DndContext, DragEndEvent, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Area, Project, SyncState, Task, View } from '../types';
import { today } from '../lib/dates';
import { Archive, CalendarIcon, CheckCircle, Chevron, Dots, Inbox, Layers, Plus, Search, Star } from './Icons';

interface Props {
  view: View;
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  sync: SyncState;
  pending: number;
  onNavigate: (v: View) => void;
  onSearch: () => void;
  onAddArea: (name: string) => void;
  onRenameArea: (id: string, name: string) => void;
  onArchiveArea: (id: string, archived: boolean) => void;
  onReorderAreas: (ids: string[]) => void;
  onAddProject: (areaId: string, name: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onArchiveProject: (id: string, archived: boolean) => void;
}

export default function Sidebar(p: Props) {
  const open = p.tasks.filter((t) => t.status === 'open');
  const t0 = today();
  const counts = {
    inbox: open.filter((t) => !t.area_id && !t.project_id).length,
    today: open.filter((t) => t.due_date && t.due_date <= t0).length,
  };
  const [addingArea, setAddingArea] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
  );
  const active = p.areas.filter((a) => !a.archived);
  const archived = p.areas.filter((a) => a.archived);

  const onDragEnd = (e: DragEndEvent) => {
    const { active: a, over } = e;
    if (!over || a.id === over.id) return;
    const ids = active.map((x) => x.id);
    p.onReorderAreas(arrayMove(ids, ids.indexOf(String(a.id)), ids.indexOf(String(over.id))));
  };

  return (
    <nav className="flex h-full flex-col bg-stone-50 text-[14px]">
      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={p.onSearch}
          className="focus-ring flex w-full items-center gap-2 rounded-md border border-stone-200/80 bg-white px-2.5 py-1.5 text-left text-stone-400 shadow-sm transition hover:border-stone-300"
        >
          <Search width={14} height={14} />
          <span className="flex-1">Search</span>
          <kbd className="hidden rounded border border-stone-200 px-1 text-[10px] text-stone-400 md:inline">/</kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-4">
        <ul className="mt-3 space-y-px">
          <NavItem icon={<Inbox />} label="Inbox" count={counts.inbox} active={p.view.kind === 'inbox'} onClick={() => p.onNavigate({ kind: 'inbox' })} />
          <NavItem icon={<Star />} label="Today" count={counts.today} active={p.view.kind === 'today'} onClick={() => p.onNavigate({ kind: 'today' })} />
          <NavItem icon={<CalendarIcon />} label="Upcoming" active={p.view.kind === 'upcoming'} onClick={() => p.onNavigate({ kind: 'upcoming' })} />
          <NavItem icon={<Layers />} label="All Tasks" active={p.view.kind === 'all'} onClick={() => p.onNavigate({ kind: 'all' })} />
        </ul>

        <div className="mt-6 mb-1 flex items-center justify-between px-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-wider text-stone-400">Areas</span>
          <button type="button" aria-label="Add area" onClick={() => setAddingArea(true)} className="rounded p-0.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-700">
            <Plus width={14} height={14} />
          </button>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragEnd={onDragEnd}>
          <SortableContext items={active.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-px">
              {active.map((a) => (
                <AreaItem key={a.id} {...p} area={a} projects={p.projects.filter((x) => x.area_id === a.id)} tasks={open} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {addingArea && (
          <InlineInput
            placeholder="Area name"
            className="mt-px px-2"
            onSubmit={(name) => {
              p.onAddArea(name);
              setAddingArea(false);
            }}
            onCancel={() => setAddingArea(false)}
          />
        )}

        {archived.length > 0 && (
          <div className="mt-4">
            <button type="button" onClick={() => setShowArchived(!showArchived)} className="px-2 text-[12px] text-stone-400 hover:text-stone-600">
              {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
            </button>
            {showArchived && (
              <ul className="mt-1 space-y-px">
                {archived.map((a) => (
                  <li key={a.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-stone-400">
                    <span className="flex-1 truncate">{a.name}</span>
                    <button type="button" onClick={() => p.onArchiveArea(a.id, false)} className="text-[12px] opacity-0 hover:text-stone-700 group-hover:opacity-100">
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ul className="mt-6 space-y-px">
          <NavItem icon={<CheckCircle />} label="Completed" active={p.view.kind === 'completed'} onClick={() => p.onNavigate({ kind: 'completed' })} />
        </ul>
      </div>

      <SyncPill sync={p.sync} pending={p.pending} />
    </nav>
  );
}

function NavItem({ icon, label, count, active, onClick }: { icon: React.ReactNode; label: string; count?: number; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`focus-ring flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
          active ? 'bg-stone-200/60 font-medium text-stone-900' : 'text-stone-700 hover:bg-stone-200/40'
        }`}
      >
        <span className="text-stone-500">{icon}</span>
        <span className="flex-1 truncate">{label}</span>
        {count ? <span className="text-[12px] tabular-nums text-stone-400">{count}</span> : null}
      </button>
    </li>
  );
}

function AreaItem({
  area,
  projects,
  tasks,
  view,
  onNavigate,
  onRenameArea,
  onArchiveArea,
  onAddProject,
  onRenameProject,
  onArchiveProject,
}: { area: Area; projects: Project[]; tasks: Task[] } & Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: area.id });
  const isActive = view.kind === 'area' && view.id === area.id;
  const containsActive = isActive || (view.kind === 'project' && projects.some((p) => p.id === view.id));
  const [expanded, setExpanded] = useState(containsActive);
  const [renaming, setRenaming] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [menu, setMenu] = useState(false);
  const visible = projects.filter((p) => !p.archived);
  const count = tasks.filter((t) => t.area_id === area.id || projects.some((p) => p.id === t.project_id)).length;

  useEffect(() => {
    if (containsActive) setExpanded(true);
  }, [containsActive]);

  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={isDragging ? 'z-10 rounded-md bg-white shadow-md' : ''}>
      <div
        {...attributes}
        {...listeners}
        className={`group relative flex items-center gap-1 rounded-md pr-1 transition-colors ${isActive ? 'bg-stone-200/60' : 'hover:bg-stone-200/40'}`}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          onClick={() => setExpanded(!expanded)}
          onPointerDown={(e) => e.stopPropagation()}
          className={`ml-0.5 rounded p-1 text-stone-400 transition ${visible.length ? 'hover:text-stone-700' : 'opacity-0'}`}
        >
          <Chevron width={12} height={12} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
        {renaming ? (
          <InlineInput
            initial={area.name}
            className="flex-1"
            onSubmit={(name) => {
              onRenameArea(area.id, name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => onNavigate({ kind: 'area', id: area.id })}
            onDoubleClick={() => setRenaming(true)}
            className={`flex-1 truncate py-1.5 text-left ${isActive ? 'font-medium text-stone-900' : 'text-stone-700'}`}
          >
            {area.name}
          </button>
        )}
        {count > 0 && !menu && <span className="text-[12px] tabular-nums text-stone-400 group-hover:hidden">{count}</span>}
        <div className="relative" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label="Area options"
            onClick={() => setMenu(!menu)}
            className={`rounded p-1 text-stone-400 hover:text-stone-700 ${menu ? '' : 'hidden group-hover:block'}`}
          >
            <Dots width={14} height={14} />
          </button>
          {menu && (
            <Menu onClose={() => setMenu(false)}>
              <MenuItem onClick={() => { setAddingProject(true); setExpanded(true); }} icon={<Plus width={13} height={13} />}>New project</MenuItem>
              <MenuItem onClick={() => setRenaming(true)}>Rename</MenuItem>
              <MenuItem onClick={() => onArchiveArea(area.id, true)} icon={<Archive width={13} height={13} />}>Archive</MenuItem>
            </Menu>
          )}
        </div>
      </div>
      {expanded && (visible.length > 0 || addingProject) && (
        <ul className="mt-px mb-1 ml-[18px] space-y-px border-l border-stone-200 pl-2">
          {visible.map((pr) => (
            <ProjectItem
              key={pr.id}
              project={pr}
              count={tasks.filter((t) => t.project_id === pr.id).length}
              active={view.kind === 'project' && view.id === pr.id}
              onClick={() => onNavigate({ kind: 'project', id: pr.id })}
              onRename={(name) => onRenameProject(pr.id, name)}
              onArchive={() => onArchiveProject(pr.id, true)}
            />
          ))}
          {addingProject && (
            <InlineInput
              placeholder="Project name"
              className="px-2"
              onSubmit={(name) => {
                onAddProject(area.id, name);
                setAddingProject(false);
              }}
              onCancel={() => setAddingProject(false)}
            />
          )}
        </ul>
      )}
    </li>
  );
}

function ProjectItem({ project, count, active, onClick, onRename, onArchive }: { project: Project; count: number; active: boolean; onClick: () => void; onRename: (n: string) => void; onArchive: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <li className={`group flex items-center gap-1 rounded-md pr-1 transition-colors ${active ? 'bg-stone-200/60' : 'hover:bg-stone-200/40'}`}>
      {renaming ? (
        <InlineInput initial={project.name} className="flex-1 px-2" onSubmit={(n) => { onRename(n); setRenaming(false); }} onCancel={() => setRenaming(false)} />
      ) : (
        <button type="button" onClick={onClick} onDoubleClick={() => setRenaming(true)} className={`flex-1 truncate px-2 py-1.5 text-left ${active ? 'font-medium text-stone-900' : 'text-stone-600'}`}>
          {project.name}
        </button>
      )}
      {count > 0 && !menu && <span className="text-[12px] tabular-nums text-stone-400 group-hover:hidden">{count}</span>}
      <div className="relative">
        <button type="button" aria-label="Project options" onClick={() => setMenu(!menu)} className={`rounded p-1 text-stone-400 hover:text-stone-700 ${menu ? '' : 'hidden group-hover:block'}`}>
          <Dots width={14} height={14} />
        </button>
        {menu && (
          <Menu onClose={() => setMenu(false)}>
            <MenuItem onClick={() => setRenaming(true)}>Rename</MenuItem>
            <MenuItem onClick={onArchive} icon={<Archive width={13} height={13} />}>Archive</MenuItem>
          </Menu>
        )}
      </div>
    </li>
  );
}

function Menu({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} onClick={onClose} className="fade-in absolute right-0 top-full z-30 mt-1 min-w-[150px] rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
      {children}
    </div>
  );
}

function MenuItem({ children, icon, onClick }: { children: React.ReactNode; icon?: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-stone-700 hover:bg-stone-100">
      {icon && <span className="text-stone-400">{icon}</span>}
      {children}
    </button>
  );
}

function InlineInput({ initial = '', placeholder, className = '', onSubmit, onCancel }: { initial?: string; placeholder?: string; className?: string; onSubmit: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = () => (v.trim() && v.trim() !== initial ? onSubmit(v.trim()) : onCancel());
  return (
    <div className={className} onPointerDown={(e) => e.stopPropagation()}>
      <input
        ref={ref}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={commit}
        className="w-full rounded-md border border-stone-300 bg-white px-1.5 py-1 text-[14px] shadow-sm"
      />
    </div>
  );
}

function SyncPill({ sync, pending }: { sync: SyncState; pending: number }) {
  const label =
    sync === 'offline' ? `Offline · ${pending} unsaved, retrying` : sync === 'saving' ? 'Saving…' : sync === 'error' ? 'Sync error' : 'Synced';
  const dot = sync === 'offline' || sync === 'error' ? 'bg-amber-500' : sync === 'saving' ? 'bg-stone-400 animate-pulse' : 'bg-emerald-500';
  return (
    <div className="flex items-center gap-2 border-t border-stone-200/70 px-4 py-2.5 text-[12px] text-stone-400 safe-bottom" data-sync={sync}>
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </div>
  );
}
