/**
 * The viewer's own last 3 roasts, kept in the browser (localStorage) only.
 * Per-user and client-side — never server state, no tracking, no PII beyond the
 * domain they themselves roasted. Every access is guarded so private mode,
 * disabled storage, a full quota or malformed data degrade to "empty" and
 * never throw.
 */
export type RecentEntry = {
  id: string;
  displayUrl: string;
  score: number;
  createdAt: number;
  favicon?: string;
};

const KEY = 'roast:recent:v1';
const MAX = 3;

function store(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null; // access itself can throw in some privacy modes
  }
}

function clean(e: unknown): RecentEntry | null {
  const v = e as Partial<RecentEntry> | undefined;
  if (
    !v ||
    typeof v.id !== 'string' ||
    !/^[A-Za-z0-9_-]{12}$/.test(v.id) ||
    typeof v.displayUrl !== 'string' ||
    typeof v.score !== 'number' ||
    typeof v.createdAt !== 'number'
  ) {
    return null;
  }
  const out: RecentEntry = {
    id: v.id,
    displayUrl: v.displayUrl,
    score: v.score,
    createdAt: v.createdAt,
  };
  if (typeof v.favicon === 'string' && v.favicon) out.favicon = v.favicon;
  return out;
}

/** The viewer's recent roasts, newest first, at most 3. Never throws. */
export function getRecent(): RecentEntry[] {
  const s = store();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(clean).filter((e): e is RecentEntry => e !== null).slice(0, MAX);
  } catch {
    return [];
  }
}

/** Prepend an entry (dedupe by id, move to front), cap at 3. Returns the new list. */
export function pushRecent(entry: RecentEntry): RecentEntry[] {
  const c = clean(entry);
  if (!c) return getRecent();
  const s = store();
  if (!s) return [c];
  try {
    const next = [c, ...getRecent().filter((e) => e.id !== c.id)].slice(0, MAX);
    s.setItem(KEY, JSON.stringify(next));
    return next;
  } catch {
    // Storage full / blocked: the roast still works, history just won't persist.
    return getRecent();
  }
}
