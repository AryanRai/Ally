/** Normalize model LaTeX delimiters before Markdown treats \[ and \( as
 * escaped punctuation. Never rewrite fenced/inline code examples. */
export function mathMarkdown(text: string): string {
  const code = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\n\1[^\n]*(?:\n|$)|$)|(`+)[^\n]*?\2/g;
  const normalize = (part: string) => part
    .replace(/\\\[([\s\S]*?)\\\]/g, (_all, expression) => `\n$$\n${expression.trim()}\n$$\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_all, expression) => `$${expression}$`);
  let result = '', offset = 0;
  for (const match of text.matchAll(code)) {
    result += normalize(text.slice(offset, match.index)) + match[0]; offset = match.index! + match[0].length;
  }
  return result + normalize(text.slice(offset));
}
