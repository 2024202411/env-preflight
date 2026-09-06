#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { checkProject } from './check.js';
import { type Code, type Report, validKey } from './model.js';

const help = `env-preflight — check environment configuration without printing values

Usage: env-preflight [options]

  --src PATH        Source file or directory (repeatable; default: src)
  --example PATH    Template dotenv file (default: .env.example)
  --env PATH        Actual dotenv file (default: .env)
  --example-only    Check source/template agreement without reading an actual env file
  --optional KEYS   Comma-separated keys allowed to be missing or empty (repeatable)
  --ignore KEYS     Comma-separated keys excluded from agreement checks (repeatable)
  --exclude PATH   Skip this path/subtree (repeatable; exact paths, not globs)
  --strict         Exit 1 on warnings as well as errors
  --json           Print a stable JSON report
  --lang en|zh     Human-readable report language (default: en)
  --help           Show this help
  --version        Show version

Exit codes: 0 = passed, 1 = findings, 2 = invalid input or incomplete scan.
Paths are relative to your current directory. No code is executed or uploaded.
中文说明：使用 --lang zh 输出中文检查结果；具体用法见 README.zh-CN.md。
`;

const messages: Record<'en' | 'zh', Record<Code, string>> = {
  en: {
    MISSING_EXAMPLE: 'Used in source but absent from the example file. Add it to the template.',
    MISSING_ENV: 'Required key is missing from the actual env file. Set it or mark it optional.',
    EMPTY_ENV: 'Required value is empty. Set it or mark it optional.',
    DUPLICATE_KEY: 'Duplicate key. Keep one definition.',
    INVALID_ENV: 'Malformed dotenv entry. Check the key, equals sign and quoting.',
    DYNAMIC_ACCESS: 'Computed environment key cannot be resolved. Review manually.',
    ENV_OBJECT_USAGE: 'Environment object alias/spread or unsupported access cannot be fully checked.',
    UNSUPPORTED_KEY: 'Source uses a key outside the supported dotenv identifier syntax.',
    SOURCE_PARSE: 'Source syntax could not be parsed. Review the file at this location.',
    IO_ERROR: 'Could not read this file or directory. Check the path and permissions.',
    NO_SOURCE: 'No supported source files found. Set --src to your application code.',
    SYMLINK_SKIPPED: 'Source symlink skipped. Pass the real path with --src if needed.'
  },
  zh: {
    MISSING_EXAMPLE: '代码使用了此变量，但示例配置未声明。请补充到示例文件。',
    MISSING_ENV: '实际配置缺少必填变量。请填写，或用 --optional 标记为可选。',
    EMPTY_ENV: '必填变量的值为空。请填写，或用 --optional 标记为可选。',
    DUPLICATE_KEY: '变量重复定义。请保留一处。',
    INVALID_ENV: '配置语法有误，请检查变量名、等号和引号。',
    DYNAMIC_ACCESS: '变量名由表达式计算，无法静态确定，请人工核对。',
    ENV_OBJECT_USAGE: '使用了环境对象别名、展开或其他未支持写法，无法完整检查。',
    UNSUPPORTED_KEY: '代码中的变量名不符合本工具支持的 dotenv 命名规则。',
    SOURCE_PARSE: '源码语法无法解析，请检查该文件对应位置。',
    IO_ERROR: '无法读取文件或目录，请检查路径和权限。',
    NO_SOURCE: '未找到支持的源文件，请用 --src 指定应用代码目录。',
    SYMLINK_SKIPPED: '已跳过源码符号链接；如需扫描，请用 --src 指定真实路径。'
  }
};

const safeText = (s: string) => s.replace(/[\x00-\x1f\x7f-\x9f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

export function formatReport(report: Report, lang: 'en' | 'zh'): string {
  const s = report.summary;
  const state = report.exitCode === 2 ? (lang === 'zh' ? '检查未完成' : 'INCOMPLETE')
    : report.ok ? (lang === 'zh' ? '检查通过' : 'PASS') : (lang === 'zh' ? '发现问题' : 'FAIL');
  const lines = [lang === 'zh'
    ? `env-preflight · ${state} · ${s.filesScanned} 个源文件 · ${s.variables} 个变量 · ${s.errors} 个错误 · ${s.warnings} 个提醒`
    : `env-preflight · ${state} · ${s.filesScanned} files · ${s.variables} variables · ${s.errors} errors · ${s.warnings} warnings`];
  for (const issue of report.issues) {
    const where = issue.file + (issue.line ? `:${issue.line}` : '') + (issue.column ? `:${issue.column}` : '');
    lines.push(`${issue.severity.toUpperCase()} ${issue.code} ${safeText(where)}${issue.key ? ` [${issue.key}]` : ''}\n  ${messages[lang][issue.code]}`);
  }
  return lines.join('\n') + '\n';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonRequested = args.includes('--json');
  try {
    const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
      src: { type: 'string', multiple: true }, example: { type: 'string' }, env: { type: 'string' },
      'example-only': { type: 'boolean' }, optional: { type: 'string', multiple: true },
      ignore: { type: 'string', multiple: true }, exclude: { type: 'string', multiple: true },
      strict: { type: 'boolean' }, json: { type: 'boolean' }, lang: { type: 'string', default: 'en' },
      help: { type: 'boolean' }, version: { type: 'boolean' }
    } });
    if (values.help) { process.stdout.write(help); return; }
    if (values.version) { process.stdout.write('0.1.0\n'); return; }
    if (values.lang !== 'en' && values.lang !== 'zh') throw new Error('usage');
    if (values['example-only'] && values.env !== undefined) throw new Error('usage');
    const keys = (list: string[] | undefined): string[] => (list ?? []).flatMap(s => s.split(',')).map(s => {
      const key = s.trim();
      if (!validKey(key)) throw new Error('usage');
      return key;
    });
    for (const value of [...(values.src ?? []), ...(values.exclude ?? []), ...(values.example !== undefined ? [values.example] : []), ...(values.env !== undefined ? [values.env] : [])]) {
      if (!value.trim()) throw new Error('usage');
    }
    const report = await checkProject({ sources: values.src, example: values.example, env: values.env,
      exampleOnly: values['example-only'], optional: keys(values.optional), ignore: keys(values.ignore),
      exclude: values.exclude, strict: values.strict });
    process.stdout.write(values.json ? JSON.stringify(report, null, 2) + '\n' : formatReport(report, values.lang));
    process.exitCode = report.exitCode;
  } catch {
    // Do not print arbitrary exception messages: they may include input or configuration values.
    if (jsonRequested) process.stdout.write(JSON.stringify({ schemaVersion: 1, ok: false, exitCode: 2, error: 'CLI_ERROR' }) + '\n');
    else process.stderr.write('env-preflight: invalid arguments or unexpected failure. Run --help for usage.\n参数有误或检查异常，请运行 --help 查看用法。\n');
    process.exitCode = 2;
  }
}

await main();
