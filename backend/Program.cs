using System.Text.Json;

namespace AuthenticatorBackend
{
    public class Program
    {
        public static void Main(string[] args)
        {
            Console.InputEncoding = System.Text.Encoding.UTF8;
            Console.OutputEncoding = System.Text.Encoding.UTF8;

            var store = new AccountStore();
            var groupStore = new GroupStore();

            // 账号必须属于一个存在的分组。旧版本允许「未分组」，或分组文件被删除后会留下孤儿账号，
            // 这里把它们收进「默认分组」，避免账号在界面上不可见。
            try
            {
                var orphans = store.FindOrphanGroupIds(groupStore.Exists);
                if (orphans.Count > 0)
                {
                    var fallback = groupStore.Ensure("默认分组");
                    store.ReassignGroups(orphans, fallback.Id);
                }
            }
            catch
            {
                // 修复失败不应阻止后端启动。
            }

            string? line;
            while ((line = Console.ReadLine()) != null)
            {
                // 容忍被管道写入的 UTF-8 BOM，避免首条请求整行解析失败。
                line = line.TrimStart('\uFEFF');
                if (string.IsNullOrWhiteSpace(line)) continue;

                IpcResponse response;
                try
                {
                    var req = JsonSerializer.Deserialize<IpcRequest>(line, BackendDispatcher.JsonOptions);
                    if (req == null) continue;
                    response = BackendDispatcher.Dispatch(store, groupStore, req);
                }
                catch (Exception ex)
                {
                    response = new IpcResponse
                    {
                        Success = false,
                        Error = ex.Message
                    };
                }

                Console.WriteLine(JsonSerializer.Serialize(response, BackendDispatcher.JsonOptions));
                Console.Out.Flush();
            }
        }
    }
}
