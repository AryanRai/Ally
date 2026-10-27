"""Windows local paths and destination binding for the existing chooser workflow."""
def patch_upload(text):
    before = "!paths.every(p => typeof p === 'string' && p.startsWith('/'))"
    after = r"!paths.every(p => typeof p === 'string' && !/[\0\r\n]/.test(p) && (/^[a-z]:[\\/]/i.test(p) && !p.slice(2).includes(':') || p.startsWith('/') && !p.startsWith('//')) && !p.startsWith('\\\\'))"
    if before in text:
        text = text.replace(before, after, 1)
    elif after not in text:
        raise ValueError('Extension upload path validation changed; no patch applied.')
    anchor = "    const paths = this.uploadPaths(request.paths);\n    const info = await call(FILE_TARGET);"
    replacement = """    const paths = this.uploadPaths(request.paths);
    // Ally attachment consent is bound to the observed destination.
    if (!request.url || webURL(request.url) !== webURL((await this.api.tabs.get(tabId)).url)) throw new Error('Upload destination changed. Observe the page and request fresh approval.');
    const info = await call(FILE_TARGET);"""
    if anchor in text:
        text = text.replace(anchor, replacement, 1)
    elif replacement not in text:
        raise ValueError('Extension upload workflow changed; no patch applied.')
    return text
