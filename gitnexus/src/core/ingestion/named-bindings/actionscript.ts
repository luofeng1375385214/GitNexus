import { findChild, type SyntaxNode } from '../utils/ast-helpers.js';
import type { NamedBinding } from './types.js';

export function extractActionScriptNamedBindings(
  importNode: SyntaxNode,
): NamedBinding[] | undefined {
  if (importNode.type !== 'import_statement') return undefined;

  // Skip wildcard imports
  for (let i = 0; i < importNode.childCount; i++) {
    const child = importNode.child(i);
    if (child?.type === 'asterisk') return undefined;
  }

  const scopedId = findChild(importNode, 'scoped_identifier');
  if (!scopedId) {
    // Simple import: import SomeClass;
    const ident = findChild(importNode, 'identifier');
    if (ident) {
      return [{ local: ident.text, exported: ident.text }];
    }
    return undefined;
  }

  const fullText = scopedId.text;
  const lastDot = fullText.lastIndexOf('.');
  if (lastDot === -1) return undefined;

  const name = fullText.slice(lastDot + 1);
  // Skip lowercase — package imports
  if (name[0] && name[0] === name[0].toLowerCase()) return undefined;

  return [{ local: name, exported: name }];
}
