export type Unit = 'days' | 'weeks' | 'months';
export interface Recurrence {
  n: number;
  unit: Unit;
}

export function parseRecurrence(r: string): Recurrence | null {
  if (!r) return null;
  if (r === 'daily') return { n: 1, unit: 'days' };
  if (r === 'weekly') return { n: 1, unit: 'weeks' };
  if (r === 'monthly') return { n: 1, unit: 'months' };
  const m = /^every:(\d+):(days|weeks|months)$/.exec(r);
  if (!m) return null;
  return { n: Math.max(1, parseInt(m[1], 10)), unit: m[2] as Unit };
}

export function serializeRecurrence(rec: Recurrence | null): string {
  if (!rec) return '';
  if (rec.n === 1) return rec.unit === 'days' ? 'daily' : rec.unit === 'weeks' ? 'weekly' : 'monthly';
  return `every:${rec.n}:${rec.unit}`;
}

export function describeRecurrence(r: string): string {
  const rec = parseRecurrence(r);
  if (!rec) return '';
  if (rec.n === 1) return rec.unit === 'days' ? 'Daily' : rec.unit === 'weeks' ? 'Weekly' : 'Monthly';
  const unit = rec.unit.slice(0, -1);
  return `Every ${rec.n} ${unit}s`;
}
