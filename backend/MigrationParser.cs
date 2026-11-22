using System;
using System.Security.Cryptography;
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

            try { return ParsePayload(blob); }
            finally { CryptographicOperations.ZeroMemory(blob); }
        }

        private static MigrationPayloadDto ParsePayload(ReadOnlySpan<byte> blob)
        {
            var payload = new MigrationPayloadDto();
            int offset = 0;
            while (offset < blob.Length)
            {
                ulong key = ReadVarint(blob, ref offset);
                ulong field = key >> 3;
                int wire = (int)(key & 0x7);

                if (wire == 0)
                {
                    ulong value = ReadVarint(blob, ref offset);
                    if (field == 3) payload.BatchSize = ReadBatchValue(value);
                    else if (field == 4) payload.BatchIndex = ReadBatchValue(value);
                }
                else if (wire == 2)
                {
                    var chunk = ReadBytes(blob, ref offset);
                    if (field == 1) ParseOtpParameters(chunk, payload);
                }
                else
                {
                    throw new FormatException("迁移数据包含不支持的字段类型。");
                }
            }

            return payload;
        }

        private static void ParseOtpParameters(ReadOnlySpan<byte> chunk, MigrationPayloadDto payload)
        {
            int offset = 0;
            ReadOnlySpan<byte> secret = [];
            string name = "";
            string issuer = "";
            ulong algorithm = 0;
            ulong digits = 0;
            ulong type = 0;

            try
            {
                while (offset < chunk.Length)
                {
                    ulong key = ReadVarint(chunk, ref offset);
                    ulong field = key >> 3;
                    int wire = (int)(key & 0x7);

                    if (wire == 0)
                    {
                        ulong value = ReadVarint(chunk, ref offset);
                        switch (field)
                        {
                            case 4: algorithm = value; break;
                            case 5: digits = value; break;
                            case 6: type = value; break;
                        }
                    }
                    else if (wire == 2)
                    {
                        var bytes = ReadBytes(chunk, ref offset);
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
            catch (FormatException)
            {
                payload.Skipped++;
                return;
            }

            // 0 in each enum means unspecified; keep existing defaults only for that value.
            if (secret.IsEmpty || type is not (0 or 2) || algorithm > 3 || digits > 2)
            {
                payload.Skipped++;
                return;
            }

            payload.Accounts.Add(new MigrationAccountDto
            {
                Issuer = issuer,
                Account = name,
                Secret = TotpEngine.EncodeBase32(secret),
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

        private static string ExtractDataParameter(string input)
        {
            if (!Uri.TryCreate(input, UriKind.Absolute, out var uri))
                throw new FormatException("迁移链接无效。");

            foreach (var parameter in uri.Query.TrimStart('?').Split('&'))
            {
                int index = parameter.IndexOf('=');
                if (index < 0 || !string.Equals(HttpUtility.UrlDecode(parameter[..index]), "data", StringComparison.OrdinalIgnoreCase))
                    continue;

                // A pasted raw Base64 '+' is a literal, not a form-encoded space.
                return HttpUtility.UrlDecode(parameter[(index + 1)..].Replace("+", "%2B")).Trim();
            }
            return "";
        }

        private static int ReadBatchValue(ulong value) => value <= int.MaxValue
            ? (int)value : throw new FormatException("迁移批次信息无效。");

        private static ulong ReadVarint(ReadOnlySpan<byte> buffer, ref int offset)
        {
            ulong result = 0;
            int shift = 0;

            while (offset < buffer.Length)
            {
                byte current = buffer[offset++];
                if (shift == 63 && current > 1) break;
                result |= (ulong)(current & 0x7F) << shift;
                if ((current & 0x80) == 0) return result;

                shift += 7;
                if (shift > 63) break;
            }

            throw new FormatException("迁移数据损坏。");
        }

        private static ReadOnlySpan<byte> ReadBytes(ReadOnlySpan<byte> buffer, scoped ref int offset)
        {
            ulong length = ReadVarint(buffer, ref offset);
            if (length > (ulong)(buffer.Length - offset)) throw new FormatException("迁移数据损坏。");
            var bytes = buffer.Slice(offset, (int)length);
            offset += (int)length;
            return bytes;
        }

    }
}
