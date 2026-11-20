using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace AuthenticatorBackend;

internal static class VaultFile
{
    // A versioned, non-JSON envelope. Never treat a failed decryption as an empty vault.
    private static ReadOnlySpan<byte> Header => "KLIPY-DPAPI-1\n"u8;
    private const int MaxFileSize = 64 * 1024 * 1024;

    public static byte[]? Read(string path)
    {
        FileStream stream;
        try { stream = File.OpenRead(path); }
        catch (FileNotFoundException) { return null; }
        using (stream)
        {
            if (stream.Length > MaxFileSize) throw new InvalidDataException("数据文件超出大小限制。");
            var bytes = new byte[(int)stream.Length];
            stream.ReadExactly(bytes);
            return bytes;
        }
    }

    public static List<AccountRecord> LoadAccounts(string path)
    {
        var file = Read(path);
        if (file is null) return [];
        byte[]? decrypted = null;
        try
        {
            bool encrypted = file.AsSpan().StartsWith(Header);
            if (encrypted) decrypted = Dpapi(file.AsSpan(Header.Length), protect: false);
            // Windows PowerShell and older tooling can leave a UTF-8 BOM in legacy JSON.
            ReadOnlySpan<byte> json = decrypted ?? file;
            if (json.StartsWith(new byte[] { 0xef, 0xbb, 0xbf })) json = json[3..];
            var accounts = JsonSerializer.Deserialize<List<AccountRecord>>(json) ?? throw new InvalidDataException();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            foreach (var account in accounts)
            {
                if (account is null || string.IsNullOrWhiteSpace(account.Id) || !ids.Add(account.Id) ||
                    account.Issuer is null || account.Account is null || account.Algorithm is null ||
                    account.Period <= 0 || account.Digits is not (6 or 8)) throw new InvalidDataException();
                var key = TotpEngine.DecodeBase32(account.Secret);
                if (key.Length == 0) throw new InvalidDataException();
                CryptographicOperations.ZeroMemory(key);
            }
            if (!encrypted) SaveAccounts(path, accounts);
            return accounts;
        }
        finally
        {
            CryptographicOperations.ZeroMemory(file);
            if (decrypted is not null) CryptographicOperations.ZeroMemory(decrypted);
        }
    }

    public static void SaveAccounts(string path, List<AccountRecord> accounts)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(accounts);
        try
        {
            var encrypted = Dpapi(json, protect: true);
            var file = new byte[Header.Length + encrypted.Length];
            Header.CopyTo(file);
            encrypted.CopyTo(file, Header.Length);
            WriteAtomic(path, file, temporary =>
            {
                var onDisk = Read(temporary) ?? throw new IOException();
                if (!onDisk.AsSpan().StartsWith(Header)) throw new IOException();
                var check = Dpapi(onDisk.AsSpan(Header.Length), protect: false);
                try
                {
                    if (!CryptographicOperations.FixedTimeEquals(json, check)) throw new IOException();
                }
                finally { CryptographicOperations.ZeroMemory(check); }
            });
        }
        finally { CryptographicOperations.ZeroMemory(json); }
    }

    public static void WriteAtomic(string path, byte[] bytes, Action<string>? verify = null)
    {
        if (bytes.Length > MaxFileSize) throw new IOException("数据文件超出大小限制。");
        var temporary = $"{path}.{Guid.NewGuid():N}.tmp";
        try
        {
            using (var stream = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                stream.Write(bytes);
                stream.Flush(flushToDisk: true);
            }
            verify?.Invoke(temporary);
            if (File.Exists(path)) File.Replace(temporary, path, null);
            else File.Move(temporary, path);
        }
        finally { try { File.Delete(temporary); } catch (IOException) { } catch (UnauthorizedAccessException) { } }
    }

    private static unsafe byte[] Dpapi(ReadOnlySpan<byte> bytes, bool protect)
    {
        if (!OperatingSystem.IsWindows()) throw new PlatformNotSupportedException();
        if (bytes.IsEmpty) throw new InvalidDataException();
        fixed (byte* p = bytes)
        {
            var input = new Blob { Size = bytes.Length, Data = (nint)p };
            // CRYPTPROTECT_UI_FORBIDDEN; omitting LOCAL_MACHINE binds the vault to this user.
            bool ok = protect
                ? CryptProtectData(ref input, null, 0, 0, 0, 1, out var output)
                : CryptUnprotectData(ref input, 0, 0, 0, 0, 1, out output);
            if (!ok) throw new Win32Exception();
            var data = new Span<byte>((void*)output.Data, output.Size);
            try { return data.ToArray(); }
            finally
            {
                CryptographicOperations.ZeroMemory(data);
                LocalFree(output.Data);
            }
        }
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct Blob { public int Size; public nint Data; }

    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool CryptProtectData(ref Blob input, string? description, nint entropy, nint reserved,
        nint prompt, int flags, out Blob output);
    [DllImport("crypt32.dll", SetLastError = true)]
    private static extern bool CryptUnprotectData(ref Blob input, nint description, nint entropy, nint reserved,
        nint prompt, int flags, out Blob output);
    [DllImport("kernel32.dll")]
    private static extern nint LocalFree(nint memory);
}
