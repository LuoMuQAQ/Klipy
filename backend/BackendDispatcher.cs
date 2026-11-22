using System.Text.Json;

namespace AuthenticatorBackend
{
    public static class BackendDispatcher
    {
        public static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            WriteIndented = false
        };

        private static string ReadString(JsonElement? parameters, string name)
        {
            return parameters is { ValueKind: JsonValueKind.Object } p &&
                   p.TryGetProperty(name, out var value) &&
                   value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? ""
                : "";
        }

        private static int ReadOptionalInt(JsonElement obj, string name, int fallback)
        {
            if (!obj.TryGetProperty(name, out var value) || value.ValueKind == JsonValueKind.Null)
                return fallback;
            if (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out int parsed))
                throw new ArgumentException("参数类型无效。");
            return parsed;
        }

        public static IpcResponse Dispatch(VaultStore store, IpcRequest req)
        {
            var response = new IpcResponse { Id = req.Id };

            try
            {
                switch ((req.Action ?? "").ToLowerInvariant())
                {
                    case "ping":
                        response.Success = true;
                        response.Data = new { message = "pong", time = DateTimeOffset.UtcNow.ToUnixTimeSeconds() };
                        break;

                    case "copycode":
                        var requested = store.GetAccountWithCode(ReadString(req.Params, "id"));
                        response.Success = true;
                        response.Data = requested != null && PrivateClipboard.Write(requested.Code);
                        break;

                    case "copyprivate":
                        response.Success = PrivateClipboard.Write(ReadString(req.Params, "text"));
                        if (!response.Success) response.Error = "无法写入剪贴板。";
                        else response.Data = true;
                        break;

                    case "list":
                        response.Success = true;
                        response.Data = store.GetAccountsWithCodes();
                        break;

                    case "add":
                        if (req.Params is { ValueKind: JsonValueKind.Object } addParams)
                        {
                            string issuer = ReadString(req.Params, "issuer");
                            string account = ReadString(req.Params, "account");
                            string secret = ReadString(req.Params, "secret");
                            int digits = ReadOptionalInt(addParams, "digits", 6);
                            int period = ReadOptionalInt(addParams, "period", 30);
                            string algo = addParams.TryGetProperty("algorithm", out var propAlg) && propAlg.ValueKind == JsonValueKind.String
                                ? propAlg.GetString() ?? "SHA1"
                                : "SHA1";
                            string groupId = ReadString(req.Params, "groupId");

                            response.Success = true;
                            response.Data = store.AddAccount(issuer, account, secret, digits, period, algo, groupId);
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing parameters for add action.";
                        }
                        break;

                    case "addbatch":
                        if (req.Params is { ValueKind: JsonValueKind.Object } batchParams &&
                            batchParams.TryGetProperty("accounts", out var batchAccounts) &&
                            batchAccounts.ValueKind == JsonValueKind.Array)
                        {
                            string groupId = ReadString(req.Params, "groupId");
                            var items = new List<BatchAccountInput>();
                            foreach (var entry in batchAccounts.EnumerateArray())
                            {
                                if (entry.ValueKind != JsonValueKind.Object)
                                    throw new ArgumentException("批量导入包含无效条目。");
                                items.Add(new BatchAccountInput
                                {
                                    Issuer = ReadString(entry, "issuer"),
                                    Account = ReadString(entry, "account"),
                                    Secret = ReadString(entry, "secret"),
                                    Digits = ReadOptionalInt(entry, "digits", 6),
                                    Period = ReadOptionalInt(entry, "period", 30),
                                    Algorithm = entry.TryGetProperty("algorithm", out var propAlg) && propAlg.ValueKind == JsonValueKind.String
                                        ? propAlg.GetString() ?? "SHA1"
                                        : "SHA1"
                                });
                            }

                            response.Success = true;
                            response.Data = store.AddAccountsBatch(groupId, items);
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing parameters for addbatch action.";
                        }
                        break;

                    case "delete":
                        if (req.Params.HasValue)
                        {
                            string id = ReadString(req.Params, "id");
                            bool deleted = store.DeleteAccount(id);
                            response.Success = deleted;
                            if (!deleted)
                            {
                                response.Error = "Account not found or already deleted.";
                            }
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing parameters for delete action.";
                        }
                        break;

                    case "update":
                        if (req.Params.HasValue)
                        {
                            string id = ReadString(req.Params, "id");
                            string issuer = ReadString(req.Params, "issuer");
                            string account = ReadString(req.Params, "account");
                            string groupId = ReadString(req.Params, "groupId");

                            var updated = store.UpdateAccount(id, issuer, account, groupId);
                            if (updated != null)
                            {
                                response.Success = true;
                                response.Data = updated;
                            }
                            else
                            {
                                response.Success = false;
                                response.Error = "Account not found.";
                            }
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing parameters for update action.";
                        }
                        break;

                    case "parseuri":
                        if (req.Params.HasValue)
                        {
                            string uri = ReadString(req.Params, "uri");
                            var parsed = TotpEngine.ParseOtpAuthUri(uri);
                            response.Success = true;
                            response.Data = new
                            {
                                issuer = parsed.issuer,
                                account = parsed.account,
                                secret = parsed.secret,
                                digits = parsed.digits,
                                period = parsed.period,
                                algorithm = parsed.algorithm
                            };
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing parameters for parseUri action.";
                        }
                        break;

                    case "parsemigration":
                    {
                        var uri = ReadString(req.Params, "uri");
                        response.Data = MigrationParser.Parse(uri);
                        response.Success = true;
                        break;
                    }

                    case "grouplist":
                        response.Success = true;
                        response.Data = store.ListGroups();
                        break;

                    case "groupadd":
                        response.Success = true;
                        response.Data = store.AddGroup(ReadString(req.Params, "name"));
                        break;

                    case "grouprename":
                    {
                        var id = ReadString(req.Params, "id");
                        var name = ReadString(req.Params, "name");
                        var updated = store.RenameGroup(id, name);
                        if (updated == null)
                        {
                            response.Success = false;
                            response.Error = "分组不存在。";
                        }
                        else
                        {
                            response.Success = true;
                            response.Data = updated;
                        }
                        break;
                    }

                    case "groupdelete":
                    {
                        var id = ReadString(req.Params, "id");
                        var (deleted, removed) = store.DeleteGroup(id);
                        if (!deleted)
                        {
                            response.Success = false;
                            response.Error = "分组不存在。";
                            break;
                        }

                        response.Success = true;
                        response.Data = new { deleted = true, removedAccounts = removed };
                        break;
                    }

                    case "groupreorder":
                        if (req.Params.HasValue && req.Params.Value.TryGetProperty("ids", out var propGroupIds) && propGroupIds.ValueKind == JsonValueKind.Array)
                        {
                            var ids = new List<string>();
                            foreach (var item in propGroupIds.EnumerateArray())
                            {
                                var s = item.GetString();
                                if (!string.IsNullOrEmpty(s)) ids.Add(s);
                            }
                            bool reordered = store.ReorderGroups(ids);
                            response.Success = reordered;
                            if (!reordered)
                            {
                                response.Error = "分组排序失败。";
                            }
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing ids array for groupreorder action.";
                        }
                        break;

                    case "validatesecret":
                        if (req.Params.HasValue)
                        {
                            string secret = ReadString(req.Params, "secret");
                            TotpEngine.ValidateSecret(secret);
                            response.Success = true;
                            response.Data = new { valid = true };
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing secret parameter.";
                        }
                        break;

                    case "reorder":
                        if (req.Params.HasValue && req.Params.Value.TryGetProperty("ids", out var propIds) && propIds.ValueKind == JsonValueKind.Array)
                        {
                            var ids = new List<string>();
                            foreach (var item in propIds.EnumerateArray())
                            {
                                var s = item.GetString();
                                if (!string.IsNullOrEmpty(s)) ids.Add(s);
                            }
                            bool reordered = store.ReorderAccounts(ids);
                            response.Success = reordered;
                            if (!reordered)
                            {
                                response.Error = "Failed to reorder accounts.";
                            }
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing ids array for reorder action.";
                        }
                        break;

                    case "export":
                        if (req.Params.HasValue)
                        {
                            string id = ReadString(req.Params, "id");
                            var exported = store.ExportAccount(id);
                            if (exported != null)
                            {
                                response.Success = true;
                                response.Data = exported;
                            }
                            else
                            {
                                response.Success = false;
                                response.Error = "Account not found.";
                            }
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing id parameter for export action.";
                        }
                        break;

                    default:
                        response.Success = false;
                        response.Error = $"Unknown action: {req.Action}";
                        break;
                }
            }
            catch (Exception ex)
            {
                response.Success = false;
                response.Error = ex is ArgumentException or FormatException ||
                    (ex is InvalidOperationException && ex.Message == "分组名称已存在。")
                    ? ex.Message : "操作失败，未能完成请求。";
            }

            return response;
        }
    }
}
