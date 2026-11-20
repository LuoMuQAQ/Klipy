using System.Runtime.InteropServices;

namespace AuthenticatorBackend;

internal static class PrivateClipboard
{
    private const uint UnicodeText = 13;
    private const uint Moveable = 0x0002;
    private const uint ZeroInit = 0x0040;

    public static bool Write(string text)
    {
        if (!OperatingSystem.IsWindows() || text.Length is 0 or > 8192 || text.Contains('\0')) return false;
        // A message-only window is never displayed. A real owner is required by EmptyClipboard/SetClipboardData.
        nint owner = CreateWindowExW(0, "STATIC", null, 0, 0, 0, 0, 0, -3, 0, 0, 0);
        if (owner == 0) return false;
        try
        {
            uint exclusion = RegisterClipboardFormatW("ExcludeClipboardContentFromMonitorProcessing");
            uint history = RegisterClipboardFormatW("CanIncludeInClipboardHistory");
            uint cloud = RegisterClipboardFormatW("CanUploadToCloudClipboard");
            if (exclusion == 0 || history == 0 || cloud == 0) return false;
            for (int attempt = 0; attempt < 8; ++attempt)
            {
                if (!OpenClipboard(owner)) { Thread.Sleep(15); continue; }
                try
                {
                    // Publish privacy formats and Unicode text in one clipboard transaction.
                    if (!EmptyClipboard()) return false;
                    if (Put(exclusion, null) && Put(history, null) && Put(cloud, null) && Put(UnicodeText, text)) return true;
                    EmptyClipboard();
                    return false;
                }
                finally { CloseClipboard(); }
            }
            return false;
        }
        finally { DestroyWindow(owner); }
    }

    private static unsafe bool Put(uint format, string? text)
    {
        var memory = GlobalAlloc(Moveable | ZeroInit, text is null ? 4u : (nuint)((text.Length + 1) * sizeof(char)));
        if (memory == 0) return false;
        try
        {
            var address = GlobalLock(memory);
            if (address == 0) return false;
            try
            {
                if (text is not null) text.AsSpan().CopyTo(new Span<char>((void*)address, text.Length));
            }
            finally { GlobalUnlock(memory); }
            if (SetClipboardData(format, memory) == 0) return false;
            memory = 0; // Windows owns the buffer now.
            return true;
        }
        finally { if (memory != 0) GlobalFree(memory); }
    }

    [DllImport("user32.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern nint CreateWindowExW(uint exStyle, string windowClass, string? name, uint style,
        int x, int y, int width, int height, nint parent, nint menu, nint instance, nint parameter);
    [DllImport("user32.dll")] private static extern bool DestroyWindow(nint hwnd);
    [DllImport("user32.dll", ExactSpelling = true, CharSet = CharSet.Unicode)]
    private static extern uint RegisterClipboardFormatW(string name);
    [DllImport("user32.dll")] private static extern bool OpenClipboard(nint owner);
    [DllImport("user32.dll")] private static extern bool CloseClipboard();
    [DllImport("user32.dll")] private static extern bool EmptyClipboard();
    [DllImport("user32.dll")] private static extern nint SetClipboardData(uint format, nint data);
    [DllImport("kernel32.dll")] private static extern nint GlobalAlloc(uint flags, nuint size);
    [DllImport("kernel32.dll")] private static extern nint GlobalFree(nint memory);
    [DllImport("kernel32.dll")] private static extern nint GlobalLock(nint memory);
    [DllImport("kernel32.dll")] private static extern bool GlobalUnlock(nint memory);
}
