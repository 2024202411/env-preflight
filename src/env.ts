import { type Entry, type Issue, validKey } from './model.js';

/** Parse a strict dotenv subset, retaining presence/emptiness but never values. */
export function parseEnv(text: string, file: string): { entries: Map<string, Entry>; issues: Issue[] } {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const entries = new Map<string, Entry>();
  const issues: Issue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = i + 1;
    const raw = lines[i]!.trimStart();
    if (!raw || raw.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(raw);
    if (!match || !validKey(match[1]!)) {
      issues.push({ code: 'INVALID_ENV', severity: 'error', file, line });
      continue;
    }
    const key = match[1]!;
    let value = match[2]!;
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]!;
      let content = value.slice(1);
      let closing = content.indexOf(quote);
      while (closing < 0 && i + 1 < lines.length) {
        content += '\n' + lines[++i]!;
        closing = content.indexOf(quote);
      }
      const tail = closing >= 0 ? content.slice(closing + 1).trim() : '';
      if (closing < 0 || (tail && !tail.startsWith('#'))) {
        issues.push({ code: 'INVALID_ENV', severity: 'error', file, line, key });
        continue;
      }
      value = content.slice(0, closing);
    } else {
      value = value.split('#', 1)[0]!.trim();
    }
    if (entries.has(key)) issues.push({ code: 'DUPLICATE_KEY', severity: 'error', file, line, key });
    entries.set(key, { line, empty: value.trim().length === 0 });
  }
  return { entries, issues };
}
