using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace AuthenticatorBackend
{
    public record AccountRecord
    {
        public override string ToString() => nameof(AccountRecord);

        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString("N");

        [JsonPropertyName("issuer")]
        public string Issuer { get; set; } = "";

        [JsonPropertyName("account")]
        public string Account { get; set; } = "";

        [JsonPropertyName("secret")]
        public string Secret { get; set; } = "";

        [JsonPropertyName("digits")]
        public int Digits { get; set; } = 6;

        [JsonPropertyName("period")]
        public int Period { get; set; } = 30;

        [JsonPropertyName("algorithm")]
        public string Algorithm { get; set; } = "SHA1";

        [JsonPropertyName("groupId")]
        public string GroupId { get; set; } = "";

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    public class AccountDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("issuer")]
        public string Issuer { get; set; } = "";

        [JsonPropertyName("account")]
        public string Account { get; set; } = "";

        [JsonPropertyName("code")]
        public string Code { get; set; } = "";

        [JsonPropertyName("remainingSeconds")]
        public int RemainingSeconds { get; set; }

        [JsonPropertyName("period")]
        public int Period { get; set; }

        [JsonPropertyName("digits")]
        public int Digits { get; set; }

        [JsonPropertyName("algorithm")]
        public string Algorithm { get; set; } = "SHA1";

        [JsonPropertyName("groupId")]
        public string GroupId { get; set; } = "";

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; }
    }

    public class ExportAccountDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("issuer")]
        public string Issuer { get; set; } = "";

        [JsonPropertyName("account")]
        public string Account { get; set; } = "";

        [JsonPropertyName("secret")]
        public string Secret { get; set; } = "";

        [JsonPropertyName("uri")]
        public string Uri { get; set; } = "";

        [JsonPropertyName("digits")]
        public int Digits { get; set; }

        [JsonPropertyName("period")]
        public int Period { get; set; }

        [JsonPropertyName("algorithm")]
        public string Algorithm { get; set; } = "SHA1";
    }

    /// <summary>用户自建分组（保存在 groups.json）。</summary>
    public record GroupRecord
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString("N");

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    public class GroupDto
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = "";

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; }
    }

    /// <summary>Google Authenticator 迁移链接里的单个 TOTP 账号。</summary>
    public class MigrationAccountDto
    {
        [JsonPropertyName("issuer")]
        public string Issuer { get; set; } = "";

        [JsonPropertyName("account")]
        public string Account { get; set; } = "";

        [JsonPropertyName("secret")]
        public string Secret { get; set; } = "";

        [JsonPropertyName("digits")]
        public int Digits { get; set; } = 6;

        [JsonPropertyName("period")]
        public int Period { get; set; } = 30;

        [JsonPropertyName("algorithm")]
        public string Algorithm { get; set; } = "SHA1";
    }

    /// <summary>迁移链接解析结果；skipped 记录无法导入的条目数（HOTP / MD5 / 损坏）。</summary>
    public class MigrationPayloadDto
    {
        [JsonPropertyName("accounts")]
        public List<MigrationAccountDto> Accounts { get; set; } = new List<MigrationAccountDto>();

        [JsonPropertyName("skipped")]
        public int Skipped { get; set; }

        [JsonPropertyName("batchSize")]
        public int BatchSize { get; set; }

        [JsonPropertyName("batchIndex")]
        public int BatchIndex { get; set; }
    }

    public class IpcRequest
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("action")]
        public string Action { get; set; } = "";

        [JsonPropertyName("params")]
        public System.Text.Json.JsonElement? Params { get; set; }
    }

    public class IpcResponse
    {
        [JsonPropertyName("id")]
        public string? Id { get; set; }

        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("data")]
        public object? Data { get; set; }

        [JsonPropertyName("error")]
        public string? Error { get; set; }
    }
}
