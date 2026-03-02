import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';

function isWithin(baseDir: string, targetPath: string) {
  const b = resolve(baseDir); const t = resolve(targetPath);
  const rel = relative(b, t);
  return rel === '' || (!rel.startsWith('..') && !rel.includes('..\\'));
}

export class InMemoryCaptureLedger {
  path?: string;
  baseDir?: string;
  map: Map<string, any>;

  constructor(path?: string, baseDir?: string) {
    this.path = path;
    this.baseDir = baseDir;
    this.map = new Map();
    if (path) {
      this.assertSafePath(path);
      try {
        const data = JSON.parse(readFileSync(path, 'utf8'));
        for (const [k, v] of Object.entries(data)) this.map.set(k, v);
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
}
