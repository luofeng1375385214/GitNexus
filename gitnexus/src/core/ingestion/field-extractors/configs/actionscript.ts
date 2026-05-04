import { SupportedLanguages } from 'gitnexus-shared';
import type { FieldExtractionConfig } from '../generic.js';
import type { FieldVisibility } from '../../field-types.js';

const AS3_VIS = new Set<FieldVisibility>(['public', 'private', 'protected', 'internal']);

export const actionscriptFieldConfig: FieldExtractionConfig = {
  language: SupportedLanguages.ActionScript,
  typeDeclarationNodes: ['class_declaration', 'interface_declaration'],
  fieldNodeTypes: ['variable_declaration', 'constant_declaration'],
  bodyNodeTypes: ['class_body', 'interface_body'],
  defaultVisibility: 'internal',

  extractName(node) {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text;
  },

  extractType(node) {
    const typeHint = node.childForFieldName('type_hint');
    if (typeHint) return typeHint.text?.replace(/^:\s*/, '');
    return undefined;
  },

  extractVisibility(node) {
    // AS3 uses property_attribut siblings for visibility
    let sibling = node.previousNamedSibling;
    while (sibling) {
      if (sibling.type === 'property_attribut') {
        const text = sibling.text;
        for (const vis of AS3_VIS) {
          if (text === vis) return vis;
        }
      }
      sibling = sibling.previousNamedSibling;
    }
    return 'internal';
  },

  isStatic(node) {
    let sibling = node.previousNamedSibling;
    while (sibling) {
      if (sibling.type === 'property_attribut' && sibling.text === 'static') return true;
      sibling = sibling.previousNamedSibling;
    }
    return false;
  },

  isReadonly(node) {
    return node.type === 'constant_declaration';
  },
};
