import { useState } from 'react';
import { getConfig, hasEnvUrl, saveConfig } from '../lib/api';

interface Props {
  error?: string | null;
  onDone: () => void;
}

/** Shown once per device: asks for the access token (and the API URL if it wasn't baked into the build). */
export default function Setup({ error, onDone }: Props) {
  const cfg = getConfig();
  const [url, setUrl] = useState(cfg.url);
  const [token, setToken] = useState('');
  const needUrl = !hasEnvUrl();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim() || (needUrl && !url.trim())) return;
    saveConfig(url, token);
    onDone();
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-stone-50 px-6">
      <form onSubmit={submit} className="fade-in w-full max-w-sm">
        <h1 className="text-[22px] font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 text-[14px] text-stone-500">
          {error === 'unauthorized' ? 'That token was rejected. Paste the current one from your Apps Script.' : 'Paste your access token once. It stays on this device.'}
        </p>
        <div className="mt-6 space-y-3">
          {needUrl && (
            <label className="block">
              <span className="text-[12.5px] text-stone-500">Apps Script URL</span>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" className={cls} autoCapitalize="off" autoCorrect="off" />
            </label>
          )}
          <label className="block">
            <span className="text-[12.5px] text-stone-500">Access token</span>
            <input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="••••••••" className={cls} autoFocus autoCapitalize="off" autoCorrect="off" />
          </label>
        </div>
        <button type="submit" className="mt-5 w-full rounded-lg bg-stone-900 py-2.5 text-[14px] font-medium text-white transition hover:bg-stone-800">
          Open my tasks
        </button>
      </form>
    </div>
  );
}

const cls = 'focus-ring mt-1 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[14px] shadow-sm';
