using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using System.IO.Pipes;
using System.Web.Script.Serialization;
using System.Collections.Generic;
using System.Threading;

// Chrome starts native messaging hosts outside Ally's process tree, so they do
// not inherit its private data directory. Keep the shipped protocol worker
// unchanged and give only that child the profile belonging to this copy.
internal static class AllyBrowserHost
{
    private const int MaxFrame = 8 * 1024 * 1024;
    private static readonly object ChromeGate = new object(), DesktopGate = new object();
    private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxFrame };
    private static StreamWriter desktopWriter;
    private static string hello;
    private static volatile bool finished;
    private static Dictionary<string, object> ReadObject(string raw) { lock (Json) return Json.Deserialize<Dictionary<string, object>>(raw); }
    private static byte[] ReadFrame(Stream input) {
        var header = new byte[4]; int count = input.Read(header, 0, 4);
        if (count == 0) return null;
        while (count < 4) { int next = input.Read(header, count, 4 - count); if (next == 0) throw new IOException("Incomplete native frame."); count += next; }
        int size = BitConverter.ToInt32(header, 0);
        if (size <= 0 || size > MaxFrame) throw new IOException("Native frame too large.");
        var body = new byte[size]; count = 0;
        while (count < size) { int next = input.Read(body, count, size - count); if (next == 0) throw new IOException("Incomplete native frame."); count += next; }
        return body;
    }
    private static void Frame(Stream output, byte[] body, object gate) {
        lock (gate) { var header = BitConverter.GetBytes(body.Length); output.Write(header, 0, 4); output.Write(body, 0, body.Length); output.Flush(); }
    }
    private static void Desktop(string raw) { lock (DesktopGate) { try { if (desktopWriter != null) desktopWriter.WriteLine(raw); } catch { desktopWriter = null; } } }
    private static void ConnectDesktop(string profile, Stream chrome) {
        while (!finished) {
            try {
                string[] config = File.ReadAllLines(Path.Combine(profile, "browser-agent-bridge.txt"));
                if (config.Length != 2 || !System.Text.RegularExpressions.Regex.IsMatch(config[0], "^ally-browser-[a-f0-9]{32}$") || !System.Text.RegularExpressions.Regex.IsMatch(config[1], "^[a-f0-9]{64}$")) throw new IOException("Invalid browser bridge.");
                using (var pipe = new NamedPipeClientStream(".", config[0], PipeDirection.InOut, PipeOptions.Asynchronous)) {
                    pipe.Connect(1000);
                    var writer = new StreamWriter(pipe, new UTF8Encoding(false)) { AutoFlush = true };
                    var reader = new StreamReader(pipe, Encoding.UTF8);
                    lock (DesktopGate) { writer.WriteLine("AUTH " + config[1]); desktopWriter = writer; if (hello != null) writer.WriteLine(hello); }
                    string line;
                    while (!finished && (line = reader.ReadLine()) != null) {
                        if (line.Length > MaxFrame) throw new IOException("Browser command too large.");
                        var message = ReadObject(line);
                        object id, type;
                        if (!message.TryGetValue("id", out id) || !(id is string) || !((string)id).StartsWith("ally-mcp-", StringComparison.Ordinal) || !message.TryGetValue("type", out type) || (string)type != "command") throw new IOException("Invalid browser command.");
                        Frame(chrome, Encoding.UTF8.GetBytes(line), ChromeGate);
                    }
                }
            } catch { /* Main app may be restarting. No command is retried. */ }
            finally { lock (DesktopGate) desktopWriter = null; }
            if (!finished) Thread.Sleep(1500);
        }
    }
    private static async Task Pump(Stream input, Stream output)
    {
        var buffer = new byte[8192];
        int count;
        while ((count = await input.ReadAsync(buffer, 0, buffer.Length)) != 0)
        {
            await output.WriteAsync(buffer, 0, count);
            // Process pipe streams buffer writes: hello must reach the worker
            // immediately, while Chrome keeps its input pipe open.
            await output.FlushAsync();
        }
    }

    private static string Quote(string value)
    {
        var result = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            result.Append('\\', c == '"' ? slashes * 2 + 1 : slashes);
            result.Append(c);
            slashes = 0;
        }
        result.Append('\\', slashes * 2);
        return result.Append('"').ToString();
    }

    private static int Main(string[] args)
    {
        try
        {
            string directory = AppDomain.CurrentDomain.BaseDirectory;
            string client = Path.GetFullPath(Path.Combine(directory, ".."));
            string profile = Path.GetFullPath(Path.Combine(client, "..", "profile"));
            string worker = Path.Combine(directory, "ClickyBrowserHost.worker.exe");
            if (!File.Exists(Path.Combine(client, "AllyStudy.exe")) ||
                !Directory.Exists(profile) || !File.Exists(worker))
                throw new IOException("Ally browser host installation is incomplete.");
            var arguments = new StringBuilder();
            foreach (string arg in args) arguments.Append(Quote(arg)).Append(' ');
            var start = new ProcessStartInfo(worker, arguments.ToString());
            start.UseShellExecute = false;
            start.CreateNoWindow = true;
            start.WorkingDirectory = directory;
            start.RedirectStandardInput = true;
            start.RedirectStandardOutput = true;
            start.RedirectStandardError = true;
            start.EnvironmentVariables["HEYCLICKY_DATA_DIR"] = profile;
            using (var child = Process.Start(start))
            {
                var chrome = Console.OpenStandardOutput();
                var desktop = Task.Factory.StartNew(() => ConnectDesktop(profile, chrome), TaskCreationOptions.LongRunning);
                var input = Task.Factory.StartNew(() => {
                    try {
                        var chromeInput = Console.OpenStandardInput();
                        byte[] body;
                        while ((body = ReadFrame(chromeInput)) != null) {
                            string raw = Encoding.UTF8.GetString(body); var value = ReadObject(raw); object type, id;
                            value.TryGetValue("type", out type); value.TryGetValue("id", out id);
                            if ((string)type == "hello") { lock (DesktopGate) hello = raw; Desktop(raw); }
                            if ((string)type == "stop") Desktop(raw);
                            if ((string)type == "result" && id is string && ((string)id).StartsWith("ally-mcp-", StringComparison.Ordinal)) { Desktop(raw); continue; }
                            Frame(child.StandardInput.BaseStream, body, child.StandardInput);
                        }
                    } catch (Exception inputError) { Console.Error.WriteLine("Ally browser input stopped: " + inputError.GetType().Name); }
                    finally { finished = true; try { child.StandardInput.Close(); } catch { } }
                }, TaskCreationOptions.LongRunning);
                var output = Task.Factory.StartNew(() => { byte[] body; while ((body = ReadFrame(child.StandardOutput.BaseStream)) != null) Frame(chrome, body, ChromeGate); }, TaskCreationOptions.LongRunning);
                var error = Pump(child.StandardError.BaseStream, Console.OpenStandardError());
                child.WaitForExit();
                finished = true;
                Task.WaitAll(output, error);
                return child.ExitCode;
            }
        }
        catch (Exception)
        {
            // stdout belongs exclusively to length-prefixed native messages.
            Console.Error.WriteLine("Ally browser host could not start its private worker.");
            return 1;
        }
    }
}
