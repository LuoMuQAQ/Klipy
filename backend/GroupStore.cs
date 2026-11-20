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
            lock (_lock)
            {
                if (!File.Exists(_filePath)) return;

                try
                {
                    var list = JsonSerializer.Deserialize<List<GroupRecord>>(File.ReadAllText(_filePath));
                    if (list != null)
                    {
                        _groups = list
                            .Where(g => !string.IsNullOrWhiteSpace(g.Id) && !string.IsNullOrWhiteSpace(g.Name))
                            .ToList();
                    }
                }
                catch
                {
                    // 分组文件损坏时从空分组开始，不影响账号库。
                    _groups = new List<GroupRecord>();
                }
            }
        }

        private void SaveUnsafe()
        {
            var options = new JsonSerializerOptions { WriteIndented = true };
            File.WriteAllText(_filePath, JsonSerializer.Serialize(_groups, options));
        }

        public List<GroupDto> List()
        {
            lock (_lock)
            {
                return _groups
                    .OrderBy(g => g.CreatedAt)
                    .ThenBy(g => g.Name, StringComparer.OrdinalIgnoreCase)
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
                _groups.Add(group);
                SaveUnsafe();
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
                _groups.Add(group);
                SaveUnsafe();
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

                group.Name = clean;
                SaveUnsafe();
                return ToDto(group);
            }
        }

        public bool Delete(string id)
        {
            lock (_lock)
            {
                int removed = _groups.RemoveAll(g => g.Id == id);
                if (removed == 0) return false;
                SaveUnsafe();
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
