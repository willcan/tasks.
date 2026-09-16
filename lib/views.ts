import type { Area, Project, Task, View } from '../types';
import { addDays, daysFromToday, longDate, today, weekdayName } from './dates';

export interface Group {
  key: string;
  title: string;
  subtitle?: string;
  tasks: Task[];
  /** Defaults applied to a task quick-added inside this group. */
  defaults?: Partial<Task>;
  /** Render the group even when empty. */
  alwaysShow?: boolean;
  /** Date chip is redundant inside this group (e.g. the Today group). */
  hideDate?: boolean;
}

export function viewFromHash(hash: string): View {
  const h = hash.replace(/^#\/?/, '');
  if (h.startsWith('area/')) return { kind: 'area', id: h.slice(5) };
  if (h.startsWith('project/')) return { kind: 'project', id: h.slice(8) };
  if (h === 'inbox' || h === 'upcoming' || h === 'all' || h === 'completed') return { kind: h };
  return { kind: 'today' };
}

export function hashFromView(v: View): string {
  if (v.kind === 'area') return `#/area/${v.id}`;
  if (v.kind === 'project') return `#/project/${v.id}`;
  return `#/${v.kind}`;
}

export function viewTitle(v: View, areas: Area[], projects: Project[]): string {
  switch (v.kind) {
    case 'inbox': return 'Inbox';
    case 'today': return 'Today';
    case 'upcoming': return 'Upcoming';
    case 'all': return 'All Tasks';
    case 'completed': return 'Completed';
    case 'area': return areas.find((a) => a.id === v.id)?.name || 'Area';
    case 'project': return projects.find((p) => p.id === v.id)?.name || 'Project';
  }
}

/** Defaults for a task created while looking at a view. */
export function viewDefaults(v: View, projects: Project[]): Partial<Task> {
  switch (v.kind) {
    case 'today': return { due_date: today() };
    case 'upcoming': return { due_date: addDays(today(), 1) };
    case 'area': return { area_id: v.id };
    case 'project': {
      const p = projects.find((x) => x.id === v.id);
      return { project_id: v.id, area_id: p?.area_id || '' };
    }
    default: return {};
  }
}

export function groupsForView(v: View, tasks: Task[], projects: Project[], areas: Area[]): Group[] {
  const open = tasks.filter((t) => t.status === 'open');
  const t0 = today();

  switch (v.kind) {
    case 'inbox':
      return [{ key: 'inbox', title: '', tasks: open.filter((t) => !t.area_id && !t.project_id) }];

    case 'today': {
      const overdue = open.filter((t) => t.due_date && t.due_date < t0);
      const due = open.filter((t) => t.due_date === t0);
      const later = open.filter((t) => t.due_date > t0 && daysFromToday(t.due_date) <= 7);
      return [
        { key: 'overdue', title: 'Overdue', tasks: overdue, defaults: { due_date: t0 } },
        { key: 'today', title: 'Today', subtitle: longDate(t0), tasks: due, defaults: { due_date: t0 }, alwaysShow: true, hideDate: true },
        { key: 'later', title: 'Later', subtitle: 'Next 7 days', tasks: later, defaults: { due_date: addDays(t0, 1) } },
      ];
    }

    case 'upcoming': {
      const future = open.filter((t) => t.due_date && t.due_date > t0).sort(byDate);
      const groups: Group[] = [];
      const push = (key: string, title: string, subtitle: string | undefined, list: Task[], defaults: Partial<Task>) => {
        if (list.length) groups.push({ key, title, subtitle, tasks: list, defaults });
      };
      // Tomorrow, then each remaining day this week by name, then Next Week, then Later.
      const endOfWeek = 7 - new Date().getDay(); // days until next Sunday (exclusive)
      const endOfNextWeek = endOfWeek + 7;
      const tomorrow = addDays(t0, 1);
      push('tomorrow', 'Tomorrow', longDate(tomorrow), future.filter((t) => t.due_date === tomorrow), { due_date: tomorrow });
      for (let d = 2; d < endOfWeek; d++) {
        const day = addDays(t0, d);
        push(day, weekdayName(day), longDate(day), future.filter((t) => t.due_date === day), { due_date: day });
      }
      push(
        'nextweek',
        'Next Week',
        undefined,
        future.filter((t) => daysFromToday(t.due_date) >= Math.max(2, endOfWeek) && daysFromToday(t.due_date) < endOfNextWeek),
        { due_date: addDays(t0, Math.max(2, endOfWeek)) },
      );
      push('later', 'Later', undefined, future.filter((t) => daysFromToday(t.due_date) >= endOfNextWeek), {
        due_date: addDays(t0, endOfNextWeek),
      });
      return groups.length ? groups : [{ key: 'empty', title: '', tasks: [] }];
    }

    case 'all': {
      const groups: Group[] = [];
      const inbox = open.filter((t) => !t.area_id && !t.project_id);
      if (inbox.length) groups.push({ key: 'inbox', title: 'Inbox', tasks: inbox });
      areas
        .filter((a) => !a.archived)
        .forEach((a) => {
          const list = open.filter((t) => t.area_id === a.id || projects.find((p) => p.id === t.project_id)?.area_id === a.id);
          if (list.length) groups.push({ key: a.id, title: a.name, tasks: list, defaults: { area_id: a.id } });
        });
      const orphan = open.filter((t) => !groups.some((g) => g.tasks.includes(t)));
      if (orphan.length) groups.push({ key: 'other', title: 'Other', tasks: orphan });
      return groups.length ? groups : [{ key: 'empty', title: '', tasks: [] }];
    }

    case 'area': {
      const areaProjects = projects.filter((p) => p.area_id === v.id && !p.archived);
      const groups: Group[] = [];
      const loose = open.filter((t) => t.area_id === v.id && !t.project_id);
      if (loose.length || !areaProjects.length) groups.push({ key: 'loose', title: '', tasks: loose, defaults: { area_id: v.id } });
      areaProjects.forEach((p) =>
        groups.push({
          key: p.id,
          title: p.name,
          tasks: open.filter((t) => t.project_id === p.id),
          defaults: { area_id: v.id, project_id: p.id },
          alwaysShow: true,
        }),
      );
      return groups;
    }

    case 'project':
      return [{ key: v.id, title: '', tasks: open.filter((t) => t.project_id === v.id), defaults: viewDefaults(v, projects) }];

    case 'completed':
      return [
        {
          key: 'done',
          title: '',
          tasks: tasks.filter((t) => t.status === 'done').sort((a, b) => b.completed_at.localeCompare(a.completed_at)),
        },
      ];
  }
}

const byDate = (a: Task, b: Task) => a.due_date.localeCompare(b.due_date) || a.sort_order - b.sort_order;

export function searchTasks(q: string, tasks: Task[], projects: Project[], areas: Area[]): Task[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const pName = new Map(projects.map((p) => [p.id, p.name.toLowerCase()]));
  const aName = new Map(areas.map((a) => [a.id, a.name.toLowerCase()]));
  return tasks
    .filter(
      (t) =>
        t.title.toLowerCase().includes(needle) ||
        t.notes.toLowerCase().includes(needle) ||
        (pName.get(t.project_id) || '').includes(needle) ||
        (aName.get(t.area_id) || '').includes(needle) ||
        t.subtasks.some((s) => s.title.toLowerCase().includes(needle)),
    )
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1))
    .slice(0, 50);
}
