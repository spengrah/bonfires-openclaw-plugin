/**
 * Transport safety guards for link ingestion (PM15-R5).
 * Enforces scheme, SSRF, timeout, redirect, and size limits.
 */

export interface TransportLimits {
  timeoutMs: number;
  maxRedirects: number;
  maxResponseBytes: number;
}

const DEFAULT_LIMITS: TransportLimits = {
  timeoutMs: 15_000,
  maxRedirects: 3,
  maxResponseBytes: 10 * 1024 * 1024, // 10 MB
};

/** PM15-R5: Only http/https URLs are allowed. */
export function isAllowedScheme(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * PM15-R5: Block localhost, private-network, and link-local targets.
 * Checks hostname against known private/reserved ranges.
 */
export function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return true;
  if (h === '0.0.0.0' || h.startsWith('0.')) return true;
  if (h.endsWith('.local') || h.endsWith('.localhost')) return true;
  // IPv4 private ranges
  if (/^10\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  // Link-local
  if (/^169\.254\./.test(h)) return true;
  // Metadata endpoints
  if (h === '169.254.169.254') return true;
  return false;
}

/**
 * Validate a URL for safe fetching.
 * Returns null on success, or an error reason string.
 */
export function validateFetchUrl(url: string): string | null {
  if (!isAllowedScheme(url)) return 'only http/https URLs are allowed';
  try {
    const parsed = new URL(url);
    if (isPrivateHost(parsed.hostname)) return 'private/localhost targets are blocked';
  } catch {
    return 'invalid URL';
  }
  return null;
}

/**
 * Safely fetch a URL with transport guards.
 * Uses manual redirect following to enforce maxRedirects at the application
 * layer and re-validate each hop against SSRF guards (PM15-R5).
 * Returns the response body as a Buffer and content-type header.
 */
export async function safeFetch(
  url: string,
  limits: Partial<TransportLimits> = {},
): Promise<{ body: Buffer; contentType: string; finalUrl: string }> {
  const opts = { ...DEFAULT_LIMITS, ...limits };

  const err = validateFetchUrl(url);
  if (err) throw new Error(`Transport safety: ${err} — ${url}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    let currentUrl = url;
    let res: Response;
    let hops = 0;

    // Application-layer redirect loop: manually follow redirects so we can
    // validate each intermediate target against SSRF guards.
    while (true) {
      res = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
      });

      const isRedirect = res.status >= 300 && res.status < 400;
      if (!isRedirect) break;

      hops += 1;
      if (hops > opts.maxRedirects) {
        throw new Error(`Transport safety: exceeded max redirects (${opts.maxRedirects})`);
      }

      const location = res.headers.get('location');
      if (!location) {
        throw new Error(`Transport safety: redirect ${res.status} with no Location header`);
      }

      // Resolve relative redirects against the current URL
      const nextUrl = new URL(location, currentUrl).href;
      const redirectErr = validateFetchUrl(nextUrl);
      if (redirectErr) {
        throw new Error(`Transport safety: redirect target blocked — ${nextUrl}`);
      }

      currentUrl = nextUrl;
    }

    if (!res!.ok) throw new Error(`HTTP ${res!.status} fetching ${currentUrl}`);

    const contentType = res!.headers.get('content-type') || 'application/octet-stream';
    const finalUrl = currentUrl;

    // Read response with size limit
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const reader = res!.body?.getReader();
    if (!reader) throw new Error('No response body');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.byteLength;
      if (totalSize > opts.maxResponseBytes) {
        reader.cancel();
        throw new Error(`Response exceeds max size (${opts.maxResponseBytes} bytes)`);
      }
      chunks.push(value);
    }

    const body = Buffer.concat(chunks);
    return { body, contentType, finalUrl };
  } finally {
    clearTimeout(timer);
  }
}
