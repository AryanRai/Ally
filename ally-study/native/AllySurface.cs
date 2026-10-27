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

        sealed class HomeTarget { public object Host; public Uri Page; }
        static readonly System.Runtime.CompilerServices.ConditionalWeakTable<object, HomeTarget> homeTargets = new System.Runtime.CompilerServices.ConditionalWeakTable<object, HomeTarget>();
        static object warmHomeWeb, warmHomeOwner, warmChatWeb, warmChatOwner;
        static string chatAddress;
        sealed class SoundRetry { public bool Pending; }
        static readonly System.Runtime.CompilerServices.ConditionalWeakTable<object, SoundRetry> soundRetries = new System.Runtime.CompilerServices.ConditionalWeakTable<object, SoundRetry>();
        // Called inside SoundPlayer's existing lock, after its running check.
        // Its previous thread can still be destroying shared XAudio resources.
        public static bool CanStartSoundMixer(object player) {
            var flags = BindingFlags.Instance | BindingFlags.NonPublic;
            Thread previous = (Thread)player.GetType().GetField("mixThread", flags).GetValue(player);
            if (previous == null || !previous.IsAlive) return true;
            SoundRetry retry = soundRetries.GetValue(player, delegate(object key) { return new SoundRetry(); });
            lock (retry) {
                if (!retry.Pending) {
                    retry.Pending = true;
                    ThreadPool.QueueUserWorkItem(delegate {
                        try {
                            bool finished = previous.Join(1000);
                            lock (retry) retry.Pending = false;
                            if (finished) player.GetType().GetMethod("StartIfNeeded", flags).Invoke(player, null);
                        } catch (Exception error) { lock (retry) retry.Pending = false; Log(error); }
                    });
                }
            }
            return false;
        }
        static void DetachWeb(object web) {
            object parent = web.GetType().GetProperty("Parent").GetValue(web, null);
            if (parent == null) return;
            object children = parent.GetType().GetProperty("Children").GetValue(parent, null);
            children.GetType().GetMethod("Remove").Invoke(children, new object[] { web });
        }
        static void WatchVisibility(object owner, string loaded, string unloaded) {
            foreach (string name in new string[] { "Loaded", "Unloaded" }) {
                EventInfo change = owner.GetType().GetEvent(name);
                change.AddEventHandler(owner, Delegate.CreateDelegate(change.EventHandlerType, typeof(Surface).GetMethod(name == "Loaded" ? loaded : unloaded, BindingFlags.Static | BindingFlags.NonPublic)));
            }
        }
        static void NotifyVisibility(object web, bool visible) {
            if (web == null) return;
            try {
                object core = web.GetType().GetProperty("CoreWebView2").GetValue(web, null);
                if (core != null) core.GetType().GetMethod("ExecuteScriptAsync").Invoke(core, new object[] {
                    "window.__allySurfaceVisible=" + (visible ? "true" : "false") + ";window.dispatchEvent(new Event('ally-surface-visibility'));"
                });
            } catch (Exception error) { Log(error); }
        }
        static void HomeLoaded(object sender, object args) { if (Object.ReferenceEquals(sender, warmHomeOwner)) NotifyVisibility(warmHomeWeb, !suppressed); }
        static void HomeUnloaded(object sender, object args) { if (Object.ReferenceEquals(sender, warmHomeOwner)) NotifyVisibility(warmHomeWeb, false); }
        static void ChatLoaded(object sender, object args) { if (Object.ReferenceEquals(sender, warmChatOwner)) NotifyVisibility(warmChatWeb, !suppressed); }
        static void ChatUnloaded(object sender, object args) { if (Object.ReferenceEquals(sender, warmChatOwner)) NotifyVisibility(warmChatWeb, false); }
        public static object TakeChatWeb() {
            // A WinUI WebView's compositor belongs to its XAML owner. Moving the
            // same control between newly constructed Chat views can leave its
            // controller alive but its surface blank. Drafts live in the page's
            // durable store, so give each Chat owner its own control.
            if (warmChatOwner != null) {
                foreach (string name in new string[] { "GotFocus", "LostFocus" }) {
                    EventInfo change = warmChatWeb.GetType().GetEvent(name);
                    MethodInfo handler = warmChatOwner.GetType().GetMethod(name == "GotFocus" ? "AllyGotFocus" : "AllyLostFocus", BindingFlags.Instance | BindingFlags.NonPublic);
                    change.RemoveEventHandler(warmChatWeb, Delegate.CreateDelegate(change.EventHandlerType, warmChatOwner, handler));
                }
            }
            warmChatOwner = null;
            if (warmChatWeb != null) {
                DetachWeb(warmChatWeb);
                try { warmChatWeb.GetType().GetMethod("Close").Invoke(warmChatWeb, null); } catch (Exception error) { Log(error); }
            }
            warmChatWeb = Activator.CreateInstance(Assembly.Load("Microsoft.WinUI").GetType("Microsoft.UI.Xaml.Controls.WebView2", true));
            chatAddress = null;
            return warmChatWeb;
        }
        public static void BindChatWeb(object owner, object web) {
            warmChatOwner = owner; warmChatWeb = web;
            WatchVisibility(owner, "ChatLoaded", "ChatUnloaded");
            NotifyVisibility(web, true);
        }
        public static void NavigateChatWeb(object web, Uri page) {
            if (chatAddress == page.AbsoluteUri) return;
            web.GetType().GetProperty("Source").SetValue(web, page, null);
            chatAddress = page.AbsoluteUri;
        }
        // The default Home body is a tiny selected-chat preview; the original
        // native tab switcher, keyboard ownership and full Chat view stay native.
        public static void AttachHome(object home, object host) {
            try {
                string address = Environment.GetEnvironmentVariable("ALLY_NOTCH_URL");
                Uri page;
                if (!Uri.TryCreate(address, UriKind.Absolute, out page) || page.Scheme != "http" || page.Host != "127.0.0.1" || page.AbsolutePath != "/notch/") return;
                var builder = new UriBuilder(page); builder.Path = "/notch/home.html"; builder.Query = ""; page = builder.Uri;
                Type webType = home.GetType().BaseType.Assembly.GetType("Microsoft.UI.Xaml.Controls.WebView2", true);
                object web = warmHomeWeb ?? Activator.CreateInstance(webType);
                webType.GetProperty("Height").SetValue(web, 238.0, null);
                PropertyInfo background = webType.GetProperty("DefaultBackgroundColor");
                if (background != null) {
                    object color = Activator.CreateInstance(background.PropertyType);
                    foreach (var channel in new string[] { "A", "R", "G", "B" }) {
                        byte value = channel == "A" ? (byte)255 : channel == "R" ? (byte)16 : channel == "G" ? (byte)17 : (byte)20;
                        FieldInfo field = background.PropertyType.GetField(channel);
                        if (field != null) field.SetValue(color, value);
                    }
                    background.SetValue(web, color, null);
                }
                HomeTarget target;
                if (!homeTargets.TryGetValue(web, out target)) {
                    target = new HomeTarget { Host = host, Page = page }; homeTargets.Add(web, target);
                    EventInfo message = webType.GetEvent("WebMessageReceived");
                    message.AddEventHandler(web, Delegate.CreateDelegate(message.EventHandlerType, typeof(Surface).GetMethod("OnHomeWebMessage", BindingFlags.Static | BindingFlags.NonPublic)));
                    webType.GetProperty("Source").SetValue(web, page, null);
                } else { target.Host = host; }
                warmHomeWeb = web; warmHomeOwner = home;
                DetachWeb(web);
                WatchVisibility(home, "HomeLoaded", "HomeUnloaded");
                object rows = home.GetType().GetProperty("RowDefinitions").GetValue(home, null);
                rows.GetType().GetMethod("Clear").Invoke(rows, null);
                object children = home.GetType().GetProperty("Children").GetValue(home, null);
                children.GetType().GetMethod("Clear").Invoke(children, null);
                children.GetType().GetMethod("Add").Invoke(children, new object[] { web });
                NotifyVisibility(web, true);
            } catch (Exception error) { Log(error); }
        }
        static void OnHomeWebMessage(object sender, object args) {
            try {
                HomeTarget target;
                if (!homeTargets.TryGetValue(sender, out target)) return;
                Uri source;
                string address = (string)args.GetType().GetProperty("Source").GetValue(args, null);
                if (!Uri.TryCreate(address, UriKind.Absolute, out source) || source.GetLeftPart(UriPartial.Path) != target.Page.GetLeftPart(UriPartial.Path) || source.Query != target.Page.Query) return;
                string command = (string)args.GetType().GetMethod("TryGetWebMessageAsString").Invoke(args, null);
                if (command != "ally:chat") return;
                object services = target.Host.GetType().GetProperty("Services").GetValue(target.Host, null);
                object presenter = services.GetType().GetProperty("Presenter").GetValue(services, null);
                object tabs = presenter.GetType().GetProperty("Tabs").GetValue(presenter, null);
                tabs.GetType().GetMethod("ShowChatForTyping").Invoke(tabs, new object[] { true });
            } catch (Exception error) { Log(error); }
        }

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
                AttachStudyCaptions();
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
                            Send("STUDY_BOUND " + (captionCanvas != null ? "1" : "0"));
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
                                else if (line.StartsWith("HANDOFF ")) {
                                    pendingHandoff = line.Substring(8);
                                    PostMessage(window, SurfaceMessage, new IntPtr(5), IntPtr.Zero);
                                }
                                else if (line.StartsWith("STUDY ")) {
                                    studyQueue.Enqueue(line.Substring(6));
                                    PostMessage(window, SurfaceMessage, new IntPtr(4), IntPtr.Zero);
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
            if (wparam.ToInt64() == 4) { string request; while (studyQueue.TryDequeue(out request)) SubmitStudy(request); return; }
            if (wparam.ToInt64() == 5) { ApplyHandoff(lparam.ToInt64() == 1); return; }
            try {
                if (suppressed) {
                    NotifyVisibility(warmHomeWeb, false); NotifyVisibility(warmChatWeb, false);
                    object host = notch.GetType().GetProperty("Window").GetValue(notch, null);
                    host.GetType().GetMethod("HideWindow", Type.EmptyTypes).Invoke(host, null);
                    Send("HIDDEN");
                } else {
                    notch.GetType().GetMethod("FollowCursorDisplay").Invoke(notch, null);
                    notch.GetType().GetMethod("Show").Invoke(notch, null);
                    foreach (object owner in new object[] { warmHomeOwner, warmChatOwner }) {
                        if (owner == null) continue;
                        PropertyInfo loaded = owner.GetType().GetProperty("IsLoaded");
                        if (loaded != null && (bool)loaded.GetValue(owner, null)) NotifyVisibility(Object.ReferenceEquals(owner, warmHomeOwner) ? warmHomeWeb : warmChatWeb, true);
                    }
                    RefreshBounds();
                    Send("SHOWN");
                }
            } catch (Exception error) { Log(error); }
        }
        static readonly System.Collections.Concurrent.ConcurrentQueue<string> settingsQueue = new System.Collections.Concurrent.ConcurrentQueue<string>();
        static readonly System.Collections.Concurrent.ConcurrentQueue<string> studyQueue = new System.Collections.Concurrent.ConcurrentQueue<string>();
        static object realCompanion, captionCanvas;
        public static void BindStudy(object companion) { realCompanion = companion; AttachStudyCaptions(); }
        static object Companion() {
            if (realCompanion != null) return realCompanion;
            object services = notch.GetType().GetProperty("Services", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).GetValue(notch, null);
            return services.GetType().GetProperty("Companion").GetValue(services, null);
        }
        static void AttachStudyCaptions() {
            try {
                object companion = Companion();
                foreach (FieldInfo field in companion.GetType().GetFields(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)) {
                    if (!field.FieldType.FullName.Contains("ScreenDrawingCanvas")) continue;
                    object canvas = field.GetValue(companion);
                    if (canvas == null || Object.ReferenceEquals(canvas, captionCanvas)) continue;
                    EventInfo caption = canvas.GetType().GetEvent("CaptionChanged");
                    if (caption != null) { caption.AddEventHandler(canvas, new EventHandler<string>(delegate(object sender, string words) {
                        words = words ?? "";
                        if (words.Length <= 1200) Send("STUDY_CAPTION " + Encode(words));
                    })); captionCanvas = canvas; Send("STUDY_BOUND 1"); }
                    break;
                }
            } catch (Exception error) { Log(error); }
        }
        static readonly System.Collections.Concurrent.ConcurrentDictionary<string, double[]> studyDisplays = new System.Collections.Concurrent.ConcurrentDictionary<string, double[]>();
        static object StudyField(object instance, string name) {
            return instance.GetType().GetField(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).GetValue(instance);
        }
        // Called once when the native turn chooses its drawing frame. Do not follow
        // the cursor here: it may have moved onto Ally on another display.
        public static object SelectStudyFrame(object fallback, object turn) {
            object request = StudyField(StudyField(turn, "CS$<>8__locals1"), "request");
            string trigger = (string)request.GetType().GetProperty("Trigger").GetValue(request, null);
            if (trigger == null || !trigger.StartsWith("ally-selection:", StringComparison.Ordinal)) return fallback;
            double[] bounds;
            if (!studyDisplays.TryRemove(trigger, out bounds)) throw new IOException("This selection lost its display. Select the area again.");
            if (bounds.Length == 0) return fallback; // Text-only Study question.
            object capture = StudyField(turn, "capture");
            var frames = (System.Collections.IEnumerable)capture.GetType().GetProperty("Frames").GetValue(capture, null);
            object match = null;
            foreach (object frame in frames) {
                object display = frame.GetType().GetProperty("Display").GetValue(frame, null);
                object rect = display.GetType().GetProperty("BoundsPx").GetValue(display, null);
                string[] keys = { "X", "Y", "Width", "Height" };
                bool same = true;
                for (int i = 0; i < keys.Length; i++) same &= Math.Abs(Convert.ToDouble(rect.GetType().GetProperty(keys[i]).GetValue(rect, null)) - bounds[i]) <= 1;
                if (same) { if (match != null) throw new IOException("The selected display is ambiguous. Select the area again."); match = frame; }
            }
            if (match == null) throw new IOException("The selected display changed. Select the area again.");
            return match;
        }
        static void SubmitStudy(string id) {
            if (!System.Text.RegularExpressions.Regex.IsMatch(id, "^[a-f0-9-]{36}$")) return;
            try {
                string profile = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "..", "profile"));
                string input = Path.Combine(profile, "study-inputs", id + ".input");
                if (DateTime.UtcNow - File.GetLastWriteTimeUtc(input) > TimeSpan.FromMinutes(2)) throw new IOException("This selection expired. Select the area again.");
                string accepted = input + ".accepted";
                File.Move(input, accepted);
                string[] lines;
                try { lines = File.ReadAllLines(accepted); } finally { File.Delete(accepted); }
                if (lines.Length != 3) throw new IOException("Invalid Study input. Select the area again.");
                string words = Decode(lines[0]), image = Decode(lines[1]);
                string geometry = Decode(lines[2]);
                double[] bounds = geometry.Length == 0 ? new double[0] : Array.ConvertAll(geometry.Split(','), value => double.Parse(value, System.Globalization.CultureInfo.InvariantCulture));
                if ((image.Length > 0 && bounds.Length != 4) || (bounds.Length != 0 && (bounds.Length != 4 || Array.Exists(bounds, value => double.IsNaN(value) || double.IsInfinity(value)) || bounds[2] <= 0 || bounds[3] <= 0))) throw new IOException("Invalid Study display. Select the area again.");
                if (words.Length == 0 || words.Length > 12000 || (image.Length > 0 && !File.Exists(image))) throw new IOException("This selection expired. Select the area again.");
                object companion = Companion();
                MethodInfo submit = null;
                foreach (MethodInfo method in companion.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic))
                    if (method.Name == "SubmitTextAsync" && method.GetParameters().Length == 4) submit = method;
                if (submit == null) throw new IOException("Update Ally Study to use shared selection.");
                string trigger = "ally-selection:" + id;
                studyDisplays[trigger] = bounds;
                System.Threading.Tasks.Task task;
                try { task = (System.Threading.Tasks.Task)submit.Invoke(companion, new object[] { words, (bool?)true, trigger, image.Length > 0 ? new string[] { image } : new string[0] }); }
                catch { double[] removed; studyDisplays.TryRemove(trigger, out removed); throw; }
                Send("STUDY_ACCEPTED " + id);
                task.ContinueWith(delegate(System.Threading.Tasks.Task completed) { double[] removed; studyDisplays.TryRemove(trigger, out removed); if (completed.IsFaulted) Log(completed.Exception.GetBaseException()); });
            } catch (Exception error) { Log(error); Send("STUDY_ERROR " + id + " " + Encode(error.GetBaseException().Message)); }
        }
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
        static string pendingHandoff;
        static int handoffRevision;
        static bool handoffOpenedPeek;
        static void ApplyHandoff(bool replay) {
            if (suppressed || notch == null) return;
            try {
                string json = Decode(pendingHandoff ?? "");
                if (json.Length == 0 || json.Length > 1024) return;
                object services = notch.GetType().GetProperty("Services", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).GetValue(notch, null);
                object presenter = services.GetType().GetProperty("Presenter").GetValue(services, null);
                // Voice, text entry and onboarding retain native presentation priority.
                foreach (Type contract in presenter.GetType().GetInterfaces()) if (contract.FullName == "HeyClicky.INotchPresenter") {
                    object current = contract.GetProperty("Presentation").GetValue(presenter, null);
                    if (json != "null" && current != null && current.GetType().Name != "Idle" &&
                        (ownPresentation == null || !current.Equals(ownPresentation))) return;
                }
                PropertyInfo showing = presenter.GetType().GetProperty("IsShowingNotchAgentPeek");
                bool open = showing != null && (bool)showing.GetValue(presenter, null);
                if (json != "null" && !open) {
                    // Use the native presenter's normal expansion request, never simulated input.
                    presenter.GetType().GetMethod("OpenNotchAgentPeekOnRequest").Invoke(presenter, null);
                    handoffOpenedPeek = true;
                }
                foreach (object web in new object[] { warmHomeWeb, warmChatWeb }) {
                    if (web == null) continue;
                    object core = web.GetType().GetProperty("CoreWebView2").GetValue(web, null);
                    if (core != null) core.GetType().GetMethod("ExecuteScriptAsync").Invoke(core, new object[] {
                        "window.__allyHandoff=" + json + ";window.dispatchEvent(new CustomEvent('ally-handoff',{detail:window.__allyHandoff}));"
                    });
                }
                if(json == "null" && handoffOpenedPeek) {
                    PropertyInfo hovering=presenter.GetType().GetProperty("IsHovering");
                    if(hovering==null||!(bool)hovering.GetValue(presenter,null))presenter.GetType().GetMethod("DismissNotchAgentPeek").Invoke(presenter,null);
                    handoffOpenedPeek=false;
                }
                int revision=++handoffRevision;
                // The Home webview can be warming during expansion; replay latest state once.
                if(json != "null" && !replay) ThreadPool.QueueUserWorkItem(delegate {
                    Thread.Sleep(350);if(revision==handoffRevision)PostMessage(window,SurfaceMessage,new IntPtr(5),new IntPtr(1));
                });
            } catch(Exception error) { Log(error); }
        }
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
