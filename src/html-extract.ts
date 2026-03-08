/**
 * Deterministic HTML extraction (PM15-R4).
 * Extracts primary readable content from HTML without browser/JS execution.
 * Produces plain text suitable for ingestion via /ingest_content.
 */

/**
 * Strip HTML tags and extract readable text content.
 * Removes script, style, nav, header, footer, and aside elements first,
 * then strips remaining tags and normalizes whitespace.
 *
 * PM15-R4: Deterministic and testable — no LLM summarization in extraction path.
 */
export function extractReadableText(html: string): string {
  let text = html;

  // Remove elements that don't contribute to readable content
  const stripElements = ['script', 'style', 'nav', 'header', 'footer', 'aside', 'noscript', 'svg', 'iframe'];
  for (const tag of stripElements) {
    text = text.replace(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi'), '');
  }

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert common block elements to newlines for readability
  text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|pre|hr)[^>]*\/?>/gi, '\n');

  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));

  // Normalize whitespace: collapse multiple spaces/tabs, trim lines, collapse blank lines
  text = text
    .split('\n')
    .map(line => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}
