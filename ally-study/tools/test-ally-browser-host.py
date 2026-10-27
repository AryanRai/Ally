"""Exercise the compiled launcher against an isolated echo worker, not Chrome."""
import json
import os
from pathlib import Path
import queue
import shutil
import struct
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[2]
WORKER = r'''
using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
class Worker {
    static void Main(string[] args) {
        var output = Console.OpenStandardOutput();
        var json = new JavaScriptSerializer().Serialize(new {
            root = Environment.GetEnvironmentVariable("HEYCLICKY_DATA_DIR"), args = args });
        var bytes = Encoding.UTF8.GetBytes(json);
        output.Write(BitConverter.GetBytes(bytes.Length), 0, 4);
        output.Write(bytes, 0, bytes.Length); output.Flush();
        var input = Console.OpenStandardInput(); var buffer = new byte[4096];
        int n; while ((n = input.Read(buffer, 0, buffer.Length)) > 0) {
            output.Write(buffer, 0, n); output.Flush();
        }
    }
}
'''


def main():
    build = ROOT / '.local/browser-host-build/ClickyBrowserHost.exe'
    if not build.exists():
        raise RuntimeError('Stage apply-ally-browser-host.ps1 first')
    compiler = Path(os.environ['WINDIR']) / 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    with tempfile.TemporaryDirectory(prefix='ally-host-') as temporary:
        root = Path(temporary)
        client = root / 'client'
        directory = client / 'ClickyBrowserHost'
        directory.mkdir(parents=True)
        (root / 'profile').mkdir()
        (client / 'AllyStudy.exe').touch()
        launcher = directory / 'ClickyBrowserHost.exe'
        shutil.copyfile(build, launcher)
        source = root / 'worker.cs'
        source.write_text(WORKER)
        subprocess.run([str(compiler), '/nologo', '/r:System.Web.Extensions.dll',
                        '/out:' + str(directory / 'ClickyBrowserHost.worker.exe'), str(source)], check=True)
        arguments = ['chrome-extension://fixture/', '--parent-window=0', '', 'space path',
                     'quoted"value', 'trailing\\', '\\"escaped']
        env = dict(os.environ, HEYCLICKY_DATA_DIR=str(root / 'incorrect-inherited-root'))
        process = subprocess.Popen([str(launcher), *arguments], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env,
                                   creationflags=subprocess.CREATE_NO_WINDOW)
        frames = queue.Queue()
        def read():
            try:
                while True:
                    header = process.stdout.read(4)
                    if len(header) != 4:
                        return
                    size = struct.unpack('<I', header)[0]
                    frames.put(process.stdout.read(size))
            except BaseException as error:
                frames.put(error)
        threading.Thread(target=read, daemon=True).start()
        try:
            metadata = json.loads(frames.get(timeout=5))
            assert Path(metadata['root']) == root / 'profile', metadata
            assert metadata['args'] == arguments, metadata
            for payload in (b'{"type":"hello","protocol":1}', bytes(range(256)) * 100):
                frame = struct.pack('<I', len(payload)) + payload
                for start in range(0, len(frame), 37):
                    process.stdin.write(frame[start:start + 37]); process.stdin.flush()
                assert frames.get(timeout=5) == payload, 'Framing changed or buffered until EOF'
            process.stdin.close()
            assert process.wait(timeout=5) == 0, process.stderr.read()
            print('PASS: private profile, argument roundtrip, small/large fragmented frames, immediate flush, EOF cleanup')
        finally:
            if process.poll() is None:
                process.kill(); process.wait()


if __name__ == '__main__':
    main()
