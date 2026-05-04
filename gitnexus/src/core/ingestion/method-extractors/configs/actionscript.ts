import { SupportedLanguages } from 'gitnexus-shared';
import type {
  MethodExtractionConfig,
  ParameterInfo,
  MethodVisibility,
} from '../../method-types.js';
import { extractSimpleTypeName } from '../../type-extractors/shared.js';

const AS3_VIS = new Set<MethodVisibility>(['public', 'private', 'protected', 'internal']);

export const actionscriptMethodConfig: MethodExtractionConfig = {
  language: SupportedLanguages.ActionScript,
  typeDeclarationNodes: ['class_declaration', 'interface_declaration'],
  methodNodeTypes: ['function_declaration'],
  bodyNodeTypes: ['class_body', 'interface_body'],

  extractName(node) {
    const nameNode = node.childForFieldName('name');
    return nameNode?.text;
  },

  extractReturnType(node) {
    const typeNode = node.childForFieldName('return_type');
    if (!typeNode) return undefined;
    const typeHint = typeNode.childForFieldName('type_hint');
    if (typeHint) return extractSimpleTypeName(typeHint) ?? typeHint.text?.trim();
    return undefined;
  },

  extractParameters(node): ParameterInfo[] {
    const params: ParameterInfo[] = [];
    const paramList = node.childForFieldName('parameters');
    if (!paramList) return params;

    for (let i = 0; i < paramList.namedChildCount; i++) {
      const param = paramList.namedChild(i);
      if (!param) continue;

      const nameNode = param.childForFieldName('name') ?? param.firstChild;
      const typeNode = param.childForFieldName('type_hint');

      if (nameNode) {
        params.push({
          name: nameNode.text,
          type: typeNode ? (extractSimpleTypeName(typeNode) ?? typeNode.text?.trim()) : null,
          rawType: typeNode?.text?.trim() ?? null,
          isOptional: false,
          isVariadic: false,
        });
      }
    }
    return params;
  },

  extractVisibility(node) {
    let sibling = node.previousNamedSibling;
    while (sibling) {
      if (sibling.type === 'property_attribut') {
        for (const vis of AS3_VIS) {
          if (sibling.text === vis) return vis;
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

  isAbstract(node) {
    const body = node.childForFieldName('body');
    return !body;
  },

  isFinal(node) {
    let sibling = node.previousNamedSibling;
    while (sibling) {
      if (sibling.type === 'property_attribut' && sibling.text === 'final') return true;
      sibling = sibling.previousNamedSibling;
    }
    return false;
  },

  extractAnnotations(node) {
    const annotations: string[] = [];
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child && child.type === 'annotation') {
        annotations.push(child.text);
      }
    }
    return annotations;
  },
};
