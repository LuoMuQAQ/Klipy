using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace AuthenticatorBackend
{
    public class AccountStore
    {
        private readonly string _filePath;
        private readonly object _lock = new object();
        private List<AccountRecord> _accounts = new List<AccountRecord>();

        public AccountStore()
        {
            string folder = AppPaths.DataFolder();
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }
            _filePath = Path.Combine(folder, "accounts.json");
            Load();
        }

        private void Load()
        {
            lock (_lock)
            {
                if (!File.Exists(_filePath)) return;

                try
                {
                    string json = File.ReadAllText(_filePath);
                    var list = JsonSerializer.Deserialize<List<AccountRecord>>(json);
                    if (list != null)
                    {
                        _accounts = list;
                    }
                }
                catch
                {
                    // 文件损坏时以空账号库启动，不立刻覆盖原文件，避免二次破坏。
                    _accounts = new List<AccountRecord>();
                }
            }
        }

        private void SaveUnsafe()
        {
            var options = new JsonSerializerOptions { WriteIndented = true };
            string json = JsonSerializer.Serialize(_accounts, options);
            File.WriteAllText(_filePath, json);
        }

        public List<AccountDto> GetAccountsWithCodes()
        {
            lock (_lock)
            {
                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                var result = new List<AccountDto>();

                foreach (var acc in _accounts)
                {
                    string code;
                    try
                    {
                        code = TotpEngine.GenerateCode(acc.Secret, now, acc.Digits, acc.Period, acc.Algorithm);
                    }
                    catch (Exception ex)
                    {
                        code = "ERR: " + ex.Message;
                    }

                    int remaining = TotpEngine.GetRemainingSeconds(now, acc.Period);

                    result.Add(new AccountDto
                    {
                        Id = acc.Id,
                        Issuer = acc.Issuer,
                        Account = acc.Account,
                        Code = code,
                        RemainingSeconds = remaining,
                        Period = acc.Period,
                        Digits = acc.Digits,
                        Algorithm = acc.Algorithm,
                        GroupId = acc.GroupId,
                        CreatedAt = acc.CreatedAt
                    });
                }

                return result;
            }
        }

        public AccountDto AddAccount(string issuer, string account, string secret, int digits = 6, int period = 30, string algorithm = "SHA1", string groupId = "")
        {
            lock (_lock)
            {
                // 账号必须属于某个分组；由调用方负责校验分组是否存在。
                string cleanGroupId = (groupId ?? "").Trim();
                if (cleanGroupId.Length == 0)
                {
                    throw new ArgumentException("请先选择分组。");
                }

                // Validate base32
                TotpEngine.DecodeBase32(secret);

                var newAcc = new AccountRecord
                {
                    Id = Guid.NewGuid().ToString("N"),
                    Issuer = string.IsNullOrWhiteSpace(issuer) ? "Unknown" : issuer.Trim(),
                    Account = string.IsNullOrWhiteSpace(account) ? "Account" : account.Trim(),
                    Secret = secret.Trim(),
                    Digits = digits == 8 ? 8 : 6,
                    Period = period > 0 ? period : 30,
                    Algorithm = string.IsNullOrWhiteSpace(algorithm) ? "SHA1" : algorithm.Trim().ToUpperInvariant(),
                    GroupId = cleanGroupId,
                    CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };

                _accounts.Insert(0, newAcc);
                SaveUnsafe();

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string code = TotpEngine.GenerateCode(newAcc.Secret, now, newAcc.Digits, newAcc.Period, newAcc.Algorithm);

                return new AccountDto
                {
                    Id = newAcc.Id,
                    Issuer = newAcc.Issuer,
                    Account = newAcc.Account,
                    Code = code,
                    RemainingSeconds = TotpEngine.GetRemainingSeconds(now, newAcc.Period),
                    Period = newAcc.Period,
                    Digits = newAcc.Digits,
                    Algorithm = newAcc.Algorithm,
                    GroupId = newAcc.GroupId,
                    CreatedAt = newAcc.CreatedAt
                };
            }
        }

        public bool DeleteAccount(string id)
        {
            lock (_lock)
            {
                int removed = _accounts.RemoveAll(a => a.Id == id);
                if (removed > 0)
                {
                    SaveUnsafe();
                    return true;
                }
                return false;
            }
        }

        public AccountDto? UpdateAccount(string id, string issuer, string account, string groupId)
        {
            lock (_lock)
            {
                string cleanGroupId = (groupId ?? "").Trim();
                if (cleanGroupId.Length == 0)
                {
                    throw new ArgumentException("请先选择分组。");
                }

                var item = _accounts.FirstOrDefault(a => a.Id == id);
                if (item == null) return null;

                if (!string.IsNullOrWhiteSpace(issuer)) item.Issuer = issuer.Trim();
                if (!string.IsNullOrWhiteSpace(account)) item.Account = account.Trim();
                item.GroupId = cleanGroupId;
                SaveUnsafe();

                long now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string code = TotpEngine.GenerateCode(item.Secret, now, item.Digits, item.Period, item.Algorithm);

                return new AccountDto
                {
                    Id = item.Id,
                    Issuer = item.Issuer,
                    Account = item.Account,
                    Code = code,
                    RemainingSeconds = TotpEngine.GetRemainingSeconds(now, item.Period),
                    Period = item.Period,
                    Digits = item.Digits,
                    Algorithm = item.Algorithm,
                    GroupId = item.GroupId,
                    CreatedAt = item.CreatedAt
                };
            }
        }

        /// <summary>删除分组时一并删除组内账号，返回被删除的账号数。</summary>
        public int DeleteByGroup(string groupId)
        {
            lock (_lock)
            {
                string target = (groupId ?? "").Trim();
                int removed = _accounts.RemoveAll(a =>
                    string.Equals((a.GroupId ?? "").Trim(), target, StringComparison.Ordinal));
                if (removed > 0) SaveUnsafe();
                return removed;
            }
        }

        /// <summary>找出「没有分组」或「分组已不存在」的账号所用的分组 id，供启动时修复历史数据。</summary>
        public List<string> FindOrphanGroupIds(Func<string, bool> groupExists)
        {
            lock (_lock)
            {
                var result = new List<string>();
                foreach (var acc in _accounts)
                {
                    string gid = (acc.GroupId ?? "").Trim();
                    if (gid.Length > 0 && groupExists(gid)) continue;
                    if (!result.Contains(gid)) result.Add(gid);
                }
                return result;
            }
        }

        /// <summary>把指定分组 id 下的账号统一改到 toGroupId，返回移动数量。</summary>
        public int ReassignGroups(List<string> fromGroupIds, string toGroupId)
        {
            lock (_lock)
            {
                var from = new HashSet<string>(fromGroupIds, StringComparer.Ordinal);
                int moved = 0;
                foreach (var acc in _accounts)
                {
                    string gid = (acc.GroupId ?? "").Trim();
                    if (!from.Contains(gid)) continue;
                    acc.GroupId = toGroupId;
                    moved++;
                }

                if (moved > 0) SaveUnsafe();
                return moved;
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

                // Append any accounts not explicitly listed
                foreach (var remaining in _accounts)
                {
                    if (byId.ContainsKey(remaining.Id))
                    {
                        reordered.Add(remaining);
                    }
                }

                _accounts = reordered;
                SaveUnsafe();
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
    }
}
