/**
 * ActionScript standalone regex processor.
 *
 * Parses .as files using regex to extract classes, interfaces, functions,
 * imports, variables, calls, field accesses, and heritage (extends/implements).
 *
 * Uses lightweight brace-balancing for scope tracking to associate methods
 * and properties with their owning class.
 */

/** Regex patterns for ActionScript 3.0 constructs */
const RE = {
  package: /^\s*package\s+([\w.]+)\s*\{?/m,
  class:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*(static)?\s*(dynamic|final)?\s*class\s+(\w+)(?:\s+extends\s+([\w.]+))?(?:\s+implements\s+([\w.,\s]+))?/,
  interface:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*interface\s+(\w+)(?:\s+extends\s+([\w.,\s]+))?/,
  import: /^\s*import\s+([\w.]+(?:\.\*)?)\s*;/gm,
  function:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*(static)?\s*(override)?\s*(final)?\s*function\s+(?:get\s+|set\s+)?(\w+)\s*\(([^)]*)\)\s*(?::\s*([\w.<>.*]+))?/,
  variable:
    /(?:^|\n)\s*(public|private|protected|internal)?\s*(static)?\s*(const|var)\s+(\w+)\s*(?::\s*([\w.<>.*]+))?/,
  annotation: /\[(\w+(?:\([^)]*\))?)\]/g,
  call: /(\w+(?:\.\w+)*)\s*\(/g,
  newExpr: /new\s+([\w.]+)\s*\(/g,
  fieldAccess: /(\w+)\.(\w+)/g,
};

/** AS3 keywords/control structures to exclude from call extraction */
const AS_BUILTIN_NAMES = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'try',
  'catch',
  'finally',
  'throw',
  'return',
  'break',
  'continue',
  'with',
  'typeof',
  'instanceof',
  'delete',
  'in',
  'as',
  'is',
  'super',
  'this',
  'true',
  'false',
  'null',
  'undefined',
  'trace',
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
  'encodeURI',
  'decodeURI',
  'encodeURIComponent',
  'decodeURIComponent',
  'void',
]);

/** Top-level receiver names that are Flash/AIR runtime, not project code */
const AS_BUILTIN_RECEIVERS = new Set([
  'Math',
  'String',
  'Number',
  'int',
  'uint',
  'Boolean',
  'Array',
  'Object',
  'Date',
  'RegExp',
  'Error',
  'Vector',
  'Class',
  'flash',
  'mx',
  'spark',
  'fl',
  'JSON',
  'trace',
  'describeType',
  'getDefinitionByName',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'navigator',
  'externalInterface',
  'ExternalInterface',
  'stage',
  'root',
  'parent',
  'loaderInfo',
  'Mouse',
  'Keyboard',
  'Sound',
  'Timer',
  'URLRequest',
  'URLLoader',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'ByteArray',
  'Sprite',
  'MovieClip',
  'DisplayObject',
  'DisplayObjectContainer',
  'TextField',
  'Graphics',
  'Point',
  'Rectangle',
]);

export interface AS3Class {
  name: string;
  visibility: string;
  extends: string | null;
  implements: string[];
  isStatic: boolean;
  isDynamic: boolean;
  isFinal: boolean;
  /** 0-based line number of the class declaration */
  line: number;
}

export interface AS3Interface {
  name: string;
  visibility: string;
  extends: string[];
  line: number;
}

export interface AS3Function {
  name: string;
  visibility: string;
  isStatic: boolean;
  isOverride: boolean;
  isFinal: boolean;
  parameters: string;
  returnType: string | null;
  /** Class name this function belongs to, null if top-level */
  ownerClass: string | null;
  /** Accessor type: null for regular function, 'get' or 'set' for accessor */
  accessor: string | null;
  line: number;
}

export interface AS3Variable {
  name: string;
  visibility: string;
  isStatic: boolean;
  kind: 'var' | 'const';
  type: string | null;
  ownerClass: string | null;
  line: number;
}

export interface AS3Call {
  /** Full callee expression, e.g. "obj.method" or "func" */
  callee: string;
  /** Receiver part (before the dot), null if no dot */
  receiver: string | null;
  /** Simple method/function name (after the last dot) */
  calleeName: string;
  /** Whether this is a `new` expression */
  isNew: boolean;
  /** Class the calling function belongs to */
  ownerClass: string | null;
  /** Function the call appears in */
  ownerFunction: string | null;
  line: number;
}

export interface AS3FieldAccess {
  /** Receiver object name */
  receiver: string;
  /** Field/property name */
  field: string;
  /** Whether this is a write access (field appears on LHS of assignment) */
  isWrite: boolean;
  ownerClass: string | null;
  ownerFunction: string | null;
  line: number;
}

export interface AS3ParseResult {
  packageName: string | null;
  classes: AS3Class[];
  interfaces: AS3Interface[];
  imports: string[];
  functions: AS3Function[];
  variables: AS3Variable[];
  calls: AS3Call[];
  fieldAccesses: AS3FieldAccess[];
}

/**
 * Find the position immediately after the first match of a regex in source.
 * Returns -1 if not found.
 */
function matchEndPos(source: string, re: RegExp): number {
  const m = re.exec(source);
  return m ? m.index + m[0].length : -1;
}

/**
 * Lightweight scope tracker — uses brace depth to associate functions/variables
 * with their owning class. AS3 only allows one top-level class per file (with
 * possible file-level functions/variables), so this approach covers 95%+ cases.
 */
interface ScopeFrame {
  type: 'class' | 'interface';
  name: string;
  braceDepth: number;
}

export function parseActionScript(source: string): AS3ParseResult {
  const result: AS3ParseResult = {
    packageName: null,
    classes: [],
    interfaces: [],
    imports: [],
    functions: [],
    variables: [],
    calls: [],
    fieldAccesses: [],
  };

  const lines = source.split('\n');

  // Pass 1: Package and imports (file-level)
  const pkgMatch = RE.package.exec(source);
  if (pkgMatch) result.packageName = pkgMatch[1];

  let m: RegExpExecArray | null;
  RE.import.lastIndex = 0;
  while ((m = RE.import.exec(source)) !== null) {
    result.imports.push(m[1]);
  }

  // Pass 2: Find class and interface declaration positions
  const classPositions: Array<{ name: string; startLine: number; endLine: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Class detection
    RE.class.lastIndex = 0;
    const clsMatch = RE.class.exec(line);
    if (clsMatch) {
      const className = clsMatch[4];
      const endLine = findClosingBraceLine(lines, i);
      classPositions.push({ name: className, startLine: i, endLine });
      result.classes.push({
        name: className,
        visibility: clsMatch[1] || 'internal',
        extends: clsMatch[5] || null,
        implements: clsMatch[6] ? clsMatch[6].split(',').map((s) => s.trim()) : [],
        isStatic: clsMatch[2] === 'static',
        isDynamic: clsMatch[3] === 'dynamic',
        isFinal: clsMatch[3] === 'final',
        line: i,
      });
      continue;
    }

    // Interface detection
    RE.interface.lastIndex = 0;
    const ifaceMatch = RE.interface.exec(line);
    if (ifaceMatch) {
      const ifaceName = ifaceMatch[2];
      const endLine = findClosingBraceLine(lines, i);
      classPositions.push({ name: ifaceName, startLine: i, endLine });
      result.interfaces.push({
        name: ifaceName,
        visibility: ifaceMatch[1] || 'internal',
        extends: ifaceMatch[3] ? ifaceMatch[3].split(',').map((s) => s.trim()) : [],
        line: i,
      });
    }
  }

  // Helper: determine which class a line belongs to
  const getOwnerClass = (lineNum: number): string | null => {
    for (const cp of classPositions) {
      if (lineNum >= cp.startLine && lineNum <= cp.endLine) {
        return cp.name;
      }
    }
    return null;
  };

  // Pass 3: Functions, variables, calls, and field accesses (line-by-line)
  let currentFunction: string | null = null;
  let currentFunctionClass: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ownerClass = getOwnerClass(i);

    // Function detection
    RE.function.lastIndex = 0;
    const fnMatch = RE.function.exec(line);
    if (fnMatch) {
      const fnName = fnMatch[5];
      const isGetter = line.includes('function get ');
      const isSetter = line.includes('function set ');
      result.functions.push({
        name: fnName,
        visibility: fnMatch[1] || 'internal',
        isStatic: fnMatch[2] === 'static',
        isOverride: fnMatch[3] === 'override',
        isFinal: fnMatch[4] === 'final',
        parameters: fnMatch[6],
        returnType: fnMatch[7] || null,
        ownerClass,
        accessor: isGetter ? 'get' : isSetter ? 'set' : null,
        line: i,
      });
      currentFunction = fnName;
      currentFunctionClass = ownerClass;
    }

    // Variable detection
    RE.variable.lastIndex = 0;
    const varMatch = RE.variable.exec(line);
    if (varMatch) {
      result.variables.push({
        name: varMatch[4],
        visibility: varMatch[1] || 'internal',
        isStatic: varMatch[2] === 'static',
        kind: varMatch[3] as 'var' | 'const',
        type: varMatch[5] || null,
        ownerClass,
        line: i,
      });
    }

    // Call extraction (skip function declarations and control structures)
    if (!fnMatch) {
      RE.call.lastIndex = 0;
      while ((m = RE.call.exec(line)) !== null) {
        const callee = m[1];
        const parts = callee.split('.');
        const calleeName = parts[parts.length - 1];

        // Skip keywords and builtins
        if (AS_BUILTIN_NAMES.has(calleeName)) continue;
        if (AS_BUILTIN_NAMES.has(parts[0])) continue;
        // Skip function declarations caught by the function regex
        if (calleeName === 'function') continue;
        // Skip type casts like `SomeType(value)`
        if (parts.length === 1 && /^[A-Z]/.test(calleeName) && !callee.includes('.')) {
          // Could be a constructor call without `new` — include it with low confidence
        }

        result.calls.push({
          callee,
          receiver: parts.length > 1 ? parts.slice(0, -1).join('.') : null,
          calleeName,
          isNew: false,
          ownerClass: currentFunctionClass,
          ownerFunction: currentFunction,
          line: i,
        });
      }

      // new expressions
      RE.newExpr.lastIndex = 0;
      while ((m = RE.newExpr.exec(line)) !== null) {
        const className = m[1];
        if (AS_BUILTIN_NAMES.has(className)) continue;
        result.calls.push({
          callee: className,
          receiver: null,
          calleeName: className,
          isNew: true,
          ownerClass: currentFunctionClass,
          ownerFunction: currentFunction,
          line: i,
        });
      }

      // Field access extraction
      RE.fieldAccess.lastIndex = 0;
      while ((m = RE.fieldAccess.exec(line)) !== null) {
        const receiver = m[1];
        const field = m[2];

        // Skip keywords, builtins, and calls (handled above)
        if (AS_BUILTIN_NAMES.has(receiver) || AS_BUILTIN_RECEIVERS.has(receiver)) continue;
        if (AS_BUILTIN_NAMES.has(field)) continue;
        // Skip method calls (they have `(` after) — already handled by call regex
        const afterMatch = line.substring(m.index + m[0].length);
        if (/^\s*\(/.test(afterMatch)) continue;

        // Detect write: `receiver.field =` or `receiver.field+=` etc
        const isWrite = /^\s*[=+\-*/%|&^]?=/.test(afterMatch) && !/^\s*==/.test(afterMatch);

        result.fieldAccesses.push({
          receiver,
          field,
          isWrite,
          ownerClass: currentFunctionClass,
          ownerFunction: currentFunction,
          line: i,
        });
      }
    }

    // Reset currentFunction tracking when we leave a function body
    // (simple heuristic: closing brace at class-level depth resets)
    if (currentFunction && line.trim() === '}' && ownerClass !== currentFunctionClass) {
      currentFunction = null;
      currentFunctionClass = null;
    }
  }

  return result;
}

/**
 * Find the line number of the closing brace that matches the opening brace
 * on or after the given start line. Uses brace depth counting.
 */
function findClosingBraceLine(lines: string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;

  for (let i = startLine; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (ch === '{') {
        depth++;
        foundOpen = true;
      } else if (ch === '}') {
        depth--;
        if (foundOpen && depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}
