import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task, View } from './types';
import { clearToken, getConfig } from './lib/api';
import { store, useStore } from './lib/store';
import { groupsForView, hashFromView, viewDefaults, viewFromHash, viewTitle } from './lib/views';
import Sidebar from './components/Sidebar';
import TaskList from './components/TaskList';
import TaskPanel from './components/TaskPanel';
import QuickAdd from './components/QuickAdd';
import SearchOverlay from './components/SearchOverlay';
import Setup from './components/Setup';
import { Menu, Plus, Search, Undo, X } from './components/Icons';

interface Toast {
  text: string;
  undo?: () => void;
}

export default function App() {
  const state = useStore();
  const [configured, setConfigured] = useState(() => Boolean(getConfig().url && getConfig().token));
  const [authError, setAuthError] = useState<string | null>(null);
  const [view, setView] = useState<View>(() => viewFromHash(location.hash));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [searching, setSearching] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [doneQuery, setDoneQuery] = useState('');
  const [toast, setToast] = useState<Toast | null>(null);
  const isTablet = useMediaQuery('(min-width: 768px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- boot & sync ---- */
  useEffect(() => {
    store.onUnauthorized = () => {
      clearToken();
      setAuthError('unauthorized');
      setConfigured(false);
    };
    if (configured) void store.load();
  }, [configured]);

  useEffect(() => {
    let last = Date.now();
    const maybeRefresh = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < 15000) return;
      last = Date.now();
      void store.refresh();
    };
    document.addEventListener('visibilitychange', maybeRefresh);
    window.addEventListener('focus', maybeRefresh);
    window.addEventListener('online', () => void store.refresh());
    return () => {
      document.removeEventListener('visibilitychange', maybeRefresh);
      window.removeEventListener('focus', maybeRefresh);
    };
  }, []);

  /* ---- routing ---- */
  useEffect(() => {
    const onHash = () => setView(viewFromHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((v: View) => {
    location.hash = hashFromView(v);
    setView(v);
    setDrawer(false);
    setAdding(false);
  }, []);

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearching(true);
        return;
      }
      if (typing) return;
      if (e.key === '/') { e.preventDefault(); setSearching(true); }
      if (e.key === 'n') { e.preventDefault(); setAdding(true); }
      if (e.key === 'Escape') { setSelectedId(null); setSearching(false); setDrawer(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---- derived ---- */
  const { tasks, projects, areas } = state;
  const selected = useMemo(() => tasks.find((t) => t.id === selectedId) || null, [tasks, selectedId]);
  const groups = useMemo(() => {
    const g = groupsForView(view, tasks, projects, areas);
    if (view.kind === 'completed' && doneQuery.trim()) {
      const q = doneQuery.toLowerCase();
      return g.map((x) => ({ ...x, tasks: x.tasks.filter((t) => t.title.toLowerCase().includes(q) || t.notes.toLowerCase().includes(q)) }));
    }
    return g;
  }, [view, tasks, projects, areas, doneQuery]);
  const title = viewTitle(view, areas, projects);
  const subtitle = view.kind === 'project' ? areas.find((a) => a.id === projects.find((p) => p.id === view.id)?.area_id)?.name : undefined;

  /* ---- actions ---- */
  const showToast = (t: Toast) => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  };

  const addTask = (task: Partial<Task> & { title: string }) => {
    store.addTask(task);
  };

  const toggleTask = (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (task.status === 'done') {
      store.restoreTask(id);
      showToast({ text: 'Task restored' });
      return;
    }
    const { nextId } = store.completeTask(id);
    if (selectedId === id) setSelectedId(null);
    showToast({
      text: nextId ? 'Completed · next occurrence added' : 'Completed',
      undo: () => {
        store.restoreTask(id);
        if (nextId) store.deleteTask(nextId);
        setToast(null);
      },
    });
  };

  const deleteTask = (id: string) => {
    store.deleteTask(id);
    setSelectedId(null);
  };

  if (!configured) {
    return (
      <Setup
        error={authError}
        onDone={() => {
          setAuthError(null);
          setConfigured(true);
        }}
      />
    );
  }

  const sidebar = (
    <Sidebar
      view={view}
      areas={areas}
      projects={projects}
      tasks={tasks}
      sync={state.sync}
      pending={state.pending}
      onNavigate={navigate}
      onSearch={() => { setSearching(true); setDrawer(false); }}
      onAddArea={(name) => store.upsertArea({ name })}
      onRenameArea={(id, name) => store.upsertArea({ id, name })}
      onArchiveArea={(id, archived) => {
        const a = areas.find((x) => x.id === id);
        if (a) store.upsertArea({ ...a, archived });
        if (archived && view.kind === 'area' && view.id === id) navigate({ kind: 'today' });
      }}
      onReorderAreas={(ids) => store.reorderAreas(ids)}
      onAddProject={(areaId, name) => store.upsertProject({ name, area_id: areaId })}
      onRenameProject={(id, name) => {
        const p = projects.find((x) => x.id === id);
        if (p) store.upsertProject({ ...p, name });
      }}
      onArchiveProject={(id, archived) => {
        const p = projects.find((x) => x.id === id);
        if (p) store.upsertProject({ ...p, archived });
        if (archived && view.kind === 'project' && view.id === id) navigate({ kind: 'area', id: p?.area_id || '' });
      }}
    />
  );

  const panel = selected && (
    <TaskPanel
      task={selected}
      areas={areas}
      projects={projects}
      onChange={(c) => store.updateTask(selected.id, c)}
      onComplete={() => toggleTask(selected.id)}
      onRestore={() => toggleTask(selected.id)}
      onDelete={() => deleteTask(selected.id)}
      onClose={() => setSelectedId(null)}
    />
  );

  return (
    <div className="flex h-full" data-sync={state.sync}>
      {/* Sidebar — static on desktop, drawer on mobile */}
      {isTablet && <aside className="w-[232px] shrink-0 border-r border-stone-200/70">{sidebar}</aside>}
      {!isTablet && drawer && (
        <div className="fixed inset-0 z-30 md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-stone-900/25" />
          <aside className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="mx-auto flex w-full max-w-[880px] items-center gap-2 px-4 pt-3 pb-1 md:px-10 md:pt-8 md:pb-2">
          <button type="button" aria-label="Menu" onClick={() => setDrawer(true)} className="-ml-2 rounded-md p-2 text-stone-500 hover:bg-stone-100 md:hidden">
            <Menu width={20} height={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold tracking-tight md:text-[26px]">{title}</h1>
            {subtitle && <p className="text-[13px] text-stone-400">{subtitle}</p>}
          </div>
          {state.sync !== 'idle' && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] md:hidden ${state.sync === 'saving' ? 'bg-stone-100 text-stone-500' : 'bg-amber-50 text-amber-700'}`}>
              {state.sync === 'saving' ? 'Saving…' : state.sync === 'offline' ? `Offline · ${state.pending} unsaved` : 'Sync error'}
            </span>
          )}
          <button type="button" aria-label="Search" onClick={() => setSearching(true)} className="rounded-md p-2 text-stone-500 hover:bg-stone-100 md:hidden">
            <Search width={20} height={20} />
          </button>
          {view.kind !== 'completed' && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="focus-ring hidden items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-[13.5px] font-medium text-white shadow-sm transition hover:bg-stone-800 md:inline-flex"
            >
              <Plus width={14} height={14} strokeWidth={2.25} /> New Task
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[880px] px-2 pb-28 md:px-7 md:pb-16">
          {view.kind === 'completed' && (
            <div className="px-3 py-2">
              <input
                value={doneQuery}
                onChange={(e) => setDoneQuery(e.target.value)}
                placeholder="Search completed…"
                className="focus-ring w-full max-w-sm rounded-md border border-stone-200 bg-white px-3 py-1.5 text-[14px]"
              />
            </div>
          )}
          {adding && (
            <div className="mb-3 px-0">
              <QuickAdd autoFocus areas={areas} projects={projects} defaults={viewDefaults(view, projects)} onSubmit={addTask} onClose={() => setAdding(false)} />
            </div>
          )}
          {!state.loaded && !state.loadError && <p className="px-3 py-10 text-center text-[14px] text-stone-400">Loading…</p>}
          {!state.loaded && state.loadError && (
            <div className="px-3 py-10 text-center text-[14px] text-stone-500">
              <p>Couldn't reach your sheet ({state.loadError}).</p>
              <button type="button" onClick={() => store.load()} className="mt-3 rounded-md border border-stone-200 px-3 py-1.5 hover:bg-stone-50">Retry</button>
            </div>
          )}
          {state.loaded && (
            <TaskList
              groups={groups}
              projects={projects}
              areas={areas}
              selectedId={selectedId}
              showDate={view.kind !== 'upcoming'}
              showContext={view.kind !== 'project'}
              showCompleted={view.kind === 'completed'}
              sortable={view.kind !== 'completed'}
              emptyText={emptyText(view)}
              onSelect={setSelectedId}
              onToggle={toggleTask}
              onReorder={(ids) => store.reorderTasks(ids)}
              onAdd={addTask}
            />
          )}
          </div>
        </div>

        {/* Mobile add button */}
        {view.kind !== 'completed' && (
          <button
            type="button"
            aria-label="New task"
            onClick={() => { setAdding(true); window.scrollTo(0, 0); }}
            className="fixed bottom-6 right-5 z-20 flex size-14 items-center justify-center rounded-full bg-stone-900 text-white shadow-lg shadow-stone-900/20 transition active:scale-95 md:hidden"
            style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
          >
            <Plus width={24} height={24} strokeWidth={2} />
          </button>
        )}

        {/* Toasts */}
        {(toast || state.notice) && (
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4 md:bottom-8" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="fade-in pointer-events-auto flex items-center gap-3 rounded-full bg-stone-900 py-2 pl-4 pr-2 text-[13.5px] text-white shadow-lg">
              <span>{toast?.text || state.notice}</span>
              {toast?.undo && (
                <button type="button" onClick={toast.undo} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-medium hover:bg-white/20">
                  <Undo width={13} height={13} /> Undo
                </button>
              )}
              <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="rounded-full p-1 text-white/60 hover:text-white">
                <X width={13} height={13} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Task panel — side panel on desktop, sheet on mobile */}
      {selected && (
        isDesktop ? (
          <aside className="w-[380px] shrink-0 border-l border-stone-200/70">{panel}</aside>
        ) : (
          <div className="fixed inset-0 z-30" onClick={() => setSelectedId(null)}>
            <div className="absolute inset-0 bg-stone-900/25" />
            <div
              className="slide-up absolute inset-x-0 bottom-0 top-[6vh] overflow-hidden rounded-t-2xl bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:w-[420px] md:rounded-none"
              onClick={(e) => e.stopPropagation()}
            >
              {panel}
            </div>
          </div>
        )
      )}

      {searching && (
        <SearchOverlay
          tasks={tasks}
          projects={projects}
          areas={areas}
          onPick={(t) => {
            setSearching(false);
            if (t.status === 'done') navigate({ kind: 'completed' });
            setSelectedId(t.id);
          }}
          onClose={() => setSearching(false)}
        />
      )}
    </div>
  );
}

function useMediaQuery(q: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return match;
}

function emptyText(v: View): string {
  switch (v.kind) {
    case 'inbox': return 'Inbox is empty.';
    case 'today': return 'Nothing due today.';
    case 'upcoming': return 'Nothing scheduled.';
    case 'completed': return 'No completed tasks yet.';
    default: return 'No open tasks.';
  }
}
