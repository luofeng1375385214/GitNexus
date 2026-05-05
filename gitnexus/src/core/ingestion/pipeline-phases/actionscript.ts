/**
 * Phase: actionscript
 *
 * Processes ActionScript 3.0 files via regex extraction (no tree-sitter).
 * Uses standalone parsing because tree-sitter-actionscript ABI 15 is
 * incompatible with the tree-sitter 0.21.x runtime (ABI 14).
 *
 * @deps    structure
 * @reads   scannedFiles, allPaths (from structure phase)
 * @writes  graph (Class, Interface, Method, Property, Function nodes;
 *          EXTENDS, IMPLEMENTS, CONTAINS, HAS_METHOD, HAS_PROPERTY,
 *          IMPORTS, CALLS, ACCESSES, METHOD_OVERRIDES edges)
 */

import type { GraphNode, GraphRelationship } from 'gitnexus-shared';
import { getLanguageFromFilename, SupportedLanguages } from 'gitnexus-shared';
import type { PipelinePhase, PipelineContext, PhaseResult } from './types.js';
import { getPhaseOutput } from './types.js';
import {
  parseActionScript,
  type AS3ParseResult,
  type AS3Call,
  type AS3FieldAccess,
} from '../actionscript-processor.js';
import { readFileContents } from '../filesystem-walker.js';
import type { StructureOutput } from './structure.js';
import { isDev } from '../utils/env.js';

export interface ActionScriptOutput {
  classes: number;
  interfaces: number;
  methods: number;
  properties: number;
  calls: number;
  imports: number;
}

export function isActionScriptFile(filePath: string): boolean {
  return getLanguageFromFilename(filePath) === SupportedLanguages.ActionScript;
}

export const actionscriptPhase: PipelinePhase<ActionScriptOutput> = {
  name: 'actionscript',
  deps: ['structure'],

  async execute(
    ctx: PipelineContext,
    deps: ReadonlyMap<string, PhaseResult<unknown>>,
  ): Promise<ActionScriptOutput> {
    const { scannedFiles, allPathSet } = getPhaseOutput<StructureOutput>(deps, 'structure');

    const asScanned = scannedFiles.filter((f) => isActionScriptFile(f.path));

    if (asScanned.length === 0) {
      return { classes: 0, interfaces: 0, methods: 0, properties: 0, calls: 0, imports: 0 };
    }

    const asContents = await readFileContents(
      ctx.repoPath,
      asScanned.map((f) => f.path),
    );
    const asFiles = asScanned
      .filter((f) => asContents.has(f.path))
      .map((f) => ({ path: f.path, content: asContents.get(f.path)! }));

    // First pass: parse all files and build global name maps
    const parseResults = new Map<string, AS3ParseResult>();
    const fqnToFile = new Map<string, string>();
    const fqnToNodeId = new Map<string, string>();
    const shortNameToFqn = new Map<string, string[]>();
    const seenRelIds = new Set<string>();

    for (const file of asFiles) {
      const result = parseActionScript(file.content);
      parseResults.set(file.path, result);

      const pkg = result.packageName;
      const fqn = (name: string) => (pkg ? `${pkg}.${name}` : name);

      for (const cls of result.classes) {
        const full = fqn(cls.name);
        fqnToFile.set(full, file.path);
        shortNameToFqn.set(cls.name, [...(shortNameToFqn.get(cls.name) ?? []), full]);
      }
      for (const iface of result.interfaces) {
        const full = fqn(iface.name);
        fqnToFile.set(full, file.path);
        shortNameToFqn.set(iface.name, [...(shortNameToFqn.get(iface.name) ?? []), full]);
      }
    }

    // Build import resolution map
    const importPathMap = buildImportPathMap(parseResults, allPathSet);

    // Second pass: write to graph
    let classCount = 0;
    let interfaceCount = 0;
    let methodCount = 0;
    let propertyCount = 0;
    let callCount = 0;
    let importCount = 0;

    const addRel = (rel: GraphRelationship) => {
      if (seenRelIds.has(rel.id)) return;
      seenRelIds.add(rel.id);
      ctx.graph.addRelationship(rel);
    };

    for (const [filePath, result] of parseResults) {
      const pkg = result.packageName;
      const fqn = (name: string) => (pkg ? `${pkg}.${name}` : name);

      // Node ID generators — format: "Label:filePath:name"
      // This ensures getNodeLabel(nodeId.split(':')[0]) returns the correct table name
      const fileNodeId = `File:${filePath}`;
      const nsNodeId = pkg ? `Namespace:${filePath}:${pkg}` : null;
      const makeClsNid = (name: string) => `Class:${filePath}:${name}`;
      const makeIfaceNid = (name: string) => `Interface:${filePath}:${name}`;
      const makeMethodNid = (clsName: string, fnName: string) =>
        `Method:${filePath}:${clsName}::${fnName}`;
      const makePropNid = (clsName: string, kind: string, pName: string) =>
        `Property:${filePath}:${clsName}::${kind}:${pName}`;
      const makeFnNid = (name: string) => `Function:${filePath}:${name}`;

      // ── File node ────────────────────────────────────────────────────────
      graphAddIfNew(ctx, {
        id: fileNodeId,
        label: 'File',
        properties: {
          name: filePath.split('/').pop()!.split('\\').pop()!,
          filePath,
          language: SupportedLanguages.ActionScript,
        },
      });

      // ── Package node ─────────────────────────────────────────────────────
      if (nsNodeId) {
        graphAddIfNew(ctx, {
          id: nsNodeId,
          label: 'Namespace',
          properties: { name: pkg, filePath, language: SupportedLanguages.ActionScript },
        });
        addRel({
          id: `${fileNodeId}-CONTAINS-${nsNodeId}`,
          sourceId: fileNodeId,
          targetId: nsNodeId,
          type: 'CONTAINS',
          confidence: 1,
          reason: 'actionscript-file-contains-package',
        });
      }

      // ── Classes ──────────────────────────────────────────────────────────
      for (const cls of result.classes) {
        const clsFqn = fqn(cls.name);
        const nid = makeClsNid(cls.name);
        fqnToNodeId.set(clsFqn, nid);

        ctx.graph.addNode({
          id: nid,
          label: 'Class',
          properties: {
            name: cls.name,
            fqn: clsFqn,
            filePath,
            language: SupportedLanguages.ActionScript,
            visibility: cls.visibility,
            isStatic: cls.isStatic,
            isDynamic: cls.isDynamic,
            isFinal: cls.isFinal,
          },
        });
        classCount++;

        if (nsNodeId) {
          addRel({
            id: `${nsNodeId}-CONTAINS-${nid}`,
            sourceId: nsNodeId,
            targetId: nid,
            type: 'CONTAINS',
            confidence: 1,
            reason: 'actionscript-package-contains-class',
          });
        }

        if (cls.extends) {
          const targetFqn = resolveName(cls.extends, pkg, fqnToFile, shortNameToFqn);
          const targetNid = resolveNodeId(targetFqn, 'Class', fqnToFile, fqnToNodeId);
          addRel({
            id: `${nid}-EXTENDS-${targetNid}`,
            sourceId: nid,
            targetId: targetNid,
            type: 'EXTENDS',
            confidence: 0.9,
            reason: 'actionscript-class-extends',
          });
        }

        for (const impl of cls.implements) {
          const targetFqn = resolveName(impl, pkg, fqnToFile, shortNameToFqn);
          const targetNid = resolveNodeId(targetFqn, 'Interface', fqnToFile, fqnToNodeId);
          addRel({
            id: `${nid}-IMPLEMENTS-${targetNid}`,
            sourceId: nid,
            targetId: targetNid,
            type: 'IMPLEMENTS',
            confidence: 0.9,
            reason: 'actionscript-class-implements',
          });
        }
      }

      // ── Interfaces ───────────────────────────────────────────────────────
      for (const iface of result.interfaces) {
        const ifaceFqn = fqn(iface.name);
        const nid = makeIfaceNid(iface.name);
        fqnToNodeId.set(ifaceFqn, nid);

        ctx.graph.addNode({
          id: nid,
          label: 'Interface',
          properties: {
            name: iface.name,
            fqn: ifaceFqn,
            filePath,
            language: SupportedLanguages.ActionScript,
            visibility: iface.visibility,
          },
        });
        interfaceCount++;

        if (nsNodeId) {
          addRel({
            id: `${nsNodeId}-CONTAINS-${nid}`,
            sourceId: nsNodeId,
            targetId: nid,
            type: 'CONTAINS',
            confidence: 1,
            reason: 'actionscript-package-contains-interface',
          });
        }

        for (const ext of iface.extends) {
          const targetFqn = resolveName(ext, pkg, fqnToFile, shortNameToFqn);
          const targetNid = resolveNodeId(targetFqn, 'Interface', fqnToFile, fqnToNodeId);
          addRel({
            id: `${nid}-EXTENDS-${targetNid}`,
            sourceId: nid,
            targetId: targetNid,
            type: 'EXTENDS',
            confidence: 0.9,
            reason: 'actionscript-interface-extends',
          });
        }
      }

      // ── Methods (functions with ownerClass) ──────────────────────────────
      for (const fn of result.functions) {
        const fnKey = fn.accessor ? `${fn.name}$${fn.accessor}` : fn.name;

        if (fn.ownerClass) {
          const clsFqn = fqn(fn.ownerClass);
          const ownerClsNid = fqnToNodeId.get(clsFqn) ?? makeClsNid(fn.ownerClass);
          const nid = makeMethodNid(fn.ownerClass, fnKey);

          ctx.graph.addNode({
            id: nid,
            label: 'Method',
            properties: {
              name: fn.name,
              filePath,
              language: SupportedLanguages.ActionScript,
              visibility: fn.visibility,
              isStatic: fn.isStatic,
              isOverride: fn.isOverride,
              isFinal: fn.isFinal,
              returnType: fn.returnType,
              ...(fn.accessor ? { accessor: fn.accessor } : {}),
            },
          });
          methodCount++;

          addRel({
            id: `${ownerClsNid}-HAS_METHOD-${nid}`,
            sourceId: ownerClsNid,
            targetId: nid,
            type: 'HAS_METHOD',
            confidence: 1,
            reason: 'actionscript-class-has-method',
          });

          fqnToNodeId.set(`${clsFqn}::${fnKey}`, nid);
          if (fn.accessor) {
            fqnToNodeId.set(`${clsFqn}::${fn.name}`, nid);
          }

          if (fn.isOverride) {
            const parentClass = result.classes.find((c) => c.name === fn.ownerClass);
            if (parentClass?.extends) {
              const parentFqn = resolveName(parentClass.extends, pkg, fqnToFile, shortNameToFqn);
              const parentNid = resolveNodeId(parentFqn, 'Class', fqnToFile, fqnToNodeId);
              const parentMethodNid = `Method:${fqnToFile.get(parentFqn) ?? filePath}:${parentClass.extends}::${fnKey}`;
              addRel({
                id: `${nid}-OVERRIDES-${parentMethodNid}`,
                sourceId: nid,
                targetId: parentMethodNid,
                type: 'METHOD_OVERRIDES',
                confidence: 0.85,
                reason: 'actionscript-method-overrides',
              });
            }
          }
        } else {
          const fnFqn = fqn(fnKey);
          const nid = makeFnNid(fnKey);

          ctx.graph.addNode({
            id: nid,
            label: 'Function',
            properties: {
              name: fn.name,
              fqn: fnFqn,
              filePath,
              language: SupportedLanguages.ActionScript,
              visibility: fn.visibility,
              isStatic: fn.isStatic,
              returnType: fn.returnType,
            },
          });
          methodCount++;
          fqnToNodeId.set(fnFqn, nid);
          fqnToNodeId.set(fqn(fn.name), nid);
        }
      }

      // ── Properties (variables with ownerClass) ───────────────────────────
      for (const v of result.variables) {
        if (v.ownerClass) {
          const clsFqn = fqn(v.ownerClass);
          const ownerClsNid2 = fqnToNodeId.get(clsFqn) ?? makeClsNid(v.ownerClass);
          const nid = makePropNid(v.ownerClass, v.kind, v.name);

          ctx.graph.addNode({
            id: nid,
            label: 'Property',
            properties: {
              name: v.name,
              filePath,
              language: SupportedLanguages.ActionScript,
              visibility: v.visibility,
              isStatic: v.isStatic,
              kind: v.kind,
              declaredType: v.type,
            },
          });
          propertyCount++;

          addRel({
            id: `${ownerClsNid2}-HAS_PROPERTY-${nid}`,
            sourceId: ownerClsNid2,
            targetId: nid,
            type: 'HAS_PROPERTY',
            confidence: 1,
            reason: 'actionscript-class-has-property',
          });

          fqnToNodeId.set(`${clsFqn}::${v.kind}:${v.name}`, nid);
        }
      }

      // ── IMPORTS ──────────────────────────────────────────────────────────
      for (const imp of result.imports) {
        let importTargetId: string | null = null;

        if (!imp.endsWith('.*')) {
          const shortName = imp.split('.').pop()!;
          const candidates = shortNameToFqn.get(shortName) ?? [];
          if (candidates.length > 0) {
            const targetFqn = candidates[0];
            importTargetId =
              fqnToNodeId.get(targetFqn) ??
              resolveNodeId(targetFqn, 'Class', fqnToFile, fqnToNodeId);
          }
        }

        if (importTargetId) {
          addRel({
            id: `${fileNodeId}-IMPORTS-${importTargetId}`,
            sourceId: fileNodeId,
            targetId: importTargetId,
            type: 'IMPORTS',
            confidence: 0.9,
            reason: 'actionscript-import',
          });
          importCount++;
        } else {
          const targetPath = importPathMap.get(imp);
          if (targetPath) {
            addRel({
              id: `${fileNodeId}-IMPORTS-${targetPath}`,
              sourceId: fileNodeId,
              targetId: `File:${targetPath}`,
              type: 'IMPORTS',
              confidence: 0.7,
              reason: 'actionscript-import-file',
            });
            importCount++;
          }
        }
      }

      // ── CALLS ────────────────────────────────────────────────────────────
      for (const call of result.calls) {
        const callerId = resolveCallerId(call, fqn, fqnToNodeId);
        if (!callerId) continue;

        const targetId = resolveCallTargetId(call, pkg, fqnToFile, fqnToNodeId, shortNameToFqn);
        if (!targetId) continue;

        addRel({
          id: `${callerId}-CALLS-${targetId}-${call.line}`,
          sourceId: callerId,
          targetId,
          type: 'CALLS',
          confidence: call.isNew ? 0.9 : 0.7,
          reason: call.isNew ? 'actionscript-new-expression' : 'actionscript-method-call',
        });
        callCount++;
      }

      // ── ACCESSES ─────────────────────────────────────────────────────────
      for (const access of result.fieldAccesses) {
        const callerId = resolveAccessOwnerId(access, fqn, fqnToNodeId);
        if (!callerId) continue;

        const targetId = resolveFieldAccessTarget(
          access,
          pkg,
          fqnToFile,
          fqnToNodeId,
          shortNameToFqn,
        );
        if (!targetId) continue;

        addRel({
          id: `${callerId}-ACCESSES-${targetId}-${access.line}`,
          sourceId: callerId,
          targetId,
          type: 'ACCESSES',
          confidence: 0.6,
          reason: access.isWrite ? 'actionscript-field-write' : 'actionscript-field-read',
        });
      }
    }

    if (isDev) {
      console.log(
        `  ActionScript: ${classCount} classes, ${interfaceCount} interfaces, ${methodCount} methods, ${propertyCount} properties from ${asFiles.length} files`,
      );
      console.log(`  ActionScript relations: ${callCount} calls, ${importCount} imports`);
    }

    return {
      classes: classCount,
      interfaces: interfaceCount,
      methods: methodCount,
      properties: propertyCount,
      calls: callCount,
      imports: importCount,
    };
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function graphAddIfNew(ctx: PipelineContext, node: GraphNode): void {
  if (!ctx.graph.getNode(node.id)) {
    ctx.graph.addNode(node);
  }
}

function resolveName(
  name: string,
  currentPkg: string | null,
  fqnToFile: Map<string, string>,
  shortNameToFqn: Map<string, string[]>,
): string {
  if (fqnToFile.has(name)) return name;
  if (currentPkg) {
    const candidate = `${currentPkg}.${name}`;
    if (fqnToFile.has(candidate)) return candidate;
  }
  const candidates = shortNameToFqn.get(name);
  if (candidates && candidates.length > 0) return candidates[0];
  return name;
}

/** Resolve a FQN to a node ID, using the registry or constructing one from the file path. */
function resolveNodeId(
  fqn: string,
  label: string,
  fqnToFile: Map<string, string>,
  fqnToNodeId: Map<string, string>,
): string {
  const existing = fqnToNodeId.get(fqn);
  if (existing) return existing;
  const file = fqnToFile.get(fqn);
  if (file) return `${label}:${file}:${fqn.split('.').pop()!}`;
  return `${label}::${fqn}`;
}

function buildImportPathMap(
  parseResults: Map<string, AS3ParseResult>,
  allPathSet: ReadonlySet<string>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const [, result] of parseResults) {
    for (const imp of result.imports) {
      if (map.has(imp)) continue;
      if (imp.endsWith('.*')) {
        const dirPath = imp.slice(0, -2).replace(/\./g, '/');
        for (const p of allPathSet) {
          const normalized = p.replace(/\\/g, '/');
          if (normalized.includes(dirPath + '/') && normalized.endsWith('.as')) {
            if (!map.has(imp)) map.set(imp, normalized);
            break;
          }
        }
      } else {
        const filePath = imp.replace(/\./g, '/') + '.as';
        for (const p of allPathSet) {
          const normalized = p.replace(/\\/g, '/');
          if (normalized.endsWith(filePath)) {
            map.set(imp, normalized);
            break;
          }
        }
      }
    }
  }
  return map;
}

function resolveCallerId(
  call: AS3Call,
  fqn: (name: string) => string,
  fqnToNodeId: Map<string, string>,
): string | null {
  if (call.ownerClass && call.ownerFunction) {
    const methodId = fqnToNodeId.get(`${fqn(call.ownerClass)}::${call.ownerFunction}`);
    if (methodId) return methodId;
  }
  if (call.ownerFunction) {
    const fnId = fqnToNodeId.get(fqn(call.ownerFunction));
    if (fnId) return fnId;
  }
  if (call.ownerClass) {
    const clsId = fqnToNodeId.get(fqn(call.ownerClass));
    if (clsId) return clsId;
  }
  return null;
}

function resolveCallTargetId(
  call: AS3Call,
  currentPkg: string | null,
  fqnToFile: Map<string, string>,
  fqnToNodeId: Map<string, string>,
  shortNameToFqn: Map<string, string[]>,
): string | null {
  if (call.isNew) {
    const resolved = resolveName(call.calleeName, currentPkg, fqnToFile, shortNameToFqn);
    return fqnToNodeId.get(resolved) ?? resolveNodeId(resolved, 'Class', fqnToFile, fqnToNodeId);
  }

  if (call.receiver) {
    const receiverType = resolveName(call.receiver, currentPkg, fqnToFile, shortNameToFqn);
    const methodId = fqnToNodeId.get(`${receiverType}::${call.calleeName}`);
    if (methodId) return methodId;
    const classId = fqnToNodeId.get(receiverType);
    if (classId) {
      const targetFile = fqnToFile.get(receiverType) ?? '';
      return `Method:${targetFile}:${receiverType.split('.').pop()}::${call.calleeName}`;
    }
    const targetFile = fqnToFile.get(receiverType) ?? '';
    if (targetFile)
      return `Method:${targetFile}:${receiverType.split('.').pop()}::${call.calleeName}`;
    return null;
  }

  const resolved = resolveName(call.calleeName, currentPkg, fqnToFile, shortNameToFqn);
  const fnId = fqnToNodeId.get(resolved);
  if (fnId) return fnId;
  return resolveNodeId(resolved, 'Function', fqnToFile, fqnToNodeId);
}

function resolveAccessOwnerId(
  access: AS3FieldAccess,
  fqn: (name: string) => string,
  fqnToNodeId: Map<string, string>,
): string | null {
  if (access.ownerClass && access.ownerFunction) {
    const methodId = fqnToNodeId.get(`${fqn(access.ownerClass)}::${access.ownerFunction}`);
    if (methodId) return methodId;
  }
  if (access.ownerFunction) {
    const fnId = fqnToNodeId.get(fqn(access.ownerFunction));
    if (fnId) return fnId;
  }
  if (access.ownerClass) {
    const clsId = fqnToNodeId.get(fqn(access.ownerClass));
    if (clsId) return clsId;
  }
  return null;
}

function resolveFieldAccessTarget(
  access: AS3FieldAccess,
  currentPkg: string | null,
  fqnToFile: Map<string, string>,
  fqnToNodeId: Map<string, string>,
  shortNameToFqn: Map<string, string[]>,
): string | null {
  const receiverType = resolveName(access.receiver, currentPkg, fqnToFile, shortNameToFqn);
  const propId = fqnToNodeId.get(`${receiverType}::var:${access.field}`);
  if (propId) return propId;
  const constId = fqnToNodeId.get(`${receiverType}::const:${access.field}`);
  if (constId) return constId;
  const classId = fqnToNodeId.get(receiverType);
  if (classId) {
    const targetFile = fqnToFile.get(receiverType) ?? '';
    return `Property:${targetFile}:${receiverType.split('.').pop()}::var:${access.field}`;
  }
  return null;
}
