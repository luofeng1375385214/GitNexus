/**
 * Pipeline phase for ActionScript standalone processing.
 *
 * Processes .as files using regex-based parsing (actionscript-processor.ts).
 * Runs after the main tree-sitter pipeline for standalone-language files.
 */

import type { GraphNode, GraphRelationship } from 'gitnexus-shared';
import { getLanguageFromFilename, SupportedLanguages } from 'gitnexus-shared';
import { parseActionScript } from '../actionscript-processor.js';
import type { KnowledgeGraph } from '../../graph/types.js';

export function isActionScriptFile(filePath: string): boolean {
  return getLanguageFromFilename(filePath) === SupportedLanguages.ActionScript;
}

export function processActionScriptPhase(
  files: Array<{ path: string; content: string }>,
  graph: KnowledgeGraph,
): number {
  let processed = 0;

  for (const file of files) {
    if (!isActionScriptFile(file.path)) continue;

    const result = parseActionScript(file.content);
    const fqn = (name: string) => (result.packageName ? `${result.packageName}.${name}` : name);

    // Add classes
    for (const cls of result.classes) {
      const classNode: GraphNode = {
        id: fqn(cls.name),
        label: 'Class',
        properties: {
          name: cls.name,
          filePath: file.path,
          language: SupportedLanguages.ActionScript,
          visibility: cls.visibility,
        },
      };
      graph.addNode(classNode);

      if (cls.extends) {
        const rel: GraphRelationship = {
          id: `${fqn(cls.name)}-EXTENDS-${cls.extends}`,
          sourceId: fqn(cls.name),
          targetId: cls.extends,
          type: 'EXTENDS',
          confidence: 1,
          reason: 'actionscript-class-extends',
        };
        graph.addRelationship(rel);
      }
      for (const impl of cls.implements) {
        const rel: GraphRelationship = {
          id: `${fqn(cls.name)}-IMPLEMENTS-${impl}`,
          sourceId: fqn(cls.name),
          targetId: impl,
          type: 'IMPLEMENTS',
          confidence: 1,
          reason: 'actionscript-class-implements',
        };
        graph.addRelationship(rel);
      }
    }

    // Add interfaces
    for (const iface of result.interfaces) {
      const ifaceNode: GraphNode = {
        id: fqn(iface.name),
        label: 'Interface',
        properties: {
          name: iface.name,
          filePath: file.path,
          language: SupportedLanguages.ActionScript,
          visibility: iface.visibility,
        },
      };
      graph.addNode(ifaceNode);
      for (const ext of iface.extends) {
        const rel: GraphRelationship = {
          id: `${fqn(iface.name)}-EXTENDS-${ext}`,
          sourceId: fqn(iface.name),
          targetId: ext,
          type: 'EXTENDS',
          confidence: 1,
          reason: 'actionscript-interface-extends',
        };
        graph.addRelationship(rel);
      }
    }

    // Add functions
    for (const fn of result.functions) {
      const fnNode: GraphNode = {
        id: fqn(fn.name),
        label: 'Function',
        properties: {
          name: fn.name,
          filePath: file.path,
          language: SupportedLanguages.ActionScript,
          visibility: fn.visibility,
        },
      };
      graph.addNode(fnNode);
    }

    processed++;
  }

  return processed;
}
