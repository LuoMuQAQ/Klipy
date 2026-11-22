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

        [JsonPropertyName("validUntil")]
        public long ValidUntil { get; set; }

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

    /// <summary>用户自建分组（与账号一并保存在统一加密保险库中）。</summary>
    public record GroupRecord
    {
        [JsonPropertyName("id")]
        public string Id { get; set; } = Guid.NewGuid().ToString("N");

        [JsonPropertyName("name")]
        public string Name { get; set; } = "";

        [JsonPropertyName("createdAt")]
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
    }

    public sealed class VaultSnapshot
    {
        [JsonPropertyName("groups")]
        public List<GroupRecord> Groups { get; set; } = new List<GroupRecord>();

        [JsonPropertyName("accounts")]
        public List<AccountRecord> Accounts { get; set; } = new List<AccountRecord>();
    }

    public sealed class BatchAccountInput
    {
        public string Issuer { get; init; } = "";
        public string Account { get; init; } = "";
        public string Secret { get; init; } = "";
        public int Digits { get; init; } = 6;
        public int Period { get; init; } = 30;
        public string Algorithm { get; init; } = "SHA1";
    }

    public sealed class BatchImportResultDto
    {
        [JsonPropertyName("added")]
        public int Added { get; set; }

        [JsonPropertyName("duplicates")]
        public int Duplicates { get; set; }

        [JsonPropertyName("accounts")]
        public List<AccountDto> Accounts { get; set; } = new List<AccountDto>();
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
