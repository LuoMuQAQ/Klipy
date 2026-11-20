using System;
using System.IO;

namespace AuthenticatorBackend
{
    internal static class AppPaths
    {
        /// <summary>
        /// 数据目录：默认 `%APPDATA%\WindowsAuthenticatorDemo`；
        /// 设置环境变量 `AUTHENTICATOR_DATA_DIR` 可改用其他目录（便携运行 / 自动化测试用）。
        /// </summary>
        public static string DataFolder()
        {
            string? overrideDir = Environment.GetEnvironmentVariable("AUTHENTICATOR_DATA_DIR");
            if (!string.IsNullOrWhiteSpace(overrideDir))
            {
                return overrideDir!;
            }

            string appData = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
            return Path.Combine(appData, "WindowsAuthenticatorDemo");
        }
    }
}
