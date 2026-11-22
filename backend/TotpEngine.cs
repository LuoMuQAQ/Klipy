using System;
using System.Buffers.Binary;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Web;

namespace AuthenticatorBackend
{
    public static class TotpEngine
    {
        public static byte[] DecodeBase32(string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                throw new ArgumentException("请输入密钥。");

            // Remove spaces, hyphens, and padding
            string cleaned = input.Trim().Replace(" ", "").Replace("-", "").TrimEnd('=').ToUpperInvariant();
            const string base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

            var result = new byte[(int)((long)cleaned.Length * 5 / 8)];
            if (result.Length == 0) throw new FormatException("密钥无效。");
            int buffer = 0, bits = 0, output = 0;
            foreach (char c in cleaned)
            {
                int value = base32Chars.IndexOf(c);
                if (value < 0)
                {
                    CryptographicOperations.ZeroMemory(result);
                    throw new FormatException("密钥含有无效的 Base32 字符。");
                }
                buffer = (buffer << 5) | value;
                bits += 5;
                if (bits >= 8)
                {
                    bits -= 8;
                    result[output++] = (byte)(buffer >> bits);
                }
            }
            return result;
        }

        public static void ValidateSecret(string secret) => CryptographicOperations.ZeroMemory(DecodeBase32(secret));

        public static string NormalizeAlgorithm(string? algorithm)
        {
            return (algorithm ?? "SHA1").Trim().ToUpperInvariant() switch
            {
                "SHA1" => "SHA1",
                "SHA256" => "SHA256",
                "SHA512" => "SHA512",
                _ => throw new FormatException("不支持该 TOTP 算法。"),
            };
        }

        /// <summary>
        /// 把二进制密钥编码为不带填充的标准 Base32（Google Authenticator 迁移数据用）。
        /// </summary>
        public static string EncodeBase32(ReadOnlySpan<byte> data)
        {
            const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            var builder = new StringBuilder((data.Length * 8 + 4) / 5);
            int buffer = 0;
            int bitsLeft = 0;

            foreach (byte b in data)
            {
                buffer = (buffer << 8) | b;
                bitsLeft += 8;
                while (bitsLeft >= 5)
                {
                    builder.Append(alphabet[(buffer >> (bitsLeft - 5)) & 0x1F]);
                    bitsLeft -= 5;
                }
            }

            if (bitsLeft > 0)
            {
                builder.Append(alphabet[(buffer << (5 - bitsLeft)) & 0x1F]);
            }

            return builder.ToString();
        }

        public static string GenerateCode(string secret, long timestampSeconds, int digits = 6, int period = 30, string algorithm = "SHA1")
        {
            byte[] key = DecodeBase32(secret);
            Span<byte> counter = stackalloc byte[8];
            Span<byte> hash = stackalloc byte[64];
            try
            {
                BinaryPrimitives.WriteInt64BigEndian(counter, timestampSeconds / period);
                int length = algorithm.ToUpperInvariant() switch
                {
                    "SHA256" => HMACSHA256.HashData(key, counter, hash),
                    "SHA512" => HMACSHA512.HashData(key, counter, hash),
                    // Preserve historical behavior for already-saved accounts.
                    _ => HMACSHA1.HashData(key, counter, hash),
                };
                int offset = hash[length - 1] & 0x0F;
                uint binary = BinaryPrimitives.ReadUInt32BigEndian(hash[offset..]) & 0x7FFFFFFF;
                uint code = binary % (digits == 8 ? 100_000_000u : 1_000_000u);
                return code.ToString(digits == 8 ? "D8" : "D6", CultureInfo.InvariantCulture);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(key);
                CryptographicOperations.ZeroMemory(hash);
            }
        }

        public static int GetRemainingSeconds(long timestampSeconds, int period = 30)
        {
            int elapsed = (int)(timestampSeconds % period);
            return period - elapsed;
        }

        public static (string issuer, string account, string secret, int digits, int period, string algorithm) ParseOtpAuthUri(string uriString)
        {
            if (string.IsNullOrWhiteSpace(uriString))
                throw new ArgumentException("URI cannot be empty.");

            if (!uriString.StartsWith("otpauth://totp/", StringComparison.OrdinalIgnoreCase))
                throw new FormatException("Invalid OTP Auth URI format. Must start with otpauth://totp/");

            var uri = new Uri(uriString);
            var query = HttpUtility.ParseQueryString(uri.Query);
            string label = uri.AbsolutePath.TrimStart('/');
            string issuer = query["issuer"]?.Trim() ?? "";
            string account;

            // Our exports escape each component independently; keep escaped colons inside it.
            int separator = label.IndexOf(':');
            if (separator >= 0)
            {
                issuer = Uri.UnescapeDataString(label[..separator]).Trim();
                account = Uri.UnescapeDataString(label[(separator + 1)..]).Trim();
            }
            else
            {
                account = Uri.UnescapeDataString(label).Trim();
                // Other authenticators can encode the label separator as %3A.
                if (issuer.Length > 0)
                {
                    if (account.StartsWith(issuer + ":", StringComparison.OrdinalIgnoreCase))
                        account = account[(issuer.Length + 1)..].Trim();
                }
                else if ((separator = account.IndexOf(':')) >= 0)
                {
                    issuer = account[..separator].Trim();
                    account = account[(separator + 1)..].Trim();
                }
            }
            string secret = query["secret"] ?? "";
            ValidateSecret(secret);
            int digits = query["digits"] is { } digitsText
                ? int.TryParse(digitsText, out int d) && d is 6 or 8 ? d : throw new FormatException("只支持 6 位或 8 位验证码。")
                : 6;
            int period = query["period"] is { } periodText
                ? int.TryParse(periodText, out int p) && p > 0 ? p : throw new FormatException("验证码周期必须为正整数。")
                : 30;
            string algorithm = NormalizeAlgorithm(query["algorithm"]);

            return (issuer, account, secret, digits, period, algorithm);
        }
    }
}
