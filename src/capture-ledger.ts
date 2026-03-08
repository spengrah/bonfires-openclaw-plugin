import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

function isWithin(baseDir: string, targetPath: string) {
  const b = resolve(baseDir); const t = resolve(targetPath);
  const rel = relative(b, t);
  return rel === '' || (!rel.startsWith('..') && !rel.includes('..\\'));
}

export class InMemoryCaptureLedger {
  path?: string;
  baseDir?: string;
  map: Map<string, any>;
  private injectedSessions: Set<string>;
  private injectionStatePath?: string;

  constructor(path?: string, baseDir?: string) {
    this.path = path;
    this.baseDir = baseDir;
    this.map = new Map();
    this.injectedSessions = new Set();
    this.injectionStatePath = path ? join(dirname(path), 'injection-state.json') : undefined;

    if (path) {
      this.assertSafePath(path);
      try {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        for (const [k, v] of Object.entries(data)) this.map.set(k, v);
      } catch {}
    }

    if (this.injectionStatePath) {
      this.assertSafePath(this.injectionStatePath);
      try {
        const ids = JSON.parse(readFileSync(this.injectionStatePath, 'utf8'));
        if (Array.isArray(ids)) {
          for (const id of ids) {
            if (typeof id === 'string' && id) this.injectedSessions.add(id);
          }
        }
      } catch {}
    }
  }

  assertSafePath(p: string) {
    if (!this.baseDir) return;
    if (!isWithin(this.baseDir, p)) throw new Error(`Unsafe ledger path: ${p}`);
  }

  get(sessionKey: string) { return this.map.get(sessionKey); }

  set(sessionKey: string, watermark: any) {
    this.map.set(sessionKey, watermark);
    if (this.path) {
      this.assertSafePath(this.path);
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify(Object.fromEntries(this.map), null, 2));
    }
  }

  hasInjected(sessionId: string): boolean {
    return this.injectedSessions.has(sessionId);
  }

  markInjected(sessionId: string): void {
    this.injectedSessions.add(sessionId);
    if (this.injectionStatePath) {
      this.assertSafePath(this.injectionStatePath);
      mkdirSync(dirname(this.injectionStatePath), { recursive: true });
      writeFileSync(this.injectionStatePath, JSON.stringify([...this.injectedSessions], null, 2));
    }
  }
}
