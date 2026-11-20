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

        public static IpcResponse Dispatch(AccountStore store, GroupStore groupStore, IpcRequest req)
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
                        if (req.Params.HasValue)
                        {
                            var p = req.Params.Value;
                            string issuer = p.TryGetProperty("issuer", out var propIss) ? propIss.GetString() ?? "" : "";
                            string account = p.TryGetProperty("account", out var propAcc) ? propAcc.GetString() ?? "" : "";
                            string secret = p.TryGetProperty("secret", out var propSec) ? propSec.GetString() ?? "" : "";
                            int digits = p.TryGetProperty("digits", out var propDig) ? propDig.GetInt32() : 6;
                            int period = p.TryGetProperty("period", out var propPer) ? propPer.GetInt32() : 30;
                            string algo = p.TryGetProperty("algorithm", out var propAlg) ? propAlg.GetString() ?? "SHA1" : "SHA1";
                            string groupId = ReadString(req.Params, "groupId").Trim();
                            if (groupId.Length == 0)
                            {
                                response.Success = false;
                                response.Error = "请先选择分组。";
                                break;
                            }
                            if (!groupStore.Exists(groupId))
                            {
                                response.Success = false;
                                response.Error = "分组不存在。";
                                break;
                            }

                            response.Success = true;
                            response.Data = store.AddAccount(issuer, account, secret, digits, period, algo, groupId);
                        }
                        else
                        {
                            response.Success = false;
                            response.Error = "Missing parameters for add action.";
                        }
                        break;

                    case "delete":
                        if (req.Params.HasValue)
                        {
                            var p = req.Params.Value;
                            string id = p.TryGetProperty("id", out var propId) ? propId.GetString() ?? "" : "";
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
                            var p = req.Params.Value;
                            string id = p.TryGetProperty("id", out var propId) ? propId.GetString() ?? "" : "";
                            string issuer = p.TryGetProperty("issuer", out var propIss) ? propIss.GetString() ?? "" : "";
                            string account = p.TryGetProperty("account", out var propAcc) ? propAcc.GetString() ?? "" : "";
                            string groupId = ReadString(req.Params, "groupId").Trim();
                            if (groupId.Length == 0)
                            {
                                response.Success = false;
                                response.Error = "请先选择分组。";
                                break;
                            }
                            if (!groupStore.Exists(groupId))
                            {
                                response.Success = false;
                                response.Error = "分组不存在。";
                                break;
                            }

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
                            var p = req.Params.Value;
                            string uri = p.TryGetProperty("uri", out var propUri) ? propUri.GetString() ?? "" : "";
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
                        response.Data = groupStore.List();
                        break;

                    case "groupadd":
                        response.Success = true;
                        response.Data = groupStore.Add(ReadString(req.Params, "name"));
                        break;

                    case "grouprename":
                    {
                        var id = ReadString(req.Params, "id");
                        var name = ReadString(req.Params, "name");
                        var updated = groupStore.Rename(id, name);
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
                        if (!groupStore.Delete(id))
                        {
                            response.Success = false;
                            response.Error = "分组不存在。";
                            break;
                        }

                        int removed = store.DeleteByGroup(id);
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
                            bool reordered = groupStore.Reorder(ids);
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
                            var p = req.Params.Value;
                            string secret = p.TryGetProperty("secret", out var propSec) ? propSec.GetString() ?? "" : "";
                            TotpEngine.DecodeBase32(secret);
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
                            var p = req.Params.Value;
                            string id = p.TryGetProperty("id", out var propId) ? propId.GetString() ?? "" : "";
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
