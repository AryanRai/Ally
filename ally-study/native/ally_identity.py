"""Brand private Ally assets; retain extension security identity and native code."""
import argparse
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import sys

from PIL import Image, ImageEnhance, ImageOps

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / 'ally-study'
BUILD = ROOT / '.local/identity-build'
SOURCE = ROOT / 'glass-pip-chat/assets/allay.png'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def replace_file(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and digest(source) == digest(target):
        return
    staged = target.with_name(target.name + '.identity-staged')
    shutil.copyfile(source, staged)
    staged.replace(target)


def brand_extension(source, destination, image):
    from browser_upload import patch_upload
    shutil.copytree(source, destination, dirs_exist_ok=True)
    original = json.loads((source / 'manifest.json').read_text(encoding='utf-8-sig'))
    manifest = json.loads(json.dumps(original))
    manifest['name'] = manifest['short_name'] = 'Ally'
    manifest['description'] = 'Let Ally work in Chrome for tasks you ask for. Watch its tabs and stop it anytime.'
    manifest['action']['default_title'] = 'Ally'
    (destination / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    for file in destination.iterdir():
        if file.suffix not in ('.js', '.mjs', '.html', '.css'):
            continue
        text = file.read_text(encoding='utf-8-sig')
        text = text.replace('HeyClicky', 'Ally').replace('hey clicky,', 'Ally,')
        text = text.replace('your Mac', 'your computer')
        if file.name == 'core.mjs':
            text = patch_upload(text)
        file.write_text(text, encoding='utf-8')
    shutil.copyfile(STUDY / 'browser-brand/mark.js', destination / 'mark.js')
    for size in (16, 32, 48, 128):
        icon = image.resize((size, size), Image.Resampling.NEAREST)
        icon.save(destination / f'icons/{size}.png')
        if size in (16, 32):
            icon.save(destination / f'icons/toolbar-{size}.png')
            off = ImageOps.grayscale(icon).convert('RGBA')
            off.putalpha(ImageEnhance.Brightness(icon.getchannel('A')).enhance(.5))
            off.save(destination / f'icons/toolbar-{size}-off.png')
    shutil.copyfile(SOURCE, destination / 'assets/ally.png')
    image.resize((256, 256), Image.Resampling.NEAREST).save(destination / 'assets/app-icon.png')
    # Only presentation fields may differ in the manifest. In particular, keep
    # the key/ID, native messaging permission and every browser permission.
    for field in ('name', 'short_name', 'description'):
        manifest[field] = original[field]
    manifest['action']['default_title'] = original['action']['default_title']
    if manifest != original:
        raise RuntimeError('Extension identity or permissions changed')


def patch_executable_icon(exe, ico):
    # Work on a copied PE. UpdateResource edits icon resources, never executable
    # sections, the entry point, or the original installed apphost.
    sys.path.insert(0, str(STUDY / 'tools'))
    import pefile
    before = pefile.PE(str(exe))
    code_before = {s.Name: s.get_data() for s in before.sections if s.Characteristics & 0x20}
    groups = []
    for entry in before.DIRECTORY_ENTRY_RESOURCE.entries:
        if entry.id == 14:
            for group in entry.directory.entries:
                if group.name is not None:
                    raise RuntimeError('Unexpected named icon group')
                for lang in group.directory.entries:
                    groups.append((group.id, lang.id))
    before.close()
    if not groups:
        raise RuntimeError('Native apphost has no icon group')
    data = ico.read_bytes()
    count = struct.unpack_from('<H', data, 4)[0]
    group = bytearray(data[:6])
    images = []
    for index in range(count):
        offset = 6 + index * 16
        length, location = struct.unpack_from('<II', data, offset + 8)
        resource_id = 400 + index
        group.extend(data[offset:offset + 12] + struct.pack('<H', resource_id))
        images.append((resource_id, data[location:location + length]))
    kernel = ctypes.WinDLL('kernel32', use_last_error=True)
    kernel.BeginUpdateResourceW.argtypes = [wintypes.LPCWSTR, wintypes.BOOL]
    kernel.BeginUpdateResourceW.restype = wintypes.HANDLE
    kernel.UpdateResourceW.argtypes = [wintypes.HANDLE, ctypes.c_void_p, ctypes.c_void_p, wintypes.WORD, ctypes.c_void_p, wintypes.DWORD]
    kernel.UpdateResourceW.restype = wintypes.BOOL
    kernel.EndUpdateResourceW.argtypes = [wintypes.HANDLE, wintypes.BOOL]
    kernel.EndUpdateResourceW.restype = wintypes.BOOL
    handle = kernel.BeginUpdateResourceW(str(exe), False)
    if not handle:
        raise ctypes.WinError(ctypes.get_last_error())
    committed = False
    try:
        for _, language in groups:
            for resource_id, content in images:
                if not kernel.UpdateResourceW(handle, 3, resource_id, language, content, len(content)):
                    raise ctypes.WinError(ctypes.get_last_error())
        for resource_id, language in groups:
            content = bytes(group)
            if not kernel.UpdateResourceW(handle, 14, resource_id, language, content, len(content)):
                raise ctypes.WinError(ctypes.get_last_error())
        if not kernel.EndUpdateResourceW(handle, False):
            raise ctypes.WinError(ctypes.get_last_error())
        committed = True
    finally:
        if not committed:
            kernel.EndUpdateResourceW(handle, True)
    after = pefile.PE(str(exe))
    code_after = {s.Name: s.get_data() for s in after.sections if s.Characteristics & 0x20}
    after.close()
    if code_before != code_after:
        raise RuntimeError('Apphost code changed during icon update')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--install', action='store_true')
    parser.add_argument('--install-exe', action='store_true')
    args = parser.parse_args()
    BUILD.mkdir(parents=True, exist_ok=True)
    image = Image.open(SOURCE).convert('RGBA')
    ico = BUILD / 'Ally.ico'
    image.save(ico, sizes=[(s, s) for s in (16, 24, 32, 48, 64, 128, 256)])
    extensions = [STUDY / 'client/ClickyBrowserExtension', STUDY / 'profile/HeyClicky Chrome Extension']
    exported = Path(os.environ['LOCALAPPDATA']) / 'HeyClicky/HeyClicky Chrome Extension'
    if (exported / 'manifest.json').exists():
        private_manifest = json.loads((extensions[0] / 'manifest.json').read_text(encoding='utf-8-sig'))
        exported_manifest = json.loads((exported / 'manifest.json').read_text(encoding='utf-8-sig'))
        if (exported_manifest.get('key') == private_manifest.get('key') and
                exported_manifest.get('permissions') == private_manifest.get('permissions')):
            extensions.append(exported)
            saved = STUDY / 'branding-backup/exported-browser-extension'
            if args.install and not saved.exists():
                shutil.copytree(exported, saved)
    actual_extensions = 0
    for index, source in enumerate(extensions):
        if not (source / 'manifest.json').exists():
            continue
        actual_extensions += 1
        destination = BUILD / f'extension-{index}'
        brand_extension(source, destination, image)
        if args.install:
            for file in destination.rglob('*'):
                if file.is_file():
                    replace_file(file, source / file.relative_to(destination))
    executable = STUDY / 'client/AllyStudy.exe'
    staged_exe = BUILD / 'AllyStudy.exe'
    shutil.copyfile(executable, staged_exe)
    patch_executable_icon(staged_exe, ico)
    if args.install:
        backup = STUDY / 'branding-backup'
        backup.mkdir(exist_ok=True)
        for target in (executable, STUDY / 'client/Assets/AppIcon.ico'):
            saved = backup / (target.name + '.before-identity')
            if not saved.exists():
                shutil.copyfile(target, saved)
        replace_file(ico, STUDY / 'client/Assets/AppIcon.ico')
        replace_file(ico, STUDY / 'client/Ally.ico')
        replace_file(SOURCE, STUDY / 'client/Assets/Logos/heyclicky-logo.png')
        if args.install_exe:
            replace_file(staged_exe, executable)
    receipt = {'extensionCopies': actual_extensions, 'installed': args.install,
               'executableInstalled': args.install_exe, 'sourceIconHash': digest(SOURCE),
               'iconHash': digest(ico), 'nativeCodePreserved': True,
               'extensionIdentityAndPermissionsPreserved': True}
    (BUILD / 'verification.json').write_text(json.dumps(receipt, indent=2))
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
