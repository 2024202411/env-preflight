import ts from 'typescript';
import { type Issue, type Reference, validKey } from './model.js';

const unwrap = (node: ts.Expression): ts.Expression => {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
};

const member = (node: ts.Node): { object: ts.Expression; key?: string } | undefined => {
  if (ts.isPropertyAccessExpression(node)) return { object: unwrap(node.expression), key: node.name.text };
  if (ts.isElementAccessExpression(node)) {
    const arg = node.argumentExpression && unwrap(node.argumentExpression);
    return { object: unwrap(node.expression), key: arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : undefined };
  }
  return undefined;
};

export function scanSource(text: string, file: string): { references: Reference[]; issues: Issue[] } {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const references: Reference[] = [];
  const issues: Issue[] = [];
  const diagnostics = (source as ts.SourceFile & { parseDiagnostics: readonly ts.DiagnosticWithLocation[] }).parseDiagnostics;
  for (const diagnostic of diagnostics) {
    const loc = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    // Compiler messages can contain source literals: output only a stable code and location.
    issues.push({ code: 'SOURCE_PARSE', severity: 'error', file, line: loc.line + 1, column: loc.character + 1 });
  }
  if (diagnostics.length) return { references, issues };
  // Bind names within this file only. Never resolve imports or load project configuration.
  const program = ts.createProgram([file], { noLib: true, noResolve: true, allowJs: true, target: ts.ScriptTarget.Latest }, {
    getSourceFile: name => name === file ? source : undefined,
    getDefaultLibFileName: () => 'lib.d.ts', writeFile: () => {},
    getCurrentDirectory: () => '', getDirectories: () => [],
    fileExists: name => name === file, readFile: name => name === file ? text : undefined,
    getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true, getNewLine: () => '\n'
  });
  const checker = program.getTypeChecker();
  const fromNodeProcess = (node: ts.Node): boolean => {
    for (let parent: ts.Node | undefined = node; parent; parent = parent.parent) {
      if (ts.isImportDeclaration(parent)) return ts.isStringLiteral(parent.moduleSpecifier)
        && ['process', 'node:process'].includes(parent.moduleSpecifier.text);
    }
    return false;
  };
  const isProcess = (node: ts.Node): boolean => {
    if (!ts.isIdentifier(node)) return false;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol) return node.text === 'process';
    return !!symbol.declarations?.some(d => (ts.isImportClause(d) || ts.isNamespaceImport(d)) && fromNodeProcess(d));
  };
  const isEnvObject = (node: ts.Node): boolean => {
    const m = member(node);
    if (m && m.key === 'env' && isProcess(m.object)) return true;
    if (!ts.isIdentifier(node)) return false;
    return !!checker.getSymbolAtLocation(node)?.declarations?.some(d => ts.isImportSpecifier(d)
      && (d.propertyName ?? d.name).text === 'env' && fromNodeProcess(d));
  };
  const location = (node: ts.Node) => {
    const pos = source.getLineAndCharacterOfPosition(node.getStart(source));
    return { file, line: pos.line + 1, column: pos.character + 1 };
  };
  const addKey = (key: string, node: ts.Node): void => {
    if (validKey(key)) references.push({ key, ...location(node) });
    else issues.push({ code: 'UNSUPPORTED_KEY', severity: 'warning', ...location(node) });
  };
  const visit = (node: ts.Node): void => {
    const m = member(node);
    if (m && isEnvObject(m.object)) {
      if (m.key === undefined) issues.push({ code: 'DYNAMIC_ACCESS', severity: 'warning', ...location(node) });
      else addKey(m.key, node);
    }
    if (isEnvObject(node) && !(ts.isIdentifier(node) && ts.isImportSpecifier(node.parent))) {
      let outer = node;
      while (outer.parent && (ts.isParenthesizedExpression(outer.parent) || ts.isAsExpression(outer.parent)
        || ts.isNonNullExpression(outer.parent) || ts.isTypeAssertionExpression(outer.parent)
        || ts.isSatisfiesExpression(outer.parent))) outer = outer.parent;
      const parent = outer.parent;
      const parentMember = parent && member(parent);
      if (!(parentMember && parentMember.object === node)) {
        if (parent && ts.isVariableDeclaration(parent) && parent.initializer === outer && ts.isObjectBindingPattern(parent.name)) {
          for (const entry of parent.name.elements) {
            const name = entry.propertyName ?? entry.name;
            if (!entry.dotDotDotToken && (ts.isIdentifier(name) || ts.isStringLiteral(name))) addKey(name.text, entry);
            else issues.push({ code: 'ENV_OBJECT_USAGE', severity: 'warning', ...location(entry) });
          }
        } else issues.push({ code: 'ENV_OBJECT_USAGE', severity: 'warning', ...location(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { references, issues };
}
