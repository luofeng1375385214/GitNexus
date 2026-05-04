/**
 * ActionScript language provider — standalone regex processor.
 *
 * AS3 grammar (tree-sitter-actionscript) generates ABI 15 which is
 * incompatible with the tree-sitter 0.21.x runtime (ABI 14). Using
 * standalone parsing avoids the native binding issue while still
 * extracting classes, functions, imports, and heritage.
 *
 * TODO: switch to tree-sitter once the grammar is regenerated for ABI 14
 * or the runtime is upgraded.
 */
import { SupportedLanguages } from 'gitnexus-shared';
import { defineLanguage } from '../language-provider.js';

export const actionscriptProvider = defineLanguage({
  id: SupportedLanguages.ActionScript,
  parseStrategy: 'standalone',
  extensions: ['.as'],
  entryPointPatterns: [],
  astFrameworkPatterns: [],
  treeSitterQueries: '',
  typeConfig: {
    declarationNodeTypes: new Set(),
    extractDeclaration: () => null,
    extractParameter: () => null,
  },
  exportChecker: () => false,
  importResolver: () => null,
});
