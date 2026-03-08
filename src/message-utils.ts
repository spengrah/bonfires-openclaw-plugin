/** True when the prompt contains OpenClaw metadata wrappers (real user message from a platform). */
export function hasUserMetadata(prompt: string): boolean {
  return /\(untrusted metadata\):\s*\n```json\s*\n\{/.test(String(prompt ?? ''));
}

/** Extract the actual user message from event.prompt, stripping OpenClaw metadata wrappers only. */
export function extractUserMessage(prompt: string): string {
  const raw = String(prompt ?? '').trim();
  if (!raw) return '';

  // Only match code fences attached to OpenClaw metadata wrappers.
  const metaPattern = /(?:^|\n)[^\n]*\(untrusted metadata\):\s*\n```json\s*\n\{[^}]*\}\s*\n```/g;
  let lastEnd = 0;
  let match;
  while ((match = metaPattern.exec(raw)) !== null) {
    lastEnd = match.index + match[0].length;
  }

  return lastEnd > 0 ? raw.slice(lastEnd).trim() : raw;
}
