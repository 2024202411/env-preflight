export type Code =
  | 'MISSING_EXAMPLE' | 'MISSING_ENV' | 'EMPTY_ENV' | 'DUPLICATE_KEY'
  | 'INVALID_ENV' | 'DYNAMIC_ACCESS' | 'ENV_OBJECT_USAGE' | 'UNSUPPORTED_KEY'
  | 'SOURCE_PARSE' | 'IO_ERROR' | 'NO_SOURCE' | 'SYMLINK_SKIPPED';

export interface Location { file: string; line?: number; column?: number }
export interface Issue extends Location {
  code: Code;
  severity: 'error' | 'warning';
  key?: string;
}
export interface Entry { line: number; empty: boolean }
export interface Reference extends Location { key: string }
export interface Report {
  schemaVersion: 1;
  ok: boolean;
  exitCode: 0 | 1 | 2;
  summary: { filesScanned: number; variables: number; errors: number; warnings: number };
  issues: Issue[];
}

export const validKey = (key: string): boolean => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
