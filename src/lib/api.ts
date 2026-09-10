import type { Area, Project, Task } from '../types';

const URL_KEY = 'tasks.apiUrl';
const TOKEN_KEY = 'tasks.token';

export function getConfig(): { url: string; token: string } {
  let url = '';
  let token = '';
  try {
    url = (import.meta.env.VITE_API_URL as string | undefined) || localStorage.getItem(URL_KEY) || '';
    token = localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    /* storage unavailable */
  }
  return { url, token };
}

export function saveConfig(url: string, token: string) {
  try {
    localStorage.setItem(URL_KEY, url.trim());
    localStorage.setItem(TOKEN_KEY, token.trim());
  } catch {
    /* ignore */
  }
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export function hasEnvUrl(): boolean {
  return Boolean(import.meta.env.VITE_API_URL);
}

export class ApiError extends Error {
  constructor(
    public code: string,
    public data?: unknown,
  ) {
    super(code);
  }
}

export interface Bootstrap {
  tasks: Task[];
  projects: Project[];
  areas: Area[];
  serverTime: string;
}

/**
 * One request to the Apps Script web app. Body is text/plain so the browser
 * sends a "simple" CORS request with no preflight (Apps Script can't answer
 * OPTIONS). Throws ApiError('network') on connectivity problems.
 */
export async function call<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
  const { url, token } = getConfig();
  if (!url || !token) throw new ApiError('unconfigured');
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ token, action, payload }),
      redirect: 'follow',
    });
  } catch {
    throw new ApiError('network');
  }
  if (!res.ok) throw new ApiError('network');
  let json: { ok: boolean; data?: unknown; error?: string };
  try {
    json = await res.json();
  } catch {
    throw new ApiError('bad_response');
  }
  if (!json.ok) throw new ApiError(json.error || 'server_error', json.data);
  return json.data as T;
}

export const api = {
  bootstrap: () => call<Bootstrap>('bootstrap'),
  createTask: (task: Task) => call<{ task: Task }>('createTask', { task }),
  updateTask: (id: string, changes: Partial<Task>, baseUpdatedAt: string) =>
    call<{ task: Task }>('updateTask', { id, changes, baseUpdatedAt }),
  completeTask: (id: string, nextId: string) => call<{ task: Task; next?: Task }>('completeTask', { id, nextId }),
  restoreTask: (id: string) => call<{ task: Task }>('restoreTask', { id }),
  deleteTask: (id: string) => call<{ id: string }>('deleteTask', { id }),
  reorderTasks: (orders: { id: string; sort_order: number }[]) => call<{ count: number }>('reorderTasks', { orders }),
  upsertAreas: (areas: Area[]) => call<{ areas: Area[] }>('upsertAreas', { areas }),
  upsertProjects: (projects: Project[]) => call<{ projects: Project[] }>('upsertProjects', { projects }),
};
