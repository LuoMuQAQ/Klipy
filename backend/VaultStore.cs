using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;

namespace AuthenticatorBackend
{
    /// <summary>
    /// 统一线程安全保险库：分组与账号共用单个 KLIPY-DPAPI-2 加密文件（accounts.json），
    /// 所有跨实体修改（例如删除分组连带删除组内账号、孤儿分组修复、批量导入）均通过单次原子替换提交。
    /// </summary>
    public class VaultStore
    {
        private const int MaxGroupNameLength = 20;
        private const int MaxBatchImportCount = 500;

        private readonly string _vaultPath;
        private readonly string _legacyGroupsPath;
        private readonly object _lock = new object();
        private List<GroupRecord> _groups = new List<GroupRecord>();
        private List<AccountRecord> _accounts = new List<AccountRecord>();

        public VaultStore()
        {
            string folder = AppPaths.DataFolder();
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }
            _vaultPath = Path.Combine(folder, "accounts.json");
            _legacyGroupsPath = Path.Combine(folder, "groups.json");
            LoadAndRepair();
        }

        private void LoadAndRepair()
        {
            var (groups, accounts, needsMigration) = VaultFile.LoadVault(_vaultPath, _legacyGroupsPath);
            bool dirty = RepairOrphanGroups(groups, accounts);

            if (needsMigration || dirty)
            {
                Commit(groups, accounts);
            }
            else
            {
                _groups = groups;
                _accounts = accounts;
            }

            // 仅在 accounts.json 已落盘为 KLIPY-DPAPI-2 后移除遗留的 groups.json。
            if (File.Exists(_vaultPath))
            {
                VaultFile.DeleteLegacyFileQuietly(_legacyGroupsPath);
            }
        }

        private static bool RepairOrphanGroups(List<GroupRecord> groups, List<AccountRecord> accounts)
        {
            var existingIds = new HashSet<string>(groups.Select(g => g.Id), StringComparer.Ordinal);
            bool hasOrphan = accounts.Any(a =>
            {
                string gid = (a.GroupId ?? "").Trim();
                return gid.Length == 0 || !existingIds.Contains(gid);
            });
            if (!hasOrphan) return false;

            var fallback = groups.FirstOrDefault(g =>
                string.Equals(g.Name, "默认分组", StringComparison.OrdinalIgnoreCase));
            if (fallback == null)
            {
                fallback = new GroupRecord
                {
                    Name = "默认分组",
                    CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };
                groups.Add(fallback);
            }

            for (int i = 0; i < accounts.Count; i++)
            {
                string gid = (accounts[i].GroupId ?? "").Trim();
                if (gid.Length == 0 || !existingIds.Contains(gid))
                {
                    accounts[i] = accounts[i] with { GroupId = fallback.Id };
                }
            }
            return true;
        }

        private void Commit(List<GroupRecord> groups, List<AccountRecord> accounts)
        {
            VaultFile.SaveVault(_vaultPath, groups, accounts);
            _groups = groups;
            _accounts = accounts;
        }

        // ── Accounts ─────────────────────────────────────────────────────────────

        public List<AccountDto> GetAccountsWithCodes()
        {
            lock (_lock)
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                return _accounts.Select(acc => ToAccountDto(acc, now)).ToList();
            }
        }

        public AccountDto? GetAccountWithCode(string id)
        {
            lock (_lock)
            {
                var item = _accounts.FirstOrDefault(a => a.Id == id);
                return item == null ? null : ToAccountDto(item, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
            }
        }

        public AccountDto AddAccount(string issuer, string account, string secret, int digits = 6, int period = 30, string algorithm = "SHA1", string groupId = "")
        {
            lock (_lock)
            {
                string cleanGroupId = RequireExistingGroup(groupId);
                TotpEngine.ValidateSecret(secret);
                if (digits is not (6 or 8) || period <= 0)
                    throw new ArgumentException("验证码位数或周期无效。");

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var newAcc = new AccountRecord
                {
                    Id = Guid.NewGuid().ToString("N"),
                    Issuer = string.IsNullOrWhiteSpace(issuer) ? "Unknown" : issuer.Trim(),
                    Account = string.IsNullOrWhiteSpace(account) ? "Account" : account.Trim(),
                    Secret = secret.Trim(),
                    Digits = digits,
                    Period = period,
                    Algorithm = TotpEngine.NormalizeAlgorithm(algorithm),
                    GroupId = cleanGroupId,
                    CreatedAt = now
                };

                var updated = new List<AccountRecord>(_accounts.Count + 1) { newAcc };
                updated.AddRange(_accounts);
                var dto = ToAccountDto(newAcc, now);
                Commit(_groups, updated);
                return dto;
            }
        }

        /// <summary>
        /// 单次原子批量导入：先完整校验所有条目，再按“解码后密钥 + 算法 + 位数 + 周期”自动去重跳过，
        /// 同名但不同密钥允许并存；整批仅加密写盘一次，全部重复时不重写磁盘。
        /// </summary>
        public BatchImportResultDto AddAccountsBatch(string groupId, IReadOnlyList<BatchAccountInput> items)
        {
            lock (_lock)
            {
                string cleanGroupId = RequireExistingGroup(groupId);
                if (items == null || items.Count == 0)
                    throw new ArgumentException("没有可导入的账号。");
                if (items.Count > MaxBatchImportCount)
                    throw new ArgumentException($"单次批量导入最多支持 {MaxBatchImportCount} 个账号。");

                var seenFingerprints = new HashSet<string>(StringComparer.Ordinal);
                foreach (var existing in _accounts)
                {
                    seenFingerprints.Add(ComputeTotpFingerprint(existing.Secret, existing.Algorithm, existing.Digits, existing.Period));
                }

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var toAdd = new List<AccountRecord>();
                int duplicates = 0;

                foreach (var item in items)
                {
                    if (item == null) throw new ArgumentException("批量导入包含无效条目。");
                    TotpEngine.ValidateSecret(item.Secret);
                    if (item.Digits is not (6 or 8) || item.Period <= 0)
                        throw new ArgumentException("验证码位数或周期无效。");
                    string normalizedAlgo = TotpEngine.NormalizeAlgorithm(item.Algorithm);

                    string fingerprint = ComputeTotpFingerprint(item.Secret, normalizedAlgo, item.Digits, item.Period);
                    if (!seenFingerprints.Add(fingerprint))
                    {
                        duplicates++;
                        continue;
                    }

                    toAdd.Add(new AccountRecord
                    {
                        Id = Guid.NewGuid().ToString("N"),
                        Issuer = string.IsNullOrWhiteSpace(item.Issuer) ? "Unknown" : item.Issuer.Trim(),
                        Account = string.IsNullOrWhiteSpace(item.Account) ? "Account" : item.Account.Trim(),
                        Secret = item.Secret.Trim(),
                        Digits = item.Digits,
                        Period = item.Period,
                        Algorithm = normalizedAlgo,
                        GroupId = cleanGroupId,
                        CreatedAt = now
                    });
                }

                var dtos = toAdd.Select(acc => ToAccountDto(acc, now)).ToList();
                if (toAdd.Count > 0)
                {
                    var updated = new List<AccountRecord>(toAdd.Count + _accounts.Count);
                    updated.AddRange(toAdd);
                    updated.AddRange(_accounts);
                    Commit(_groups, updated);
                }

                return new BatchImportResultDto
                {
                    Added = toAdd.Count,
                    Duplicates = duplicates,
                    Accounts = dtos
                };
            }
        }

        public bool DeleteAccount(string id)
        {
            lock (_lock)
            {
                var updated = _accounts.Where(a => a.Id != id).ToList();
                if (updated.Count == _accounts.Count) return false;
                Commit(_groups, updated);
                return true;
            }
        }

        public AccountDto? UpdateAccount(string id, string issuer, string account, string groupId, string? icon = null)
        {
            lock (_lock)
            {
                string cleanGroupId = RequireExistingGroup(groupId);
                var item = _accounts.FirstOrDefault(a => a.Id == id);
                if (item == null) return null;

                string? nextIcon = null;
                if (icon != null)
                {
                    nextIcon = AccountIcon.Normalize(icon);
                    if (!AccountIcon.IsValid(nextIcon))
                        throw new ArgumentException("图标格式无效。");
                }

                item = item with
                {
                    Issuer = string.IsNullOrWhiteSpace(issuer) ? item.Issuer : issuer.Trim(),
                    Account = string.IsNullOrWhiteSpace(account) ? item.Account : account.Trim(),
                    GroupId = cleanGroupId,
                    Icon = nextIcon ?? item.Icon
                };
                var dto = ToAccountDto(item, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
                Commit(_groups, _accounts.Select(a => a.Id == id ? item : a).ToList());
                return dto;
            }
        }

        public bool ReorderAccounts(List<string> orderedIds)
        {
            lock (_lock)
            {
                if (orderedIds == null || orderedIds.Count == 0) return false;

                var byId = _accounts.ToDictionary(a => a.Id);
                var reordered = new List<AccountRecord>();

                foreach (string id in orderedIds)
                {
                    if (byId.TryGetValue(id, out var acc))
                    {
                        reordered.Add(acc);
                        byId.Remove(id);
                    }
                }

                foreach (var remaining in _accounts)
                {
                    if (byId.ContainsKey(remaining.Id))
                    {
                        reordered.Add(remaining);
                    }
                }

                if (!reordered.SequenceEqual(_accounts)) Commit(_groups, reordered);
                return true;
            }
        }

        public ExportAccountDto? ExportAccount(string id)
        {
            lock (_lock)
            {
                var item = _accounts.FirstOrDefault(a => a.Id == id);
                if (item == null) return null;

                string cleanSecret = item.Secret.Trim().Replace(" ", "").Replace("-", "").ToUpperInvariant();
                string label = string.IsNullOrWhiteSpace(item.Issuer)
                    ? Uri.EscapeDataString(item.Account)
                    : $"{Uri.EscapeDataString(item.Issuer)}:{Uri.EscapeDataString(item.Account)}";

                var queryParts = new List<string>
                {
                    $"secret={Uri.EscapeDataString(cleanSecret)}"
                };
                if (!string.IsNullOrWhiteSpace(item.Issuer))
                {
                    queryParts.Add($"issuer={Uri.EscapeDataString(item.Issuer)}");
                }
                queryParts.Add($"algorithm={Uri.EscapeDataString(item.Algorithm)}");
                queryParts.Add($"digits={item.Digits}");
                queryParts.Add($"period={item.Period}");

                string uri = $"otpauth://totp/{label}?{string.Join("&", queryParts)}";

                return new ExportAccountDto
                {
                    Id = item.Id,
                    Issuer = item.Issuer,
                    Account = item.Account,
                    Secret = cleanSecret,
                    Uri = uri,
                    Digits = item.Digits,
                    Period = item.Period,
                    Algorithm = item.Algorithm
                };
            }
        }

        // ── Groups ───────────────────────────────────────────────────────────────

        public List<GroupDto> ListGroups()
        {
            lock (_lock)
            {
                return _groups.Select(ToGroupDto).ToList();
            }
        }

        public GroupDto AddGroup(string name)
        {
            string clean = NormalizeGroupName(name);
            lock (_lock)
            {
                if (HasSameGroupName(clean, null))
                    throw new InvalidOperationException("分组名称已存在。");

                var group = new GroupRecord
                {
                    Name = clean,
                    CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };
                Commit([.._groups, group], _accounts);
                return ToGroupDto(group);
            }
        }

        public GroupDto? RenameGroup(string id, string name)
        {
            string clean = NormalizeGroupName(name);
            lock (_lock)
            {
                var group = _groups.FirstOrDefault(g => g.Id == id);
                if (group == null) return null;
                if (HasSameGroupName(clean, id))
                    throw new InvalidOperationException("分组名称已存在。");

                group = group with { Name = clean };
                Commit(_groups.Select(g => g.Id == id ? group : g).ToList(), _accounts);
                return ToGroupDto(group);
            }
        }

        /// <summary>单次原子删除分组及组内所有账号，不会出现跨文件不一致。</summary>
        public (bool Deleted, int RemovedAccounts) DeleteGroup(string id)
        {
            lock (_lock)
            {
                string target = (id ?? "").Trim();
                var updatedGroups = _groups.Where(g => g.Id != target).ToList();
                if (updatedGroups.Count == _groups.Count) return (false, 0);

                var updatedAccounts = _accounts.Where(a =>
                    !string.Equals((a.GroupId ?? "").Trim(), target, StringComparison.Ordinal)).ToList();
                int removed = _accounts.Count - updatedAccounts.Count;

                Commit(updatedGroups, updatedAccounts);
                return (true, removed);
            }
        }

        public bool ReorderGroups(List<string> orderedIds)
        {
            lock (_lock)
            {
                if (orderedIds == null || orderedIds.Count == 0) return false;

                var byId = _groups.ToDictionary(g => g.Id);
                var reordered = new List<GroupRecord>();

                foreach (string id in orderedIds)
                {
                    if (byId.TryGetValue(id, out var group))
                    {
                        reordered.Add(group);
                        byId.Remove(id);
                    }
                }

                foreach (var remaining in _groups)
                {
                    if (byId.ContainsKey(remaining.Id))
                    {
                        reordered.Add(remaining);
                    }
                }

                if (!reordered.SequenceEqual(_groups)) Commit(reordered, _accounts);
                return true;
            }
        }

        // ── Helpers ──────────────────────────────────────────────────────────────

        private string RequireExistingGroup(string? groupId)
        {
            string cleanGroupId = (groupId ?? "").Trim();
            if (cleanGroupId.Length == 0)
                throw new ArgumentException("请先选择分组。");
            if (!_groups.Any(g => g.Id == cleanGroupId))
                throw new ArgumentException("分组不存在。");
            return cleanGroupId;
        }

        private bool HasSameGroupName(string name, string? excludeId)
        {
            return _groups.Any(g =>
                !string.Equals(g.Id, excludeId, StringComparison.Ordinal) &&
                string.Equals(g.Name, name, StringComparison.OrdinalIgnoreCase));
        }

        private static string NormalizeGroupName(string name)
        {
            string clean = (name ?? "").Trim();
            if (clean.Length == 0)
                throw new ArgumentException("请输入分组名称。");
            return clean.Length > MaxGroupNameLength ? clean.Substring(0, MaxGroupNameLength) : clean;
        }

        private static string ComputeTotpFingerprint(string secret, string algorithm, int digits, int period)
        {
            byte[] key = TotpEngine.DecodeBase32(secret);
            try
            {
                string effectiveAlgo = (algorithm ?? "SHA1").Trim().ToUpperInvariant() switch
                {
                    "SHA256" => "SHA256",
                    "SHA512" => "SHA512",
                    _ => "SHA1",
                };
                byte[] meta = Encoding.UTF8.GetBytes($"{effectiveAlgo}|{digits}|{period}|");
                byte[] combined = new byte[meta.Length + key.Length];
                try
                {
                    meta.CopyTo(combined, 0);
                    key.CopyTo(combined, meta.Length);
                    return Convert.ToHexString(SHA256.HashData(combined));
                }
                finally
                {
                    CryptographicOperations.ZeroMemory(combined);
                }
            }
            finally
            {
                CryptographicOperations.ZeroMemory(key);
            }
        }

        private static AccountDto ToAccountDto(AccountRecord acc, long now)
        {
            int remaining = TotpEngine.GetRemainingSeconds(now, acc.Period);
            return new AccountDto
            {
                Id = acc.Id,
                Issuer = acc.Issuer,
                Account = acc.Account,
                Code = TotpEngine.GenerateCode(acc.Secret, now, acc.Digits, acc.Period, acc.Algorithm),
                RemainingSeconds = remaining,
                ValidUntil = now + remaining,
                Period = acc.Period,
                Digits = acc.Digits,
                Algorithm = acc.Algorithm,
                GroupId = acc.GroupId,
                Icon = acc.Icon ?? "",
                CreatedAt = acc.CreatedAt
            };
        }

        private static GroupDto ToGroupDto(GroupRecord group)
        {
            return new GroupDto
            {
                Id = group.Id,
                Name = group.Name,
                CreatedAt = group.CreatedAt
            };
        }
    }
}
