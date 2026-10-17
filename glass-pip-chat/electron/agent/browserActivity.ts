/** Presentation only: retain the original tool name, arguments and result in details. */
export function browserActivity(name: string, input: Record<string, unknown> = {}): { kind: 'browser'; context: string } | undefined {
  const normalized = name.toLowerCase().replace(/^mcp__/, '').replace(/__/g, '.').replace(/\s*·\s*/g, '.');
  if (!/^cua_repl\.(js|js_reset)$/.test(normalized)) return;
  const code = typeof input.code === 'string' ? input.code : '';
  // CUA can also drive native apps; don't relabel those as browser work.
  if (/\b(?:sky\.|cua\.(?:getApp|getWindow|selectApp)\s*\()/.test(code)) return;
  const title = [input.title, input.description].find(value => typeof value === 'string' && value.trim());
  let context = typeof title === 'string' ? title.replace(/\s+/g, ' ').trim().slice(0, 120) : '';
  if (!context) {
    if (normalized.endsWith('js_reset')) context = 'Resetting browser session';
    else if (/\b(?:getState|getBrowser)\s*\(/.test(code)) context = 'Checking browser connections';
    else if (/\b(?:createBrowserTab|goto|navigate)\s*\(/.test(code)) context = 'Opening a page';
    else if (/\bgetTab\s*\(/.test(code)) context = 'Selecting a tab';
    else if (/\b(?:snapshot|screenshot|domSnapshot)\s*\(/.test(code)) context = 'Inspecting the page';
    else context = 'Browser interaction';
  }
  return { kind: 'browser', context };
}
