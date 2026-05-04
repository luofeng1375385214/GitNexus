import { SupportedLanguages } from 'gitnexus-shared';
import type { ClassExtractionConfig } from '../../class-types.js';

export const actionscriptClassConfig: ClassExtractionConfig = {
  language: SupportedLanguages.ActionScript,
  typeDeclarationNodes: ['class_declaration', 'interface_declaration'],
  fileScopeNodeTypes: ['package_declaration'],
  ancestorScopeNodeTypes: ['class_declaration', 'interface_declaration'],
};
