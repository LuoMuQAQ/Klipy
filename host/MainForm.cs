using System.Drawing;
using System.Runtime.InteropServices;
using System.Text.Json;
using AuthenticatorBackend;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace AuthenticatorHost;

public sealed class MainForm : Form
{
    private const int ClientWidth = 400;
    private const int ClientHeight = 620;
    private const int WM_NCLBUTTONDBLCLK = 0x00A3;
    private const int WM_NCRBUTTONDOWN = 0x00A4;
    private const int WM_NCRBUTTONUP = 0x00A5;
    private const int WM_GETMINMAXINFO = 0x0024;
    private const int WM_SYSCOMMAND = 0x0112;
    private const int WM_CONTEXTMENU = 0x007B;
    private const int SC_MAXIMIZE = 0xF030;
    private const int SC_RESTORE = 0xF120;
    private const int SC_MOUSEMENU = 0xF090;
    private const int SC_KEYMENU = 0xF100;

    private readonly WebView2 _webView = new() { Dock = DockStyle.Fill };
    private readonly AccountStore _store = new();
    private readonly bool _devMode;

    public MainForm()
    {
        _devMode = !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("AUTHENTICATOR_DEV_URL"));

        AutoScaleMode = AutoScaleMode.Dpi;
        FormBorderStyle = FormBorderStyle.None;
        MaximizeBox = false;
        MinimizeBox = false;
        ControlBox = false;
        ShowInTaskbar = true;
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(0xF5, 0xF7, 0xFA);
        Text = "身份验证器";
        ClientSize = new Size(ClientWidth, ClientHeight);
        Padding = new Padding(0);

        _webView.DefaultBackgroundColor = Color.FromArgb(255, 0xF5, 0xF7, 0xFA);
        Controls.Add(_webView);
        TryApplyIcon();
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyCssClientSize();
    }

    private void ApplyCssClientSize()
    {
        float scale = MonitorScale();
        int width = (int)Math.Round(ClientWidth * scale);
        int height = (int)Math.Round(ClientHeight * scale);

        var monitor = MonitorFromWindow(Handle, 2);
        var info = new MONITORINFO { cbSize = Marshal.SizeOf<MONITORINFO>() };
        int x = 0;
        int y = 0;
        if (monitor != IntPtr.Zero && GetMonitorInfo(monitor, ref info))
        {
            var work = info.rcWork;
            x = work.Left + Math.Max(0, (work.Right - work.Left - width) / 2);
            y = work.Top + Math.Max(0, (work.Bottom - work.Top - height) / 2);
        }

        SetWindowPos(Handle, IntPtr.Zero, x, y, width, height, 0x0004);
    }

    private float MonitorScale()
    {
        var monitor = MonitorFromWindow(Handle, 2);
        if (monitor != IntPtr.Zero && GetDpiForMonitor(monitor, 0, out var dpiX, out _) == 0 && dpiX >= 96)
        {
            return dpiX / 96f;
        }
        return Math.Max(1f, DeviceDpi / 96f);
    }

    protected override async void OnShown(EventArgs e)
    {
        base.OnShown(e);
        ApplyCssClientSize();
        try
        {
            await InitializeWebViewAsync();
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                this,
                "未找到 Microsoft Edge WebView2 运行时。请安装 Evergreen WebView2 Runtime 后重试。",
                Text,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg is WM_NCLBUTTONDBLCLK or WM_NCRBUTTONDOWN or WM_NCRBUTTONUP or WM_CONTEXTMENU)
        {
            return;
        }

        if (m.Msg == WM_SYSCOMMAND)
        {
            var command = m.WParam.ToInt32() & 0xFFF0;
            if (command is SC_MAXIMIZE or SC_RESTORE or SC_MOUSEMENU or SC_KEYMENU)
            {
                return;
            }
        }

        if (m.Msg == WM_GETMINMAXINFO)
        {
            float scale = MonitorScale();
            int width = (int)Math.Round(ClientWidth * scale);
            int height = (int)Math.Round(ClientHeight * scale);
            var info = Marshal.PtrToStructure<MINMAXINFO>(m.LParam);
            info.ptMinTrackSize = new POINT { X = width, Y = height };
            info.ptMaxTrackSize = new POINT { X = width, Y = height };
            Marshal.StructureToPtr(info, m.LParam, false);
            return;
        }

        base.WndProc(ref m);
    }

    private async Task InitializeWebViewAsync()
    {
        var userData = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "WindowsAuthenticatorDemo",
            "WebView2");
        Directory.CreateDirectory(userData);

        var environment = await CoreWebView2Environment.CreateAsync(null, userData);
        await _webView.EnsureCoreWebView2Async(environment);

        var core = _webView.CoreWebView2;
        var settings = core.Settings;
        settings.IsNonClientRegionSupportEnabled = true;
        settings.AreDefaultContextMenusEnabled = false;
        settings.AreDevToolsEnabled = _devMode;
        settings.IsZoomControlEnabled = false;
        settings.IsPinchZoomEnabled = false;
        settings.IsSwipeNavigationEnabled = false;
        settings.IsStatusBarEnabled = false;
        settings.IsGeneralAutofillEnabled = false;
        settings.IsPasswordAutosaveEnabled = false;

        core.NewWindowRequested += (_, args) => args.Handled = true;
        core.WebMessageReceived += OnWebMessageReceived;
        await core.AddScriptToExecuteOnDocumentCreatedAsync(BridgeScript);

        var devUrl = Environment.GetEnvironmentVariable("AUTHENTICATOR_DEV_URL");
        if (!string.IsNullOrWhiteSpace(devUrl))
        {
            core.Navigate(devUrl);
            return;
        }

        var dist = FindDistFolder();
        if (dist == null)
        {
            MessageBox.Show(this, "找不到前端产物 dist/index.html。请先执行 npm run build:vite。", Text);
            Close();
            return;
        }

        core.SetVirtualHostNameToFolderMapping(
            "authenticator.local",
            dist,
            CoreWebView2HostResourceAccessKind.Allow);
        core.Navigate("https://authenticator.local/index.html");
    }

    private void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        IpcRequest? req;
        try
        {
            req = JsonSerializer.Deserialize<IpcRequest>(e.WebMessageAsJson, BackendDispatcher.JsonOptions);
        }
        catch (JsonException)
        {
            return;
        }

        if (req == null || string.IsNullOrWhiteSpace(req.Action)) return;

        var action = req.Action.ToLowerInvariant();
        switch (action)
        {
            case "minimize":
                WindowState = FormWindowState.Minimized;
                Reply(req, true, null, null);
                return;
            case "maximize":
                Reply(req, true, false, null);
                return;
            case "ismaximized":
                Reply(req, true, false, null);
                return;
            case "close":
                Reply(req, true, null, null);
                BeginInvoke(Close);
                return;
            case "copy":
                CopyText(req);
                return;
            case "savedataurl":
                SaveDataUrl(req);
                return;
        }

        var response = BackendDispatcher.Dispatch(_store, req);
        Post(response);
    }

    private void CopyText(IpcRequest req)
    {
        try
        {
            var text = "";
            if (req.Params.HasValue && req.Params.Value.TryGetProperty("text", out var prop))
            {
                text = prop.ValueKind == JsonValueKind.String ? prop.GetString() ?? "" : prop.ToString();
            }
            if (text.Length == 0) Clipboard.Clear();
            else Clipboard.SetText(text);
            Reply(req, true, true, null);
        }
        catch (Exception ex)
        {
            Reply(req, false, null, ex.Message);
        }
    }

    private void SaveDataUrl(IpcRequest req)
    {
        try
        {
            if (!req.Params.HasValue)
            {
                Reply(req, false, null, "Missing parameters for saveDataUrl.");
                return;
            }

            var p = req.Params.Value;
            var dataUrl = p.TryGetProperty("dataUrl", out var urlProp) ? urlProp.GetString() ?? "" : "";
            var filename = p.TryGetProperty("filename", out var nameProp) ? nameProp.GetString() ?? "qrcode.png" : "qrcode.png";
            var bytes = DecodeDataUrl(dataUrl);
            var safeName = SanitizeFileName(filename);
            var downloads = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
            Directory.CreateDirectory(downloads);
            var path = NextAvailablePath(downloads, safeName);
            File.WriteAllBytes(path, bytes);
            Reply(req, true, path, null);
        }
        catch (Exception ex)
        {
            Reply(req, false, null, ex.Message);
        }
    }

    private void Reply(IpcRequest req, bool success, object? data, string? error)
    {
        Post(new IpcResponse
        {
            Id = req.Id,
            Success = success,
            Data = data,
            Error = error
        });
    }

    private void Post(IpcResponse response)
    {
        var json = JsonSerializer.Serialize(response, BackendDispatcher.JsonOptions);
        if (InvokeRequired)
        {
            BeginInvoke(() => _webView.CoreWebView2?.PostWebMessageAsJson(json));
            return;
        }
        _webView.CoreWebView2?.PostWebMessageAsJson(json);
    }

    private void TryApplyIcon()
    {
        var path = FindUp("logo-preview.png");
        if (path == null || !File.Exists(path)) return;

        using var source = new Bitmap(path);
        using var small = new Bitmap(source, new Size(32, 32));
        var handle = small.GetHicon();
        try
        {
            using var icon = Icon.FromHandle(handle);
            Icon = (Icon)icon.Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    private static string? FindDistFolder()
    {
        var index = FindUp(Path.Combine("dist", "index.html"));
        return index == null ? null : Path.GetDirectoryName(index);
    }

    private static string? FindUp(string relativePath)
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        for (var i = 0; i < 8 && dir != null; i++)
        {
            var candidate = Path.Combine(dir.FullName, relativePath);
            if (File.Exists(candidate)) return candidate;
            dir = dir.Parent;
        }
        return null;
    }

    private static byte[] DecodeDataUrl(string dataUrl)
    {
        var comma = dataUrl.IndexOf(',');
        if (comma < 0 || !dataUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("无效的图片数据。");
        }

        var meta = dataUrl[..comma];
        var payload = dataUrl[(comma + 1)..];
        if (meta.Contains(";base64", StringComparison.OrdinalIgnoreCase))
        {
            return Convert.FromBase64String(payload);
        }
        return System.Text.Encoding.UTF8.GetBytes(Uri.UnescapeDataString(payload));
    }

    private static string SanitizeFileName(string filename)
    {
        var name = string.IsNullOrWhiteSpace(filename) ? "qrcode.png" : filename.Trim();
        foreach (var ch in Path.GetInvalidFileNameChars())
        {
            name = name.Replace(ch, '_');
        }
        return name;
    }

    private static string NextAvailablePath(string directory, string filename)
    {
        var path = Path.Combine(directory, filename);
        if (!File.Exists(path)) return path;

        var stem = Path.GetFileNameWithoutExtension(filename);
        var ext = Path.GetExtension(filename);
        for (var i = 2; i < 1000; i++)
        {
            path = Path.Combine(directory, $"{stem} ({i}){ext}");
            if (!File.Exists(path)) return path;
        }
        return Path.Combine(directory, $"{stem}-{DateTime.Now:yyyyMMddHHmmss}{ext}");
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool DestroyIcon(IntPtr handle);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("shcore.dll")]
    private static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    [DllImport("user32.dll")]
    private static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO info);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MINMAXINFO
    {
        public POINT ptReserved;
        public POINT ptMaxSize;
        public POINT ptMaxPosition;
        public POINT ptMinTrackSize;
        public POINT ptMaxTrackSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT
    {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MONITORINFO
    {
        public int cbSize;
        public RECT rcMonitor;
        public RECT rcWork;
        public uint dwFlags;
    }

    private const string BridgeScript = """
        (() => {
          if (window.authenticatorAPI) return;
          const pending = new Map();
          let seq = 0;

          function call(action, params) {
            const id = 'w' + (++seq);
            return new Promise((resolve, reject) => {
              pending.set(id, { resolve, reject });
              chrome.webview.postMessage({ id, action, params: params ?? null });
            });
          }

          chrome.webview.addEventListener('message', (event) => {
            const msg = event.data;
            if (!msg || !msg.id) return;
            const item = pending.get(msg.id);
            if (!item) return;
            pending.delete(msg.id);
            if (msg.success) item.resolve(msg.data);
            else item.reject(new Error(msg.error || 'Backend request failed'));
          });

          window.authenticatorAPI = {
            listAccounts: () => call('list'),
            addAccount: (params) => call('add', params),
            deleteAccount: (id) => call('delete', { id }),
            updateAccount: (params) => call('update', params),
            parseUri: (uri) => call('parseuri', { uri }),
            validateSecret: (secret) => call('validatesecret', { secret }),
            reorderAccounts: (ids) => call('reorder', { ids }),
            exportAccount: (id) => call('export', { id }),
            copyToClipboard: (text) => call('copy', { text: String(text ?? '') }),
            saveDataUrl: (dataUrl, filename) => call('savedataurl', { dataUrl, filename }),
            minimize: () => call('minimize'),
            maximize: () => call('maximize'),
            close: () => call('close'),
            isMaximized: () => call('isMaximized'),
            onMaximizedChange: () => () => {}
          };
        })();
        """;
}
