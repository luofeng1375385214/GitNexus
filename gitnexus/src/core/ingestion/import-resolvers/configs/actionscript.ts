import { SupportedLanguages } from 'gitnexus-shared';
import type { ImportResolutionConfig, ImportResolverStrategy } from '../types.js';
import { createStandardStrategy } from '../standard.js';
import { resolveJvmWildcard, resolveJvmMemberImport } from '../jvm.js';

const AS3_EXTENSIONS = ['.as'];

export const actionscriptJvmStrategy: ImportResolverStrategy = (rawImportPath, _filePath, ctx) => {
  if (rawImportPath.endsWith('.*')) {
    const matchedFiles = resolveJvmWildcard(
      rawImportPath,
      ctx.normalizedFileList,
      ctx.allFileList,
      AS3_EXTENSIONS,
      ctx.index,
    );
    if (matchedFiles.length > 0) return { kind: 'files', files: matchedFiles };
  } else {
    const memberResolved = resolveJvmMemberImport(
      rawImportPath,
      ctx.normalizedFileList,
      ctx.allFileList,
      AS3_EXTENSIONS,
      ctx.index,
    );
    if (memberResolved) return { kind: 'files', files: [memberResolved] };
  }
  return null;
};

export const actionscriptImportConfig: ImportResolutionConfig = {
  language: SupportedLanguages.ActionScript,
  strategies: [actionscriptJvmStrategy, createStandardStrategy(SupportedLanguages.ActionScript)],
};
