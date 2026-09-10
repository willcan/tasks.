# Tasks

A private, single-user task manager that lives at a URL. React + TypeScript + Tailwind on the front, a Google Sheet as the database, Google Apps Script as the API. No accounts, no backend to run, nothing to pay for.

```
Browser (static site on GitHub Pages)
   │  POST JSON  { token, action, payload }
   ▼
Google Apps Script web app  (checks token, takes a lock, reads/writes rows)
   │
   ▼
Google Sheet  ─ tabs: Tasks · Projects · Areas
```

## Setup (about 10 minutes, once)

### 1. The sheet + API

1. Create a new Google Sheet (any name).
2. **Extensions → Apps Script.** Delete the sample code, paste in `apps-script/Code.gs`, save.
3. Pick `setup` in the function dropdown and press **Run**. Approve the permissions (it only touches this spreadsheet). This creates the three tabs, seeds the default Areas, and prints your **access token** in the execution log — copy it somewhere safe.
4. **Deploy → New deployment → Web app.**
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then copy the web-app URL (`https://script.google.com/macros/s/…/exec`).

> "Anyone" only means the URL is reachable; every request is rejected unless it carries the token. Anyone with just the URL gets `{"ok":false,"error":"unauthorized"}`.

### 2. The site

1. Push this folder to a GitHub repo (e.g. `tasks`).
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Repo **Settings → Secrets and variables → Actions → Variables → New repository variable**: name `VITE_API_URL`, value = the web-app URL from step 1.4.
4. Push to `main` (or run the "Deploy to GitHub Pages" workflow). The site appears at `https://<you>.github.io/tasks/`.

### 3. First open on each device

Open the URL, paste the access token once. It's stored in that browser's local storage and never asked again.

## Security model

- The token lives in Apps Script's Script Properties (server side) and in your browsers' local storage. It is **not** in the repo or the built JS.
- Anyone who obtains the token can read and write the sheet, so treat it like a password. To rotate: run `rotateToken()` in the Apps Script editor, then re-enter the new token on each device (the app will prompt automatically when the old one is rejected).
- Because the API runs "as you", the sheet itself can stay private to your Google account.

## Day-to-day

| Action | How |
|---|---|
| New task | `+ New Task`, the `n` key, the floating `+` on mobile, or the `+` that appears on any group header |
| Search everything | `/` or `⌘K` |
| Open a task | click / tap it — editor opens beside the list (full-screen on phones) |
| Complete | click the circle — it disappears immediately with an Undo toast |
| Reorder | drag (long-press on touch) within a group |
| Areas / projects | `+` next to Areas; `⋯` on any area or project for rename / archive / new project; double-click to rename; drag areas to reorder |
| Completed tasks | sidebar → Completed; searchable, restorable, never deleted unless you delete them |

Recurring tasks: when you complete one, the next occurrence is created (stepping from its due date until it lands after today). The completed copy stays in history.

## Syncing

The sheet is the source of truth. Every change is saved immediately in the background; the pill in the sidebar shows Saving / Synced / Offline. If a request fails, it retries with backoff and the change is never dropped while the tab is open. The app re-fetches when you return to the tab. Edits carry the row's `updated_at`; if another device changed the same task in the meantime the server rejects the stale write and the app merges field-by-field and retries, so two devices editing different fields of one task both win.

## Sheet schema

**Tasks** — `id, title, notes, area_id, project_id, due_date (YYYY-MM-DD), due_time (HH:MM), priority (none|low|medium|high), status (open|done), subtasks (JSON), recurrence (daily|weekly|monthly|every:N:days|weeks|months), sort_order, created_at, completed_at, updated_at`

**Projects** — `id, name, area_id, sort_order, archived, created_at, updated_at`

**Areas** — `id, name, sort_order, archived, created_at, updated_at`

Columns are formatted as plain text so Sheets never reinterprets dates. You can edit the sheet by hand; the app picks it up on next load.

## Local development

```
npm install
npm run dev:api      # local stand-in that runs Code.gs against dev-server/data.json (token: dev-token)
VITE_API_URL=http://localhost:8787 npm run dev
```

## Files

```
apps-script/Code.gs      the entire backend
src/lib/api.ts           fetch wrapper + token storage
src/lib/store.ts         in-memory state, optimistic updates, write queue with retry + conflict merge
src/lib/views.ts         Today / Upcoming / Inbox / All grouping logic
src/components/          Sidebar, TaskList, TaskRow, TaskPanel, QuickAdd, SearchOverlay, Setup
dev-server/server.mjs    local Apps Script emulator (dev only)
```
