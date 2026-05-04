/**
 * ActionScript standalone regex processor.
 *
 * Parses .as files using regex to extract classes, interfaces, functions,
 * imports, variables, and heritage (extends/implements).
 *
 * Used in pipeline Phase 2.6 when parseStrategy is 'standalone'.
 */

/** Regex patterns for ActionScript 3.0 constructs */
const RE = {
  package: /^\s*package\s+([\w.]+)\s*\{?/m,
  class:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*(static)?\s*(dynamic|final)?\s*class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w.,\s]+))?/g,
  interface:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*interface\s+(\w+)(?:\s+extends\s+([\w.,\s]+))?/g,
  import: /^\s*import\s+([\w.]+(?:\.\*)?)\s*;/gm,
  function:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*(static)?\s*(override)?\s*(final)?\s*function\s+(?:get\s+|set\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*(\w+))?/g,
  variable:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*(static)?\s*(const|var)\s+(\w+)\s*(?::\s*(\w+))?/g,
  annotation: /\[(\w+(?:\([^)]*\))?)\]/g,
  call: /(\w+(?:\.\w+)*)\s*\(/g,
  newExpr: /new\s+(\w+)/g,
};

export interface AS3ParseResult {
  packageName: string | null;
  classes: Array<{
    name: string;
    visibility: string;
    extends: string | null;
    implements: string[];
    isStatic: boolean;
    isDynamic: boolean;
    isFinal: boolean;
  }>;
  interfaces: Array<{
    name: string;
    visibility: string;
    extends: string[];
  }>;
  imports: string[];
  functions: Array<{
    name: string;
    visibility: string;
    isStatic: boolean;
    isOverride: boolean;
    isFinal: boolean;
    parameters: string;
    returnType: string | null;
  }>;
  variables: Array<{
    name: string;
    visibility: string;
    isStatic: boolean;
    kind: 'var' | 'const';
    type: string | null;
  }>;
}

export function parseActionScript(source: string): AS3ParseResult {
  const result: AS3ParseResult = {
    packageName: null,
    classes: [],
    interfaces: [],
    imports: [],
    functions: [],
    variables: [],
  };

  // Package
  const pkgMatch = RE.package.exec(source);
  if (pkgMatch) result.packageName = pkgMatch[1];

  // Imports
  let m: RegExpExecArray | null;
  RE.import.lastIndex = 0;
  while ((m = RE.import.exec(source)) !== null) {
    result.imports.push(m[1]);
  }

  // Classes
  RE.class.lastIndex = 0;
  while ((m = RE.class.exec(source)) !== null) {
    result.classes.push({
      name: m[4],
      visibility: m[1] || 'internal',
      extends: m[5] || null,
      implements: m[6] ? m[6].split(',').map((s) => s.trim()) : [],
      isStatic: m[2] === 'static',
      isDynamic: m[3] === 'dynamic',
      isFinal: m[3] === 'final',
    });
  }

  // Interfaces
  RE.interface.lastIndex = 0;
  while ((m = RE.interface.exec(source)) !== null) {
    result.interfaces.push({
      name: m[2],
      visibility: m[1] || 'internal',
      extends: m[3] ? m[3].split(',').map((s) => s.trim()) : [],
    });
  }

  // Functions
  RE.function.lastIndex = 0;
  while ((m = RE.function.exec(source)) !== null) {
    result.functions.push({
      name: m[5],
      visibility: m[1] || 'internal',
      isStatic: m[2] === 'static',
      isOverride: m[3] === 'override',
      isFinal: m[4] === 'final',
      parameters: m[6],
      returnType: m[7] || null,
    });
  }

  // Variables
  RE.variable.lastIndex = 0;
  while ((m = RE.variable.exec(source)) !== null) {
    result.variables.push({
      name: m[4],
      visibility: m[1] || 'internal',
      isStatic: m[2] === 'static',
      kind: m[3] as 'var' | 'const',
      type: m[5] || null,
    });
  }

  return result;
}
