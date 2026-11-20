using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.Json;

namespace AuthenticatorBackend
{
    /// <summary>
    /// 用户自建分组，独立保存在 groups.json；账号通过 groupId 引用分组，
    /// 每个账号都必须属于一个存在的分组（删除分组时由调用方一并删除组内账号）。
    /// </summary>
    public class GroupStore
    {
        private const int MaxNameLength = 20;

        private readonly string _filePath;
        private readonly object _lock = new object();
        private List<GroupRecord> _groups = new List<GroupRecord>();

        public GroupStore()
        {
            string folder = AppPaths.DataFolder();
            if (!Directory.Exists(folder))
            {
                Directory.CreateDirectory(folder);
            }
            _filePath = Path.Combine(folder, "groups.json");
            Load();
        }

        private void Load()
        {
            var file = VaultFile.Read(_filePath);
            if (file == null) return;
            ReadOnlySpan<byte> json = file;
            if (json.StartsWith(new byte[] { 0xef, 0xbb, 0xbf })) json = json[3..];
            var groups = JsonSerializer.Deserialize<List<GroupRecord>>(json) ?? throw new InvalidDataException();
            var ids = new HashSet<string>(StringComparer.Ordinal);
            if (groups.Any(g => g == null || string.IsNullOrWhiteSpace(g.Id) ||
                string.IsNullOrWhiteSpace(g.Name) || !ids.Add(g.Id))) throw new InvalidDataException();
            _groups = groups;
        }

        private void Commit(List<GroupRecord> groups)
        {
            VaultFile.WriteAtomic(_filePath, JsonSerializer.SerializeToUtf8Bytes(groups));
            _groups = groups;
        }

        public List<GroupDto> List()
        {
            lock (_lock)
            {
                return _groups
                    .Select(ToDto)
                    .ToList();
            }
        }

        public bool Exists(string id)
        {
            lock (_lock)
            {
                return _groups.Any(g => g.Id == id);
            }
        }

        public GroupDto Add(string name)
        {
            string clean = NormalizeName(name);
            lock (_lock)
            {
                if (HasSameName(clean, null))
                {
                    throw new InvalidOperationException("分组名称已存在。");
                }

                var group = new GroupRecord
                {
                    Name = clean,
                    CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };
                Commit([.._groups, group]);
                return ToDto(group);
            }
        }

        /// <summary>按名称查找分组，不存在时创建；用于修复历史遗留的无分组账号。</summary>
        public GroupDto Ensure(string name)
        {
            string clean = NormalizeName(name);
            lock (_lock)
            {
                var existing = _groups.FirstOrDefault(g =>
                    string.Equals(g.Name, clean, StringComparison.OrdinalIgnoreCase));
                if (existing != null) return ToDto(existing);

                var group = new GroupRecord
                {
                    Name = clean,
                    CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                };
                Commit([.._groups, group]);
                return ToDto(group);
            }
        }

        public GroupDto? Rename(string id, string name)
        {
            string clean = NormalizeName(name);
            lock (_lock)
            {
                var group = _groups.FirstOrDefault(g => g.Id == id);
                if (group == null) return null;
                if (HasSameName(clean, id))
                {
                    throw new InvalidOperationException("分组名称已存在。");
                }

                group = group with { Name = clean };
                Commit(_groups.Select(g => g.Id == id ? group : g).ToList());
                return ToDto(group);
            }
        }

        public bool Delete(string id)
        {
            lock (_lock)
            {
                var updated = _groups.Where(g => g.Id != id).ToList();
                if (updated.Count == _groups.Count) return false;
                Commit(updated);
                return true;
            }
        }

        public bool Reorder(List<string> orderedIds)
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

                Commit(reordered);
                return true;
            }
        }

        private bool HasSameName(string name, string? excludeId)
        {
            return _groups.Any(g =>
                !string.Equals(g.Id, excludeId, StringComparison.Ordinal) &&
                string.Equals(g.Name, name, StringComparison.OrdinalIgnoreCase));
        }

        private static GroupDto ToDto(GroupRecord group)
        {
            return new GroupDto
            {
                Id = group.Id,
                Name = group.Name,
                CreatedAt = group.CreatedAt
            };
        }

        private static string NormalizeName(string name)
        {
            string clean = (name ?? "").Trim();
            if (clean.Length == 0)
            {
                throw new ArgumentException("请输入分组名称。");
            }
            return clean.Length > MaxNameLength ? clean.Substring(0, MaxNameLength) : clean;
        }
    }
}
