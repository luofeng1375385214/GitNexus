import { SupportedLanguages } from 'gitnexus-shared';
import type { CallExtractionConfig } from '../../call-types.js';

export const actionscriptCallConfig: CallExtractionConfig = {
  language: SupportedLanguages.ActionScript,
  typeAsReceiverHeuristic: true,
};
