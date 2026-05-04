import type { SyntaxNode } from '../utils/ast-helpers.js';
import { extractSimpleTypeName } from './shared.js';

const AS3_DECLARATION_NODE_TYPES: ReadonlySet<string> = new Set([
  'variable_declaration',
  'constant_declaration',
]);

export const actionscriptTypeConfig = {
  declarationNodeTypes: AS3_DECLARATION_NODE_TYPES,
  extractDeclaration: (node: SyntaxNode, env: Map<string, string>): void => {
    const nameNode = node.childForFieldName('name');
    const typeHint = node.childForFieldName('type_hint');
    if (!nameNode || !typeHint) return;

    const typeName = extractSimpleTypeName(typeHint);
    const varName = nameNode.text;
    if (varName && typeName) env.set(varName, typeName);
  },
  extractParameter: (node: SyntaxNode, env: Map<string, string>): void => {
    const nameNode = node.childForFieldName('name') ?? node.firstChild;
    const typeHint = node.childForFieldName('type_hint');
    if (!nameNode || !typeHint) return;

    const typeName = extractSimpleTypeName(typeHint);
    const varName = nameNode.text;
    if (varName && typeName) env.set(varName, typeName);
  },
};
