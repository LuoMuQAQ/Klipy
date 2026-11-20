using System;
using System.Collections.Generic;
using System.Text;
using System.Web;

namespace AuthenticatorBackend
{
    /// <summary>
    /// 解析 Google Authenticator 的 otpauth-migration://offline?data=... 导出链接
    /// （MigrationPayload protobuf）。只导入 TOTP 条目，HOTP / MD5 及损坏条目计入 skipped。
    /// </summary>
    public static class MigrationParser
    {
        public static MigrationPayloadDto Parse(string uriString)
        {
            if (string.IsNullOrWhiteSpace(uriString))
                throw new ArgumentException("链接不能为空。");

            string trimmed = uriString.Trim();
            if (!trimmed.StartsWith("otpauth-migration://", StringComparison.OrdinalIgnoreCase))
                throw new FormatException("不是 otpauth-migration:// 链接。");

            string data = ExtractDataParameter(trimmed);
            if (string.IsNullOrEmpty(data))
                throw new FormatException("链接缺少 data 参数。");

            byte[] blob;
            try
            {
                blob = Convert.FromBase64String(data);
            }
            catch (FormatException)
            {
                throw new FormatException("data 参数不是有效的 Base64。");
            }

            if (blob.Length == 0)
                throw new FormatException("data 参数为空。");

            var payload = new MigrationPayloadDto();
            int offset = 0;
            while (offset < blob.Length)
            {
                ulong key = ReadVarint(blob, ref offset);
                int field = (int)(key >> 3);
                int wire = (int)(key & 0x7);

                if (wire == 0)
                {
                    ulong value = ReadVarint(blob, ref offset);
                    if (field == 3) payload.BatchSize = (int)value;
                    else if (field == 4) payload.BatchIndex = (int)value;
                }
                else if (wire == 2)
                {
                    byte[] chunk = ReadBytes(blob, ref offset);
                    if (field == 1) ParseOtpParameters(chunk, payload);
                }
                else
                {
                    throw new FormatException("迁移数据包含不支持的字段类型。");
                }
            }

            return payload;
        }

        private static void ParseOtpParameters(byte[] chunk, MigrationPayloadDto payload)
        {
            int offset = 0;
            byte[] secret = Array.Empty<byte>();
            string name = "";
            string issuer = "";
            int algorithm = 0;
            int digits = 0;
            int type = 0;

            try
            {
                while (offset < chunk.Length)
                {
                    ulong key = ReadVarint(chunk, ref offset);
                    int field = (int)(key >> 3);
                    int wire = (int)(key & 0x7);

                    if (wire == 0)
                    {
                        ulong value = ReadVarint(chunk, ref offset);
                        switch (field)
                        {
                            case 4: algorithm = (int)value; break;
                            case 5: digits = (int)value; break;
                            case 6: type = (int)value; break;
                        }
                    }
                    else if (wire == 2)
                    {
                        byte[] bytes = ReadBytes(chunk, ref offset);
                        switch (field)
                        {
                            case 1: secret = bytes; break;
                            case 2: name = Encoding.UTF8.GetString(bytes).Trim(); break;
                            case 3: issuer = Encoding.UTF8.GetString(bytes).Trim(); break;
                        }
                    }
                    else
                    {
                        payload.Skipped++;
                        return;
                    }
                }
            }
            catch (Exception)
            {
                payload.Skipped++;
                return;
            }

            // type：0 = 未指定（按 TOTP 处理）、1 = HOTP、2 = TOTP；algorithm：4 = MD5（不支持）。
            if (secret.Length == 0 || type == 1 || algorithm == 4)
            {
                payload.Skipped++;
                return;
            }

            string secretBase32;
            try
            {
                secretBase32 = TotpEngine.EncodeBase32(secret);
                TotpEngine.DecodeBase32(secretBase32);
            }
            catch
            {
                payload.Skipped++;
                return;
            }

            payload.Accounts.Add(new MigrationAccountDto
            {
                Issuer = issuer,
                Account = name,
                Secret = secretBase32,
                Digits = digits == 2 ? 8 : 6,
                Period = 30,
                Algorithm = algorithm switch
                {
                    2 => "SHA256",
                    3 => "SHA512",
                    _ => "SHA1"
                }
            });
        }

        private static string ExtractDataParameter(string uri)
        {
            const string marker = "data=";
            int index = uri.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (index < 0) return "";

            string rest = uri.Substring(index + marker.Length);
            int separator = rest.IndexOf('&');
            if (separator >= 0) rest = rest.Substring(0, separator);

            // 查询串里的 '+' 按空格解释，但 base64 中不会出现真正的空格，
            // 这里把字面 '+' 还原为 %2B 再解码，兼容手工粘贴未转义的链接。
            return HttpUtility.UrlDecode(rest.Replace("+", "%2B")).Trim();
        }

        private static ulong ReadVarint(byte[] buffer, ref int offset)
        {
            ulong result = 0;
            int shift = 0;

            while (offset < buffer.Length)
            {
                byte current = buffer[offset++];
                result |= (ulong)(current & 0x7F) << shift;
                if ((current & 0x80) == 0) return result;

                shift += 7;
                if (shift > 63) break;
            }

            throw new FormatException("迁移数据损坏。");
        }

        private static byte[] ReadBytes(byte[] buffer, ref int offset)
        {
            int length = (int)ReadVarint(buffer, ref offset);
            if (length < 0 || offset + length > buffer.Length)
                throw new FormatException("迁移数据损坏。");

            var bytes = new byte[length];
            Buffer.BlockCopy(buffer, offset, bytes, 0, length);
            offset += length;
            return bytes;
        }
    }
}
