import { createHash } from 'node:crypto';
import { classifyLink, isDuplicateResponse } from '../ingestion-core.js';
import { extractReadableText } from '../html-extract.js';
import { safeFetch, validateFetchUrl } from '../transport-safety.js';
import type { BonfiresClient } from '../bonfires-client.js';

export type LinkIngestionResult = {
  url: string;
  classification: string;
  route: string;
  success: boolean;
  duplicate: boolean;
  error?: string;
};

/**
 * Ingest a single approved link (PM15-R2).
 * Fetches content with transport safety guards, classifies, routes to appropriate endpoint.
 */
export async function ingestLink(
  url: string,
  client: BonfiresClient,
  _logger?: { warn?: (msg: string) => void },
): Promise<LinkIngestionResult> {
  // PM15-R5: validate URL before fetching
  const urlErr = validateFetchUrl(url);
  if (urlErr) {
    return { url, classification: 'blocked', route: 'none', success: false, duplicate: false, error: urlErr };
  }

  let body: Buffer;
  let contentType: string;
  let finalUrl: string;
  try {
    ({ body, contentType, finalUrl } = await safeFetch(url));
  } catch (e: any) {
    return { url, classification: 'fetch_error', route: 'none', success: false, duplicate: false, error: String(e?.message ?? e) };
  }

  // PM15-R3: classify by URL extension + content-type
  const classification = classifyLink(finalUrl, contentType);
  if (!classification) {
    return { url, classification: 'unsupported', route: 'none', success: false, duplicate: false, error: `unsupported content type: ${contentType}` };
  }

  const now = new Date().toISOString();
  const metadata = {
    source_url: url,
    fetched_at: now,
    content_type: contentType,
    origin: 'linked_content',
  };

  try {
    if (classification === 'pdf') {
      // PM15-R3: PDF -> /ingest_pdf
      if (!client.ingestPdf) throw new Error('ingestPdf is not available on client');
      const hash = `sha256:${createHash('sha256').update(body).digest('hex')}`;
      const result = await client.ingestPdf({
        sourcePath: url,
        content: body,
        contentHash: hash,
        metadata,
      });
      const dup = isDuplicateResponse(result);
      return { url, classification: 'pdf', route: '/ingest_pdf', success: true, duplicate: dup };
    }

    // For text and HTML, convert to string
    const textContent = body.toString('utf8');
    let ingestContent: string;

    if (classification === 'html') {
      // PM15-R4: HTML -> extract readable text -> /ingest_content
      ingestContent = extractReadableText(textContent);
      if (!ingestContent.trim()) {
        return { url, classification: 'html', route: '/ingest_content', success: false, duplicate: false, error: 'HTML extraction produced empty content' };
      }
    } else {
      // PM15-R3: text-like -> /ingest_content
      ingestContent = textContent;
    }

    if (!client.ingestContent) throw new Error('ingestContent is not available on client');
    const hash = `sha256:${createHash('sha256').update(ingestContent).digest('hex')}`;
    await client.ingestContent({
      sourcePath: url,
      content: ingestContent,
      contentHash: hash,
      metadata,
    });
    return { url, classification, route: '/ingest_content', success: true, duplicate: false };
  } catch (e: any) {
    return { url, classification, route: classification === 'pdf' ? '/ingest_pdf' : '/ingest_content', success: false, duplicate: false, error: String(e?.message ?? e) };
  }
}

/**
 * bonfires_ingest_link tool handler (PM15-R2).
 * Explicit ingestion action for user-approved links.
 */
export async function bonfiresIngestLinkTool(
  params: { url: string },
  _toolCtx: any,
  deps: { cfg: any; client: BonfiresClient; logger?: { warn?: (msg: string) => void } },
) {
  if (!params.url || typeof params.url !== 'string') {
    return { success: false, error: 'url parameter is required' };
  }

  const result = await ingestLink(params.url, deps.client, deps.logger);
  return result;
}
