// Presentation transport only. Agent/user history remains the original text.
// Prose becomes quoted speech; fenced JavaScript keeps its original commands.
function spokenText(text) {
  return text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|>[ \t]*)/gm, '')
    .replace(/(\*\*|__)([\s\S]*?)\1/g, '$2').replace(/`([^`]*)`/g, '$1')
    .replace(/\s+/g, ' ').trim();
}

function proseCode(text, complete) {
  let code = '', cursor = 0;
  const speak = end => {
    const value = spokenText(text.slice(cursor, end)); cursor = end;
    if (value && !/^(?:svg)+$/i.test(value)) {
      let part = '', bytes = 0;
      for (const char of value) {
        const size = Buffer.byteLength(char);
        if (part && (bytes + size > 4000 || part.length + char.length > 2800)) {
          code += `step(0); say(${JSON.stringify(part)});\n`; part = ''; bytes = 0;
        }
        part += char; bytes += size;
      }
      if (part) code += `step(0); say(${JSON.stringify(part)});\n`;
    }
  };
  const boundary = /[.!?](?=\s)|\n[ \t]*\n/g;
  for (let match; (match = boundary.exec(text));) {
    const end = match.index + match[0].length, part = text.slice(cursor, end);
    // Do not split an unfinished Markdown link or inline code at its punctuation.
    if ((part.match(/\[/g)?.length ?? 0) !== (part.match(/\]/g)?.length ?? 0)
      || (part.match(/`/g)?.length ?? 0) % 2) continue;
    speak(end);
  }
  if (complete) speak(text.length);
  return code;
}

/** Deterministic append-only projection at sentence/fence boundaries. */
export function nativeConversationCode(raw, final = false) {
  let code = '', cursor = 0;
  const opening = /^ {0,3}(`{3,}|~{3,})([^\r\n]*)\r?\n/gm;
  while (cursor < raw.length) {
    opening.lastIndex = cursor;
    const match = opening.exec(raw);
    if (!match) {
      let rest = raw.slice(cursor);
      // A fence/header can arrive one character at a time. Never speak it.
      if (!final) rest = rest.replace(/(^|\n) {0,3}[`~][^\n]*$/, '$1');
      code += proseCode(rest, final);
      break;
    }
    code += proseCode(raw.slice(cursor, match.index), true);
    const start = opening.lastIndex, marker = match[1];
    const closing = new RegExp('^ {0,3}' + marker[0] + '{' + marker.length + ',}[ \\t]*(?:\\r?\\n|$)', 'gm');
    closing.lastIndex = start;
    const close = closing.exec(raw);
    if (/^(?:javascript|js)\s*$/i.test(match[2])) {
      let body = raw.slice(start, close?.index ?? raw.length);
      if (!close) body = body.replace(/(^|\n) {0,3}[`~]{1,}[^\n]*$/, '$1');
      code += body;
      if (close && body && !body.endsWith('\n')) code += '\n';
    }
    if (!close) break;
    cursor = closing.lastIndex;
  }
  return code;
}
