/** Keep the actual Chromium version; desktop product tokens trigger false unsupported-browser pages. */
export function chromiumUserAgent(value: string, product: string) {
  const escaped = product.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(new RegExp(`\\s(?:Electron|${escaped})/[^\\s]+`, 'gi'), '');
}
