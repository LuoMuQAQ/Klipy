using System.Text.Json;

namespace AuthenticatorBackend;

public static class Program
{
    public static int Main()
    {
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;

        FileStream dataLock;
        try
        {
            string directory = AppPaths.DataFolder();
            Directory.CreateDirectory(directory);
            dataLock = new FileStream(Path.Combine(directory, ".klipy.lock"), FileMode.OpenOrCreate,
                FileAccess.ReadWrite, FileShare.None);
        }
        catch (Exception)
        {
            return 21;
        }

        using (dataLock)
        {
            AccountStore store;
            GroupStore groupStore;
            try
            {
                groupStore = new GroupStore();
                store = new AccountStore();
                var orphans = store.FindOrphanGroupIds(groupStore.Exists);
                if (orphans.Count > 0)
                {
                    var fallback = groupStore.Ensure("默认分组");
                    store.ReassignGroups(orphans, fallback.Id);
                }
            }
            catch (Exception)
            {
                // Report a stable startup error, never dump file contents or exceptions to stderr.
                return 20;
            }

            string? line;
            while ((line = Console.ReadLine()) != null)
            {
                if (line.Length > 512 * 1024) continue;
                line = line.TrimStart('\uFEFF');
                if (string.IsNullOrWhiteSpace(line)) continue;
                IpcResponse response;
                try
                {
                    var req = JsonSerializer.Deserialize<IpcRequest>(line, BackendDispatcher.JsonOptions);
                    if (req == null) continue;
                    response = BackendDispatcher.Dispatch(store, groupStore, req);
                }
                catch (JsonException)
                {
                    response = new IpcResponse { Success = false, Error = "请求格式无效。" };
                }
                Console.WriteLine(JsonSerializer.Serialize(response, BackendDispatcher.JsonOptions));
                Console.Out.Flush();
            }
        }
        return 0;
    }
}
