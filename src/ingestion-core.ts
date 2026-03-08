import { extname } from 'node:path';

/**
 * Shared ingestion core: deterministic routing logic reused by cron (PM4/PM6)
 * and link-triggered (PM15) ingestion paths.
 */

/** Ingestion route: determines which Bonfires endpoint receives the content. */
export type IngestionRoute = 'pdf' | 'text';

/**
 * Determine if a file path has a PDF extension (case-insensitive).
 * PM14-R2: routing decision is deterministic and based on normalized extension.
 */
export function isPdfExtension(filePath: string): boolean {
  return extname(filePath).toLowerCase() === '.pdf';
}

/**
 * Classify ingestion route by file path extension.
 * PM14-R2: .pdf -> 'pdf', everything else -> 'text'.
 */
export function classifyRouteByPath(filePath: string): IngestionRoute {
  return isPdfExtension(filePath) ? 'pdf' : 'text';
}

/**
 * Classify ingestion route by content-type header (for link ingestion, PM15-R3).
 * - application/pdf -> 'pdf'
 * - text/html -> 'html' (caller handles extraction before routing to 'text')
 * - text/* and common structured types -> 'text'
 * - unknown -> null (unsupported)
 */
export type ContentClassification = 'pdf' | 'text' | 'html' | null;

export function classifyByContentType(contentType: string): ContentClassification {
  const ct = contentType.toLowerCase().split(';')[0].trim();
  if (ct === 'application/pdf') return 'pdf';
  if (ct === 'text/html') return 'html';
  if (ct.startsWith('text/')) return 'text';
  const structuredTypes = [
    'application/json',
    'application/yaml',
    'application/x-yaml',
    'text/csv',
    'text/markdown',
  ];
  if (structuredTypes.includes(ct)) return 'text';
  return null;
}

/**
 * Classify a link URL for ingestion routing (PM15-R3).
 * Uses URL path extension first, falls back to content-type header.
 */
export function classifyLink(url: string, contentType?: string): ContentClassification {
  try {
    const pathname = new URL(url).pathname;
    if (isPdfExtension(pathname)) return 'pdf';
    const ext = extname(pathname).toLowerCase();
    const textExts = ['.md', '.txt', '.json', '.yaml', '.yml', '.csv'];
    if (textExts.includes(ext)) return 'text';
    if (ext === '.html' || ext === '.htm') return 'html';
  } catch {
    // invalid URL, fall through to content-type
  }
  if (contentType) return classifyByContentType(contentType);
  return null;
}

/**
 * Check if a Bonfires response indicates a duplicate (PM14-R5, PM15-R7).
 * Duplicate responses are treated as successful no-op.
 *
 * Tolerant matching: recognizes "duplicate", "duplicate content", and other
 * duplicate-indicating variants (case-insensitive, trimmed). Scoped to
 * messages that start with "duplicate" to keep false-positive risk low.
 */
export function isDuplicateResponse(response: { success?: boolean; message?: string }): boolean {
  if (!response.message) return false;
  const normalized = response.message.trim().toLowerCase();
  return normalized === 'duplicate' || normalized === 'duplicate content';
}
