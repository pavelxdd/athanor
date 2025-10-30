// A simple heuristic for token counting.
// 1 token is roughly 4 characters of text.
export function countTokens(text: string): number {
  if (!text) {
    return 0;
  }
  return Math.ceil(text.length / 4);
}

// Format token count with up to 3 significant digits as a regular number
export function formatTokenCount(count: number): string {
  if (count === 0) return '0 tokens';

  // Round to 3 significant digits
  const magnitude = Math.floor(Math.log10(count));
  const scale = Math.pow(10, magnitude - 2);
  const rounded = Math.ceil(count / scale) * scale;

  // Convert to string with comma formatting for thousands
  const formattedNumber = rounded.toLocaleString('en-US', {
    maximumFractionDigits: 0,
  });

  return `~${formattedNumber} tokens`;
}
