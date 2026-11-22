# 更新与验证日志 (Changelog)

本文档归档 Klipy 历次重要功能演进与验证记录；当前有效架构与开发约束以 [`HANDOFF.md`](HANDOFF.md) 为准。

---

## v1.1.0（2026-11-22）

- **统一单文件原子加密保险库（`KLIPY-DPAPI-2`）**：
  - 将原先拆分的 `AccountStore` / `GroupStore` 合并为 [`backend/VaultStore.cs`](backend/VaultStore.cs)，分组与账号统一写入单个 Windows DPAPI 加密文件 `%APPDATA%\WindowsAuthenticatorDemo\accounts.json`。
  - 每次变更通过临时文件刷盘 + 解密往返校验 + `File.Replace` 一次性原子提交；删除分组与组内账号彻底消除跨文件不一致风险，且分组名称一并受到 DPAPI 加密保护。
  - 启动时自动无缝迁移旧版明文 JSON、`KLIPY-DPAPI-1` 及独立的 `groups.json`，校验落盘后再清理旧 `groups.json`；若遇旧迁移中断后残留的 `groups.json`，以 `KLIPY-DPAPI-2` 为准并自动清理。
- **批量导入事务化与同密钥自动去重（`addbatch`）**：
  - 新增 `addbatch` 后端动作与 `authenticator:addBatch` IPC 通道，Google Authenticator 迁移导入整批校验、单次加密写盘。
  - 按「解码后密钥字节 + 有效算法 + 位数 + 周期」生成 SHA-256 指纹自动去重（允许同名但不同密钥并存），重复导入幂等且不重写磁盘。
- **审查加固合入与交互增强**：
  - 合并全量代码审查修复（见 [`REVIEW.md`](REVIEW.md)）：真实到期时间刷新、复制时后端实时生成验证码、严格参数校验、含冒号标签导出往返、按需加载二维码编解码库、错误重试反馈及随包附带 MiSans 许可文件。
  - 仅在非 30 秒周期卡片上显示独立倒计时角标（`剩余秒 / 周期秒`），保持标准 30 秒卡片的极简外观。
  - 为账号卡片与分组卡片补充键盘操作支持：`Shift+F10` / `ContextMenu` 呼出操作菜单，`Alt+↑` / `Alt+↓` 或菜单内「上移 / 下移」调整顺序。
- **仓库与文档清理**：
  - 移除已失效的旧 WebView2 宿主备份 `host/`（保留于 Git 历史）。
  - 确定 `public/logo.svg` 为唯一 Logo 源文件，删除根目录及 `src/renderer/assets/` 下的重复副本与未引用旧截图。
  - 将历次历史验证记录从 `HANDOFF.md` 归档至本文件。

---

## 2026-11-22 · 复制提示改为标题栏下方的紧凑浮层

- 将单击卡片复制后的 HeroUI Toast 调整为标题栏正下方（`placement="top-center"`、`toastOffset={52}`）的紧凑居中浮层（`w-fit`、`max-w-[300px]`、`mx-auto`），不再遮挡第一张账号卡片。
- 配置位于 `src/renderer/main.tsx` 的 `compactToastProps`；若后续调整标题栏高度，需同步调整 `toastOffset`。

---

## v1.0.1（2026-11-20）· 安全加固与可升级 Windows 安装包

- 引入 `VaultFile` 实现 `KLIPY-DPAPI-1` 账号库加密、原子写入与旧明文库自动迁移，增加数据目录文件锁 `.klipy.lock` 防止多实例覆盖。
- 升级至 Electron 45.4.1，正式版启用隔离 session 与 `klipy://app` 协议，限制资源白名单、网络访问与 IPC 参数校验；剪贴板写入附带 Windows 隐私标记。
- 新增 `electron-builder.json` 生成 Windows x64 NSIS 安装包（`io.github.luomuqaq.klipy`），内置自包含 .NET 后端，支持保留用户数据的覆盖更新。

---

## 2026-11-20 晚 · 品牌定名（Klipy）、平面扁平式 Logo 与分组管理优化

- 产品定名为 **Klipy**（Key + Clip），保持数据目录 `%APPDATA%\WindowsAuthenticatorDemo` 不变以兼容已有用户数据。
- 重制 2D 平面扁平式矢量 SVG Logo（`public/logo.svg`）及 512×512 PNG 应用图标（`public/app-icon.png`）。
- 移除 50 个分组数量上限，优化分组管理页为顶部 `+` 弹窗新建、拖拽排序与右键操作菜单。

---

## 2026-11-20 · 分组归属收紧、迁移导入与品牌图标扩充

- 移除临时验证页，新增分组管理与 Google Authenticator `otpauth-migration://` protobuf 解析导入（`MigrationParser`）。
- 账号强制归属真实分组（移除「全部」「未分组」），删除分组级联删除组内账号，启动时收编历史孤儿账号至「默认分组」。
- 内置 85 个离线品牌 SVG 图标（Simple Icons CC0 + LobeHub Muse MIT），支持先按服务名、再按账号字段匹配。
- 新增 `backend/AppPaths.cs` 支持 `AUTHENTICATOR_DATA_DIR` 环境变量覆盖数据目录，并移除初始演示账号。
