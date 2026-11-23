using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace AuthenticatorBackend;

internal static class VaultFile
{
    // Versioned, non-JSON envelopes. Never treat a failed decryption or unknown version as an empty vault.
    private static ReadOnlySpan<byte> Prefix => "KLIPY-DPAPI-"u8;
    private static ReadOnlySpan<byte> HeaderV1 => "KLIPY-DPAPI-1\n"u8;
    private static ReadOnlySpan<byte> HeaderV2 => "KLIPY-DPAPI-2\n"u8;
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

    /// <summary>
    /// 加载统一保险库（KLIPY-DPAPI-2）；若仍是旧版双文件（KLIPY-DPAPI-1 或明文 JSON + groups.json），
    /// 返回合并后的内存数据并标记 NeedsMigration = true，由调用方以单次原子替换升级为 KLIPY-DPAPI-2。
    /// </summary>
    public static (List<GroupRecord> Groups, List<AccountRecord> Accounts, bool NeedsMigration) LoadVault(
        string vaultPath,
        string legacyGroupsPath)
    {
        var vaultBytes = Read(vaultPath);
        if (vaultBytes is null)
        {
            var legacyGroups = ReadLegacyGroups(legacyGroupsPath);
            if (legacyGroups is null)
            {
                return (new List<GroupRecord>(), new List<AccountRecord>(), false);
            }
            return (legacyGroups, new List<AccountRecord>(), true);
        }

        byte[]? decrypted = null;
        try
        {
            if (vaultBytes.AsSpan().StartsWith(HeaderV2))
            {
                decrypted = Dpapi(vaultBytes.AsSpan(HeaderV2.Length), protect: false);
                var snapshot = JsonSerializer.Deserialize<VaultSnapshot>(StripUtf8Bom(decrypted))
                    ?? throw new InvalidDataException();
                if (snapshot.Groups is null || snapshot.Accounts is null)
                    throw new InvalidDataException();
                ValidateGroups(snapshot.Groups);
                ValidateAccounts(snapshot.Accounts);
                return (snapshot.Groups, snapshot.Accounts, false);
            }

            List<AccountRecord> accounts;
            if (vaultBytes.AsSpan().StartsWith(HeaderV1))
            {
                decrypted = Dpapi(vaultBytes.AsSpan(HeaderV1.Length), protect: false);
                accounts = ParseAndValidateAccounts(StripUtf8Bom(decrypted));
            }
            else if (vaultBytes.AsSpan().StartsWith(Prefix))
            {
                // Unknown future vault version; refuse to open so we never corrupt or wipe newer data.
                throw new InvalidDataException("不支持的数据文件版本。");
            }
            else
            {
                accounts = ParseAndValidateAccounts(StripUtf8Bom(vaultBytes));
            }

            var groups = ReadLegacyGroups(legacyGroupsPath) ?? new List<GroupRecord>();
            return (groups, accounts, true);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(vaultBytes);
            if (decrypted is not null) CryptographicOperations.ZeroMemory(decrypted);
        }
    }

    public static void SaveVault(string path, List<GroupRecord> groups, List<AccountRecord> accounts)
    {
        var json = JsonSerializer.SerializeToUtf8Bytes(new VaultSnapshot
        {
            Groups = groups,
            Accounts = accounts
        });
        byte[]? encrypted = null;
        byte[]? file = null;
        try
        {
            encrypted = Dpapi(json, protect: true);
            file = new byte[HeaderV2.Length + encrypted.Length];
            HeaderV2.CopyTo(file);
            encrypted.CopyTo(file, HeaderV2.Length);
            WriteAtomic(path, file, temporary =>
            {
                var onDisk = Read(temporary) ?? throw new IOException();
                try
                {
                    if (!onDisk.AsSpan().StartsWith(HeaderV2)) throw new IOException();
                    var check = Dpapi(onDisk.AsSpan(HeaderV2.Length), protect: false);
                    try
                    {
                        if (!CryptographicOperations.FixedTimeEquals(json, check)) throw new IOException();
                    }
                    finally { CryptographicOperations.ZeroMemory(check); }
                }
                finally { CryptographicOperations.ZeroMemory(onDisk); }
            });
        }
        finally
        {
            CryptographicOperations.ZeroMemory(json);
            if (encrypted is not null) CryptographicOperations.ZeroMemory(encrypted);
            if (file is not null) CryptographicOperations.ZeroMemory(file);
        }
    }

    public static void DeleteLegacyFileQuietly(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private static List<GroupRecord>? ReadLegacyGroups(string path)
    {
        var file = Read(path);
        if (file is null) return null;
        var groups = JsonSerializer.Deserialize<List<GroupRecord>>(StripUtf8Bom(file))
            ?? throw new InvalidDataException();
        ValidateGroups(groups);
        return groups;
    }

    private static ReadOnlySpan<byte> StripUtf8Bom(ReadOnlySpan<byte> bytes)
    {
        // Windows PowerShell and older tooling can leave a UTF-8 BOM in legacy JSON.
        return bytes.StartsWith(new byte[] { 0xef, 0xbb, 0xbf }) ? bytes[3..] : bytes;
    }

    private static List<AccountRecord> ParseAndValidateAccounts(ReadOnlySpan<byte> json)
    {
        var accounts = JsonSerializer.Deserialize<List<AccountRecord>>(json) ?? throw new InvalidDataException();
        ValidateAccounts(accounts);
        return accounts;
    }

    private static void ValidateGroups(List<GroupRecord> groups)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var group in groups)
        {
            if (group is null || string.IsNullOrWhiteSpace(group.Id) ||
                string.IsNullOrWhiteSpace(group.Name) || !ids.Add(group.Id))
            {
                throw new InvalidDataException();
            }
        }
    }

    private static void ValidateAccounts(List<AccountRecord> accounts)
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        foreach (var account in accounts)
        {
            if (account is null || string.IsNullOrWhiteSpace(account.Id) || !ids.Add(account.Id) ||
                account.Issuer is null || account.Account is null || account.Algorithm is null ||
                account.Period <= 0 || account.Digits is not (6 or 8))
            {
                throw new InvalidDataException();
            }
            account.Icon = AccountIcon.Normalize(account.Icon);
            if (!AccountIcon.IsValid(account.Icon))
            {
                throw new InvalidDataException();
            }
            TotpEngine.ValidateSecret(account.Secret);
        }
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
