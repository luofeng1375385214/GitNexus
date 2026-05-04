import { SupportedLanguages } from 'gitnexus-shared';
import type { VariableExtractionConfig, VariableVisibility } from '../../variable-types.js';
import { extractSimpleTypeName } from '../../type-extractors/shared.js';

export const actionscriptVariableConfig: VariableExtractionConfig = {
  language: SupportedLanguages.ActionScript,
  constNodeTypes: ['constant_declaration'],
  staticNodeTypes: [],
  variableNodeTypes: ['variable_declaration'],

  extractName(node) {
    const nameNode = node.childForFieldName('name');
    return nameNode?.type === 'identifier' ? nameNode.text : undefined;
  },

  extractType(node) {
    const typeHint = node.childForFieldName('type_hint');
    if (typeHint) return extractSimpleTypeName(typeHint) ?? typeHint.text?.trim();
    return undefined;
  },

  extractVisibility(): VariableVisibility {
    return 'internal';
  },

  isConst(node) {
    return node.type === 'constant_declaration';
  },

  isStatic() {
    return false;
  },

  isMutable(node) {
    return node.type !== 'constant_declaration';
  },
};
