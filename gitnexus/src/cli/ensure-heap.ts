/**
 * Shared heap/stack guard — re-execs the current process with a larger
 * V8 heap and stack when the defaults are too small.
 *
 * Used by both `analyze` and `mcp` commands:
 *   - analyze: 8 GB heap, 4096 KB stack (heavy ingestion workload)
 *   - mcp:     4 GB heap (LadybugDB mmaps large index files)
 *
 * The re-exec uses `stdio: 'inherit'` so MCP's stdin/stdout pipes
 * (JSON-RPC transport) are preserved through the hand-off.
 */

import { execFileSync } from 'child_process';
import v8 from 'v8';

/** Re-exec with the requested heap (MB) if the current limit is below 90%. */
export function ensureHeap(heapMB: number): boolean {
  const nodeOpts = process.env.NODE_OPTIONS || '';
  if (nodeOpts.includes('--max-old-space-size')) return false;

  const v8Heap = v8.getHeapStatistics().heap_size_limit;
  if (v8Heap >= heapMB * 1024 * 1024 * 0.9) return false;

  const heapFlag = `--max-old-space-size=${heapMB}`;

  try {
    execFileSync(process.execPath, [heapFlag, ...process.argv.slice(1)], {
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: `${nodeOpts} ${heapFlag}`.trim() },
    });
  } catch (e: any) {
    process.exitCode = e.status ?? 1;
  }
  return true;
}
