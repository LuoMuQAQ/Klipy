using System;
using System.Buffers.Binary;

namespace AuthenticatorBackend
{
    /// <summary>
    /// 账号图标编码：
    /// - 空字符串：按服务名称 / 账号自动匹配内置品牌图标（未命中回退名称缩写）；
    /// - <c>si:&lt;slug&gt;</c>：显式选择的内置品牌图标；
    /// - <c>data:image/png;base64,...</c>：前端居中裁切并缩放后的自定义图片。
    /// 图标与账号一同保存在 KLIPY-DPAPI-2 加密保险库中，不写入额外文件。
    /// </summary>
    public static class AccountIcon
    {
        public const int MaxEncodedLength = 256 * 1024;
        /// <summary>自定义图标边长上限；正常写入值为 128×128。</summary>
        public const int MaxPngEdge = 512;
        private const string BrandPrefix = "si:";
        private const string PngPrefix = "data:image/png;base64,";
        private static readonly byte[] PngSignature = { 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };

        public static string Normalize(string? icon) => (icon ?? "").Trim();

        public static bool IsValid(string? icon)
        {
            if (string.IsNullOrEmpty(icon)) return true;
            if (icon.Length > MaxEncodedLength && !icon.StartsWith(BrandPrefix, StringComparison.Ordinal))
                return false;

            if (icon.StartsWith(BrandPrefix, StringComparison.Ordinal))
            {
                if (icon.Length <= BrandPrefix.Length || icon.Length > BrandPrefix.Length + 64)
                    return false;
                for (int i = BrandPrefix.Length; i < icon.Length; i++)
                {
                    char c = icon[i];
                    if (!(c is >= 'a' and <= 'z' || c is >= '0' and <= '9' || c == '-'))
                        return false;
                }
                return true;
            }

            if (!icon.StartsWith(PngPrefix, StringComparison.Ordinal) || icon.Length > MaxEncodedLength)
                return false;

            string payload = icon.Substring(PngPrefix.Length);
            if (payload.Length == 0 || payload.Length % 4 != 0) return false;

            byte[] bytes;
            try
            {
                bytes = Convert.FromBase64String(payload);
            }
            catch (FormatException)
            {
                return false;
            }

            return bytes.Length > PngSignature.Length &&
                   bytes.AsSpan(0, PngSignature.Length).SequenceEqual(PngSignature) &&
                   HasAcceptableDimensions(bytes);
        }

        /// <summary>读取 IHDR 尺寸，拒绝异常大图，避免前端解码耗尽内存。</summary>
        private static bool HasAcceptableDimensions(byte[] bytes)
        {
            if (bytes.Length < 24 || !bytes.AsSpan(12, 4).SequenceEqual("IHDR"u8)) return false;
            int width = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(16, 4));
            int height = BinaryPrimitives.ReadInt32BigEndian(bytes.AsSpan(20, 4));
            return width is > 0 and <= MaxPngEdge && height is > 0 and <= MaxPngEdge;
        }
    }
}
