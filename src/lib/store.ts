import { useSyncExternalStore } from 'react';
import type { Area, Project, Subtask, Task, SyncState } from '../types';
import { api, ApiError } from './api';
import { addDays, parseYmd, today, ymd } from './dates';
import { parseRecurrence } from './recurrence';

export interface State {
  loaded: boolean;
  loadError: string | null;
  areas: Area[];
  projects: Project[];
  tasks: Task[];
  sync: SyncState;
  pending: number;
  notice: string | null;
}

type Job =
  | { kind: 'create'; task: Task }
  | { kind: 'update'; id: string; changes: Partial<Task> }
  | { kind: 'complete'; id: string; nextId: string }
  | { kind: 'restore'; id: string }
  | { kind: 'delete'; id: string }
  | { kind: 'reorder'; orders: Record<string, number> }
  | { kind: 'areas'; areas: Record<string, Area> }
  | { kind: 'projects'; projects: Record<string, Project> };

const DEBOUNCE_MS = 600;

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Same algorithm as the Apps Script side, so optimistic UI matches the sheet. */
export function nextOccurrence(dueDate: string, recurrence: string): string {
  const rec = parseRecurrence(recurrence);
  if (!rec) return '';
  const step = (s: string) => {
    if (rec.unit === 'days') return addDays(s, rec.n);
    if (rec.unit === 'weeks') return addDays(s, rec.n * 7);
    const d = parseYmd(s);
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + rec.n);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return ymd(d);
  };
  const t = today();
  let next = step(dueDate || t);
  let guard = 0;
  while (next <= t && guard++ < 1000) next = step(next);
  return next;
}

class Store {
  state: State = {
    loaded: false,
    loadError: null,
    areas: [],
    projects: [],
    tasks: [],
    sync: 'idle',
    pending: 0,
    notice: null,
  };
  private listeners = new Set<() => void>();
  private queue: { job: Job; readyAt: number }[] = [];
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshWanted = false;
  onUnauthorized: (() => void) | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = () => this.state;

  private set(patch: Partial<State>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  private notify(text: string) {
    this.set({ notice: text });
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => this.set({ notice: null }), 4000);
  }

  /* ---------------- loading ---------------- */

  async load() {
    try {
      const data = await api.bootstrap();
      this.set({
        loaded: true,
        loadError: null,
        areas: sortBy(data.areas),
        projects: sortBy(data.projects),
        tasks: sortBy(data.tasks),
        sync: this.queue.length ? this.state.sync : 'idle',
      });
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'network';
      if (code === 'unauthorized') this.onUnauthorized?.();
      this.set({ loadError: code, loaded: this.state.loaded });
    }
  }

  /** Re-fetch from the sheet, unless local writes are still pending (then run after they drain). */
  async refresh() {
    if (this.queue.length || this.running) {
      this.refreshWanted = true;
      return;
    }
    await this.load();
  }

  /* ---------------- tasks ---------------- */

  private patchTask(id: string, fn: (t: Task) => Task) {
    this.set({ tasks: this.state.tasks.map((t) => (t.id === id ? fn(t) : t)) });
  }

  addTask(partial: Partial<Task> & { title: string }): Task {
    const now = new Date().toISOString();
    const maxOrder = this.state.tasks.reduce((m, t) => Math.max(m, t.sort_order), 0);
    const task: Task = {
      id: uuid(),
      title: partial.title.trim(),
      notes: partial.notes || '',
      area_id: partial.area_id || '',
      project_id: partial.project_id || '',
      due_date: partial.due_date || '',
      due_time: partial.due_time || '',
      priority: partial.priority || 'none',
      status: 'open',
      subtasks: partial.subtasks || [],
      recurrence: partial.recurrence || '',
      sort_order: maxOrder + 1,
      created_at: now,
      completed_at: '',
      updated_at: '',
    };
    this.set({ tasks: [...this.state.tasks, task] });
    this.enqueue({ kind: 'create', task });
    return task;
  }

  updateTask(id: string, changes: Partial<Task>) {
    this.patchTask(id, (t) => ({ ...t, ...changes }));
    // Coalesce with a pending (not yet sent) update for the same task.
    const existing = this.queue.find((q) => q.job.kind === 'update' && q.job.id === id);
    if (existing && existing.job.kind === 'update') {
      existing.job.changes = { ...existing.job.changes, ...changes };
      existing.readyAt = Date.now() + DEBOUNCE_MS;
      this.schedule();
    } else {
      this.enqueue({ kind: 'update', id, changes }, DEBOUNCE_MS);
    }
  }

  /** Marks done; for recurring tasks also creates the next occurrence locally. Returns ids for undo. */
  completeTask(id: string): { id: string; nextId: string | null } {
    const task = this.state.tasks.find((t) => t.id === id);
    if (!task || task.status === 'done') return { id, nextId: null };
    const now = new Date().toISOString();
    this.patchTask(id, (t) => ({ ...t, status: 'done', completed_at: now }));
    let nextId: string | null = null;
    if (task.recurrence) {
      nextId = uuid();
      const next: Task = {
        ...task,
        id: nextId,
        status: 'open',
        due_date: nextOccurrence(task.due_date, task.recurrence),
        subtasks: task.subtasks.map((s) => ({ id: uuid(), title: s.title, done: false })),
        created_at: now,
        completed_at: '',
        updated_at: '',
      };
      this.set({ tasks: [...this.state.tasks, next] });
    }
    this.enqueue({ kind: 'complete', id, nextId: nextId || uuid() });
    return { id, nextId };
  }

  restoreTask(id: string) {
    this.patchTask(id, (t) => ({ ...t, status: 'open', completed_at: '' }));
    this.enqueue({ kind: 'restore', id });
  }

  deleteTask(id: string) {
    this.set({ tasks: this.state.tasks.filter((t) => t.id !== id) });
    // Drop any queued work for this task; a delete supersedes it (except a create that hasn't been sent — then nothing to delete).
    const hadUnsentCreate = this.queue.some((q) => q.job.kind === 'create' && q.job.task.id === id);
    this.queue = this.queue.filter((q) => !('id' in q.job && q.job.id === id) && !(q.job.kind === 'create' && q.job.task.id === id));
    if (!hadUnsentCreate) this.enqueue({ kind: 'delete', id });
    else this.set({ pending: this.queue.length });
  }

  /** Persist a new order for a set of tasks; keeps their existing sort_order range. */
  reorderTasks(orderedIds: string[]) {
    const byId = new Map(this.state.tasks.map((t) => [t.id, t]));
    const slots = orderedIds
      .map((id) => byId.get(id)?.sort_order ?? 0)
      .sort((a, b) => a - b);
    const orders: Record<string, number> = {};
    orderedIds.forEach((id, i) => {
      orders[id] = slots[i];
    });
    this.set({ tasks: sortBy(this.state.tasks.map((t) => (id(t) in orders ? { ...t, sort_order: orders[t.id] } : t))) });
    const existing = this.queue.find((q) => q.job.kind === 'reorder');
    if (existing && existing.job.kind === 'reorder') Object.assign(existing.job.orders, orders);
    else this.enqueue({ kind: 'reorder', orders });
  }

  toggleSubtask(taskId: string, subtaskId: string) {
    const task = this.state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const subtasks: Subtask[] = task.subtasks.map((s) => (s.id === subtaskId ? { ...s, done: !s.done } : s));
    this.updateTask(taskId, { subtasks });
  }

  /* ---------------- areas & projects ---------------- */

  upsertArea(area: Partial<Area> & { name: string; id?: string }): Area {
    const existing = area.id ? this.state.areas.find((a) => a.id === area.id) : undefined;
    const now = new Date().toISOString();
    const full: Area = {
      id: existing?.id || area.id || uuid(),
      name: area.name,
      sort_order: area.sort_order ?? existing?.sort_order ?? this.state.areas.length,
      archived: area.archived ?? existing?.archived ?? false,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    this.set({ areas: sortBy(existing ? this.state.areas.map((a) => (a.id === full.id ? full : a)) : [...this.state.areas, full]) });
    this.enqueueAreas([full]);
    return full;
  }

  reorderAreas(orderedIds: string[]) {
    const now = new Date().toISOString();
    const updated = orderedIds
      .map((id, i) => {
        const a = this.state.areas.find((x) => x.id === id);
        return a ? { ...a, sort_order: i, updated_at: now } : null;
      })
      .filter((a): a is Area => !!a);
    const others = this.state.areas.filter((a) => !orderedIds.includes(a.id));
    this.set({ areas: sortBy([...updated, ...others]) });
    this.enqueueAreas(updated);
  }

  private enqueueAreas(areas: Area[]) {
    const existing = this.queue.find((q) => q.job.kind === 'areas');
    if (existing && existing.job.kind === 'areas') {
      const job = existing.job;
      areas.forEach((a) => (job.areas[a.id] = a));
    }
    else this.enqueue({ kind: 'areas', areas: Object.fromEntries(areas.map((a) => [a.id, a])) });
  }

  upsertProject(project: Partial<Project> & { name: string; area_id: string; id?: string }): Project {
    const existing = project.id ? this.state.projects.find((p) => p.id === project.id) : undefined;
    const now = new Date().toISOString();
    const siblings = this.state.projects.filter((p) => p.area_id === project.area_id);
    const full: Project = {
      id: existing?.id || project.id || uuid(),
      name: project.name,
      area_id: project.area_id,
      sort_order: project.sort_order ?? existing?.sort_order ?? siblings.length,
      archived: project.archived ?? existing?.archived ?? false,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    this.set({ projects: sortBy(existing ? this.state.projects.map((p) => (p.id === full.id ? full : p)) : [...this.state.projects, full]) });
    const q = this.queue.find((x) => x.job.kind === 'projects');
    if (q && q.job.kind === 'projects') q.job.projects[full.id] = full;
    else this.enqueue({ kind: 'projects', projects: { [full.id]: full } });
    return full;
  }

  /* ---------------- write queue ---------------- */

  private enqueue(job: Job, delay = 0) {
    this.queue.push({ job, readyAt: Date.now() + delay });
    this.set({ pending: this.queue.length, sync: this.state.sync === 'offline' ? 'offline' : 'saving' });
    this.schedule();
  }

  private schedule(delay = 0) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.run(), delay);
  }

  private async run() {
    if (this.running) return;
    const head = this.queue[0];
    if (!head) {
      this.set({ sync: 'idle', pending: 0 });
      if (this.refreshWanted) {
        this.refreshWanted = false;
        void this.load();
      }
      return;
    }
    const wait = head.readyAt - Date.now();
    if (wait > 0) return this.schedule(wait);

    this.running = true;
    let attempt = 0;
    while (true) {
      try {
        await this.perform(head.job);
        break;
      } catch (e) {
        const code = e instanceof ApiError ? e.code : 'network';
        if (code === 'unauthorized') {
          this.running = false;
          this.set({ sync: 'error' });
          this.onUnauthorized?.();
          return;
        }
        if (code === 'network' || code === 'busy' || code === 'bad_response') {
          this.set({ sync: 'offline' });
          attempt++;
          await sleep(Math.min(15000, 1000 * 2 ** Math.min(attempt, 4)));
          continue;
        }
        // Server-side rejection (not_found, invalid, …): drop the job, tell the user, reload truth.
        this.notify(`Couldn't save (${code}). Reloading.`);
        this.refreshWanted = true;
        break;
      }
    }
    this.queue.shift();
    this.running = false;
    this.set({ pending: this.queue.length, sync: this.queue.length ? 'saving' : 'idle' });
    this.schedule();
  }

  private async perform(job: Job) {
    switch (job.kind) {
      case 'create': {
        const { task } = await api.createTask(job.task);
        this.adoptServerTask(task);
        return;
      }
      case 'update': {
        const local = this.state.tasks.find((t) => t.id === job.id);
        if (!local) return;
        try {
          const { task } = await api.updateTask(job.id, job.changes, local.updated_at);
          this.adoptServerTask(task);
        } catch (e) {
          if (e instanceof ApiError && e.code === 'conflict') {
            // Another device changed this task. Field-level merge: keep our edited
            // fields, take everything else from the server, then retry once.
            const server = (e.data as { task: Task }).task;
            const alreadyApplied = Object.keys(job.changes).every(
              (k) => JSON.stringify(server[k as keyof Task]) === JSON.stringify(job.changes[k as keyof Task]),
            );
            this.adoptServerTask({ ...server, ...(alreadyApplied ? {} : job.changes) });
            if (!alreadyApplied) {
              const { task } = await api.updateTask(job.id, job.changes, server.updated_at);
              this.adoptServerTask(task);
              this.notify('Merged with a change from another device');
            }
            return;
          }
          throw e;
        }
        return;
      }
      case 'complete': {
        const { task, next } = await api.completeTask(job.id, job.nextId);
        this.adoptServerTask(task);
        if (next) this.adoptServerTask(next);
        return;
      }
      case 'restore': {
        const { task } = await api.restoreTask(job.id);
        this.adoptServerTask(task);
        return;
      }
      case 'delete':
        await api.deleteTask(job.id);
        return;
      case 'reorder':
        await api.reorderTasks(Object.entries(job.orders).map(([id, sort_order]) => ({ id, sort_order })));
        return;
      case 'areas': {
        const { areas } = await api.upsertAreas(Object.values(job.areas));
        this.set({ areas: sortBy(this.state.areas.map((a) => areas.find((s) => s.id === a.id) || a)) });
        return;
      }
      case 'projects': {
        const { projects } = await api.upsertProjects(Object.values(job.projects));
        this.set({ projects: sortBy(this.state.projects.map((p) => projects.find((s) => s.id === p.id) || p)) });
        return;
      }
    }
  }

  /** Take the server's version of a task unless we still have unsent edits for it (then just the timestamps). */
  private adoptServerTask(server: Task) {
    const hasPending = this.queue.slice(1).some((q) => 'id' in q.job && q.job.id === server.id);
    const exists = this.state.tasks.some((t) => t.id === server.id);
    if (!exists) {
      // Server created something we don't have (e.g. next occurrence generated with a different id) — ignore if deleted locally.
      if (this.queue.some((q) => q.job.kind === 'delete' && q.job.id === server.id)) return;
      this.set({ tasks: sortBy([...this.state.tasks, server]) });
      return;
    }
    this.patchTask(server.id, (t) =>
      hasPending ? { ...t, updated_at: server.updated_at, created_at: server.created_at } : server,
    );
  }
}

const id = (t: Task) => t.id;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function sortBy<T extends { sort_order: number; created_at: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

export const store = new Store();

export function useStore(): State {
  return useSyncExternalStore(store.subscribe, store.getState);
}
