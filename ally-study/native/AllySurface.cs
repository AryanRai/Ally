using System;
using System.Diagnostics;
using System.IO;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;

namespace Ally.Native {
    // This adapter never replaces the compositor or participates in speech/model work.
    public static class Surface {
        const uint SurfaceMessage = 0x8000 + 731;
        static object notch;
        static IntPtr window, hook;
        static volatile bool suppressed;
        static volatile bool connected;
        static StreamWriter writer;
        static readonly object outputLock = new object();
        static MouseProc mouseCallback = OnMouse;
        static Action<uint, IntPtr, IntPtr> rawCallback = OnMessage;
        static bool pressed, requested;
        static POINT origin;
        static volatile int surfaceX, surfaceY, surfaceWidth;
        public static bool IsSuppressed() { return suppressed; }
        public static void ShowNoActivate(object host) { if (!suppressed) host.GetType().GetMethod("ShowNoActivate").Invoke(host, null); }
        public static void ShowActivated(object host) { if (!suppressed) host.GetType().GetMethod("ShowActivated").Invoke(host, null); }

        static void RefreshBounds() {
            try {
                object rect = notch.GetType().GetMethod("SurfaceRectPx").Invoke(notch, null);
                surfaceX = (int)rect.GetType().GetField("Item1").GetValue(rect);
                surfaceY = (int)rect.GetType().GetField("Item2").GetValue(rect);
                surfaceWidth = (int)rect.GetType().GetField("Item3").GetValue(rect);
            } catch { }
        }

        public static void Attach(object view) {
            try {
                if (notch != null) return;
                notch = view;
                window = (IntPtr)view.GetType().GetProperty("WindowHandle").GetValue(view, null);
                object host = view.GetType().GetProperty("Window").GetValue(view, null);
                host.GetType().GetEvent("RawMessage").AddEventHandler(host, rawCallback);
                RefreshBounds();
                var pipeThread = new Thread(Connect); pipeThread.IsBackground = true; pipeThread.Start();
                var mouseThread = new Thread(MouseLoop); mouseThread.IsBackground = true; mouseThread.Start();
            } catch (Exception error) { Log(error); }
        }

        static void Connect() {
            string config = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "glass-pip-chat", "surface-bridge.txt");
            while (true) {
                try {
                    string[] lines = File.ReadAllLines(config);
                    if (lines.Length != 2 || !lines[0].StartsWith("ally-surface-") || lines[1].Length != 64) throw new IOException("Surface configuration unavailable");
                    // Overlapped I/O: a synchronous handle serialises the blocked ReadLine with
                    // every reply, which delayed each acknowledgement until the next command.
                    using (var pipe = new NamedPipeClientStream(".", lines[0], PipeDirection.InOut, PipeOptions.Asynchronous)) {
                        pipe.Connect(2000);
                        using (var input = new StreamReader(pipe))
                        using (var output = new StreamWriter(pipe)) {
                            output.AutoFlush = true;
                            lock (outputLock) { writer = output; output.WriteLine("AUTH " + lines[1]); }
                            connected = true;
                            string line;
                            while ((line = input.ReadLine()) != null) {
                                if (line == "HIDE") { suppressed = true; PostMessage(window, SurfaceMessage, new IntPtr(1), IntPtr.Zero); }
                                else if (line == "NOTCH") { suppressed = false; PostMessage(window, SurfaceMessage, IntPtr.Zero, IntPtr.Zero); }
                                else if (line == "GETSETTINGS" || line.StartsWith("SET ")) {
                                    settingsQueue.Enqueue(line);
                                    PostMessage(window, SurfaceMessage, new IntPtr(3), IntPtr.Zero);
                                }
                                else if (line.StartsWith("PREVIEW ") || line == "IDLE" || line.StartsWith("GREET ")) {
                                    // Latest wins: streaming text replaces any update not yet applied.
                                    pendingPresentation = line;
                                    PostMessage(window, SurfaceMessage, new IntPtr(2), IntPtr.Zero);
                                }
                                else if (line.StartsWith("DRAG ")) {
                                    long handle;
                                    if (long.TryParse(line.Substring(5), out handle) && handle > 0 && (GetAsyncKeyState(1) & 0x8000) != 0) {
                                        PostMessage(window, 0x001f, IntPtr.Zero, IntPtr.Zero); // cancel native press capture
                                        PostMessage(new IntPtr(handle), 0x00a1, new IntPtr(2), IntPtr.Zero);
                                    }
                                }
                            }
                        }
                    }
                } catch (IOException) { }
                  catch (UnauthorizedAccessException) { }
                  catch (Exception error) { Log(error); }
                connected = false;
                lock (outputLock) { writer = null; }
                suppressed = false;
                PostMessage(window, SurfaceMessage, IntPtr.Zero, IntPtr.Zero);
                Thread.Sleep(1500); // disconnected only; no idle UI polling
            }
        }

        static void Send(string line) {
            lock (outputLock) {
                try { if (writer != null) writer.WriteLine(line); }
                catch (IOException) { }
                catch (ObjectDisposedException) { }
            }
        }
        static void OnMessage(uint message, IntPtr wparam, IntPtr lparam) {
            if (message == 0x0047 || message == 0x0005) RefreshBounds();
            if (message != SurfaceMessage) return;
            if (wparam.ToInt64() == 2) { ApplyPresentation(Interlocked.Exchange(ref pendingPresentation, null)); return; }
            if (wparam.ToInt64() == 3) { string request; while (settingsQueue.TryDequeue(out request)) ApplySettings(request); return; }
            try {
                if (suppressed) {
                    object host = notch.GetType().GetProperty("Window").GetValue(notch, null);
                    host.GetType().GetMethod("HideWindow", Type.EmptyTypes).Invoke(host, null);
                    Send("HIDDEN");
                } else {
                    notch.GetType().GetMethod("FollowCursorDisplay").Invoke(notch, null);
                    notch.GetType().GetMethod("Show").Invoke(notch, null);
                    RefreshBounds();
                    Send("SHOWN");
                }
            } catch (Exception error) { Log(error); }
        }
        static readonly System.Collections.Concurrent.ConcurrentQueue<string> settingsQueue = new System.Collections.Concurrent.ConcurrentQueue<string>();
        // Only preferences shown in Ally's combined Settings; account, onboarding and billing stay native.
        static readonly string[] sharedSettings = {
            "VoiceIdentifier", "SpeechSpeed", "TypedTurnsRespondWithVoice", "AgentAnnouncementsVoiceEnabled",
            "ScreenHighlightEnabled", "CursorColorHex", "CursorDocked", "ShowInScreenRecordings", "ShowInTaskbar",
            "DrawingSoundsEnabled", "DrawingVoiceCaptions", "DrawingPenSoundsEnabled", "StreamMode",
        };

        static string Encode(string value) { return Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes(value)); }

        static void ApplySettings(string line) {
            try {
                object services = notch.GetType().GetProperty("Services", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).GetValue(notch, null);
                object settings = services.GetType().GetProperty("Settings").GetValue(services, null);
                PropertyInfo storeProperty = settings.GetType().GetProperty("Store", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                if (storeProperty == null) { Send("SETTINGS " + Encode("{}")); return; }
                object store = storeProperty.GetValue(settings, null);
                if (line.StartsWith("SET ")) {
                    string[] parts = line.Split(' ');
                    if (parts.Length == 3 && Array.IndexOf(sharedSettings, parts[1]) >= 0) {
                        object current = store.GetType().GetProperty("Current").GetValue(store, null);
                        PropertyInfo target = current.GetType().GetProperty(parts[1]);
                        string raw = Decode(parts[2]);
                        object value = target.PropertyType == typeof(bool) ? (object)(raw == "true")
                            : target.PropertyType == typeof(double) ? (object)double.Parse(raw, System.Globalization.CultureInfo.InvariantCulture)
                            : (object)raw;
                        if (target.PropertyType == typeof(double)) value = Math.Max(0.5, Math.Min(2.0, (double)value));
                        Action<object> update = delegate(object s) { target.SetValue(s, value, null); };
                        store.GetType().GetMethod("Update").Invoke(store, new object[] { update });
                    }
                }
                object snapshot = store.GetType().GetProperty("Current").GetValue(store, null);
                var json = new System.Text.StringBuilder("{");
                foreach (string name in sharedSettings) {
                    PropertyInfo property = snapshot.GetType().GetProperty(name);
                    if (property == null) continue;
                    object value = property.GetValue(snapshot, null);
                    if (json.Length > 1) json.Append(',');
                    json.Append('"').Append(name).Append("\":");
                    if (value is bool) json.Append((bool)value ? "true" : "false");
                    else if (value is double) json.Append(((double)value).ToString(System.Globalization.CultureInfo.InvariantCulture));
                    else json.Append('"').Append(Convert.ToString(value).Replace("\\", "\\\\").Replace("\"", "\\\"")).Append('"');
                }
                Send("SETTINGS " + Encode(json.Append('}').ToString()));
            } catch (Exception error) { Log(error); Send("SETTINGS " + Encode("{}")); }
        }

        static string pendingPresentation;
        static object ownPresentation;

        static string Decode(string value) {
            try { return System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(value)); } catch { return ""; }
        }

        // Desktop-owned previews only replace the idle notch or Ally's previous preview;
        // voice, typing, onboarding and other native states keep priority.
        static void ApplyPresentation(string line) {
            if (line == null || suppressed || notch == null) return;
            try {
                object services = notch.GetType().GetProperty("Services", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).GetValue(notch, null);
                object presenter = services.GetType().GetProperty("Presenter").GetValue(services, null);
                Type contract = null;
                foreach (Type candidate in presenter.GetType().GetInterfaces()) if (candidate.FullName == "HeyClicky.INotchPresenter") contract = candidate;
                if (contract == null) return;
                object current = contract.GetProperty("Presentation").GetValue(presenter, null);
                bool owned = current != null && (current.GetType().Name == "Idle" || (ownPresentation != null && current.Equals(ownPresentation)));
                if (line == "IDLE") {
                    if (owned && (bool)contract.GetProperty("IsHovering").GetValue(presenter, null)) {
                        // The user is reading the expanded preview; collapse after they leave.
                        ThreadPool.QueueUserWorkItem(delegate { Thread.Sleep(2000); if (Interlocked.CompareExchange(ref pendingPresentation, "IDLE", null) == null) PostMessage(window, SurfaceMessage, new IntPtr(2), IntPtr.Zero); });
                        return;
                    }
                    if (owned && current.GetType().Name != "Idle") contract.GetMethod("ReturnToIdle").Invoke(presenter, null);
                    ownPresentation = null;
                    return;
                }
                if (!owned) return;
                Assembly contracts = contract.Assembly;
                if (line.StartsWith("GREET ")) {
                    string label = Decode(line.Substring(6)).Trim();
                    if (label.Length == 0 || current.GetType().Name != "Idle") return;
                    Type status = contracts.GetType("HeyClicky.NotchLiveEvent+ActivityCustomStatus");
                    object liveEvent = Activator.CreateInstance(status, label);
                    MethodInfo show = presenter.GetType().GetMethod("ShowLiveEvent");
                    if (show != null) show.Invoke(presenter, new object[] { liveEvent, (TimeSpan?)TimeSpan.FromSeconds(4) });
                    else contract.GetMethod("Present").Invoke(presenter, new object[] { Activator.CreateInstance(contracts.GetType("HeyClicky.NotchPresentation+LiveEvent"), liveEvent) });
                    ownPresentation = contract.GetProperty("Presentation").GetValue(presenter, null);
                    return;
                }
                string[] parts = line.Split(' ');
                if (parts.Length != 4) return;
                object response = Activator.CreateInstance(contracts.GetType("HeyClicky.NotchPresentation+TextResponse"), Decode(parts[2]), Decode(parts[3]), parts[1] == "1");
                contract.GetMethod("Present").Invoke(presenter, new object[] { response });
                ownPresentation = response;
            } catch (Exception error) { Log(error); }
        }

        static void MouseLoop() {
            hook = SetWindowsHookEx(14, mouseCallback, GetModuleHandle(null), 0);
            if (hook == IntPtr.Zero) { Log(new IOException("Native drag hook could not be installed")); return; }
            try { MSG message; while (GetMessage(out message, IntPtr.Zero, 0, 0) > 0) { TranslateMessage(ref message); DispatchMessage(ref message); } }
            finally { UnhookWindowsHookEx(hook); }
        }
        static IntPtr OnMouse(int code, IntPtr message, IntPtr data) {
            if (code >= 0 && connected && !suppressed) {
                int kind = message.ToInt32();
                if (kind != 0x0201 && (!pressed || (kind != 0x0200 && kind != 0x0202))) return CallNextHookEx(hook, code, message, data);
                var info = (MOUSE)dataToStructure(data);
                if (kind == 0x0201) {
                    pressed = false; requested = false;
                    if (GetAncestor(WindowFromPoint(info.pt), 2) == window) {
                        try {
                            int x = surfaceX, y = surfaceY, width = surfaceWidth;
                            uint dpi = GetDpiForWindow(window); if (dpi == 0) dpi = 96;
                            int grab = (int)(32 * dpi / 96);
                            // Only the middle of the native top strip starts a drag.
                            // Chat text, tab buttons, resizing and file drops retain their own gestures.
                            if (width > 0 && info.pt.y >= y && info.pt.y <= y + grab && Math.Abs(info.pt.x - (x + width / 2)) <= Math.Min(width / 2, grab * 3)) {
                                origin = info.pt; pressed = true;
                            }
                        } catch { }
                    }
                } else if (kind == 0x0202) { pressed = false; }
                else if (kind == 0x0200 && pressed && !requested) {
                    uint dpi = GetDpiForWindow(window); if (dpi == 0) dpi = 96;
                    int distance = (int)(14 * dpi / 96);
                    if (Math.Abs(info.pt.x - origin.x) >= distance || Math.Abs(info.pt.y - origin.y) >= distance) {
                        requested = true; pressed = false;
                        POINT point = info.pt;
                        ThreadPool.QueueUserWorkItem(delegate { Send("DETACH " + point.x + " " + point.y); });
                    }
                }
            }
            return CallNextHookEx(hook, code, message, data);
        }
        static object dataToStructure(IntPtr pointer) { return Marshal.PtrToStructure(pointer, typeof(MOUSE)); }
        static void Log(Exception error) {
            try { File.AppendAllText(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "ally-surface.log"), DateTime.UtcNow.ToString("o") + " " + error.GetType().Name + ": " + error.Message + Environment.NewLine); } catch { }
        }
        delegate IntPtr MouseProc(int code, IntPtr message, IntPtr data);
        [StructLayout(LayoutKind.Sequential)] struct POINT { public int x, y; }
        [StructLayout(LayoutKind.Sequential)] struct MOUSE { public POINT pt; public uint mouseData, flags, time; public UIntPtr extra; }
        [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public UIntPtr wparam; public IntPtr lparam; public uint time; public POINT pt; public uint reserved; }
        [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int kind, MouseProc callback, IntPtr module, uint thread);
        [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hook);
        [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr message, IntPtr data);
        [DllImport("user32.dll")] static extern int GetMessage(out MSG message, IntPtr hwnd, uint first, uint last);
        [DllImport("user32.dll")] static extern bool TranslateMessage(ref MSG message);
        [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref MSG message);
        [DllImport("user32.dll")] static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wparam, IntPtr lparam);
        [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT point);
        [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
        [DllImport("user32.dll")] static extern uint GetDpiForWindow(IntPtr hwnd);
        [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
        [DllImport("kernel32.dll", CharSet = CharSet.Auto)] static extern IntPtr GetModuleHandle(string name);
    }
}
