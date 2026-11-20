using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Web;

namespace AuthenticatorBackend
{
    public static class TotpEngine
    {
        public static byte[] DecodeBase32(string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                throw new ArgumentException("Secret key cannot be empty.");

            // Remove spaces, hyphens, and padding
            string cleaned = input.Trim().Replace(" ", "").Replace("-", "").TrimEnd('=').ToUpperInvariant();
            const string base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

            var bits = new List<byte>();
            foreach (char c in cleaned)
            {
                int val = base32Chars.IndexOf(c);
                if (val < 0)
                {
                    throw new FormatException($"Invalid character '{c}' in Base32 secret.");
                }

                for (int i = 4; i >= 0; i--)
                {
                    bits.Add((byte)((val >> i) & 1));
                }
            }

            int byteCount = bits.Count / 8;
            byte[] result = new byte[byteCount];
            for (int i = 0; i < byteCount; i++)
            {
                byte b = 0;
                for (int j = 0; j < 8; j++)
                {
                    b = (byte)((b << 1) | bits[i * 8 + j]);
                }
                result[i] = b;
            }

            return result;
        }

        /// <summary>
        /// 把二进制密钥编码为不带填充的标准 Base32（Google Authenticator 迁移数据用）。
        /// </summary>
        public static string EncodeBase32(byte[] data)
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
            long counter = timestampSeconds / period;

            byte[] counterBytes = BitConverter.GetBytes(counter);
            if (BitConverter.IsLittleEndian)
            {
                Array.Reverse(counterBytes);
            }

            byte[] hash;
            switch (algorithm.ToUpperInvariant())
            {
                case "SHA256":
                    using (var hmac256 = new HMACSHA256(key))
                    {
                        hash = hmac256.ComputeHash(counterBytes);
                    }
                    break;
                case "SHA512":
                    using (var hmac512 = new HMACSHA512(key))
                    {
                        hash = hmac512.ComputeHash(counterBytes);
                    }
                    break;
                case "SHA1":
                default:
                    using (var hmac1 = new HMACSHA1(key))
                    {
                        hash = hmac1.ComputeHash(counterBytes);
                    }
                    break;
            }

            int offset = hash[hash.Length - 1] & 0x0F;
            int binary = ((hash[offset] & 0x7F) << 24)
                       | ((hash[offset + 1] & 0xFF) << 16)
                       | ((hash[offset + 2] & 0xFF) << 8)
                       | (hash[offset + 3] & 0xFF);

            int modulo = (int)Math.Pow(10, digits);
            int code = binary % modulo;

            return code.ToString().PadLeft(digits, '0');
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
            string path = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
            
            string issuer = "";
            string account = path;

            if (path.Contains(':'))
            {
                var parts = path.Split(new[] { ':' }, 2);
                issuer = parts[0].Trim();
                account = parts[1].Trim();
            }

            var query = System.Web.HttpUtility.ParseQueryString(uri.Query);
            string secret = query["secret"] ?? "";
            
            if (string.IsNullOrEmpty(issuer) && !string.IsNullOrEmpty(query["issuer"]))
            {
                issuer = query["issuer"] ?? "";
            }

            int digits = 6;
            if (int.TryParse(query["digits"], out int d) && (d == 6 || d == 8))
            {
                digits = d;
            }

            int period = 30;
            if (int.TryParse(query["period"], out int p) && p > 0)
            {
                period = p;
            }

            string algorithm = query["algorithm"] ?? "SHA1";

            return (issuer, account, secret, digits, period, algorithm);
        }
    }
}
