# 项目交接文档 (Handoff Document)

**项目名称**：Klipy（Windows 轻量级 2FA / TOTP 身份验证器）  
**当前版本**：`1.1.0`  
**技术栈**：Electron 45.4.1 + React 18 + TypeScript + HeroUI (`@heroui/react` 2.8.10) + Tailwind CSS 3 + Framer Motion 11 + C# (.NET 10)  
**最近更新**：2026-11-23（统一 `KLIPY-DPAPI-2` 单文件原子加密库、批量导入去重、非 30s 倒计时角标、键盘菜单/排序、自定义账号图标、自动中英双语与仓库清理）
**历次变更记录**：见 [`CHANGELOG.md`](CHANGELOG.md)；最近一轮审查详情见 [`REVIEW.md`](REVIEW.md)。

> ⚠️ **不要清空 `%APPDATA%\WindowsAuthenticatorDemo`**：该目录可能包含用户的真实数据。需要测试时请设置 `AUTHENTICATOR_DATA_DIR` 指向临时目录。

---

## 1. 项目概览与功能现状

Klipy 是面向 Windows 桌面的轻量级 2FA / TOTP 身份验证器，定位为开箱即用、无主密码入口的本地验证工具。

### 核心功能
- **窗口与外观**：
  - 亮色主题（HeroUI `defaultTheme: "light"`，浅灰冷色调画布 `#f5f7fa` + 纯白卡片 `#ffffff` + 靛蓝主色 `#4f46e5`）。
  - 无系统边框、固定不可缩放窗口（`400 × 620`，`resizable: false`、`maximizable: false`、`fullscreenable: false`）。
  - 自定义标题栏（`<Navbar>`，支持拖拽、`+` 添加账号、文件夹按钮「分组管理」、最小化与关闭），使用单一矢量 Logo 源文件 `public/logo.svg`。
- **核心验证与倒计时**：
  - C# 后端原生实现 RFC 6238 TOTP（Base32 解码、HMAC-SHA1/SHA256/SHA512、6/8 位动态码、严格 `otpauth://totp/` 校验与含冒号标签往返导出）。
  - 顶部 `<TotpProgress>` 使用 Web Animations API 线性缩放（与系统时间对齐，剩余 10s 变黄、5s 变红）作为标准 30 秒周期参考；验证码按后端返回的实际 `validUntil` 准时刷新。
  - **非 30 秒周期展示**：标准 30 秒账号保持极简外观；仅当账号 `period !== 30` 时，卡片验证码下方显示独立倒计时角标（`剩余秒 / 周期秒`）。
- **卡片交互、排序与键盘支持**：
  - **左键单击卡片**由主进程代理到 C# 后端实时生成验证码并写入 Windows 隐私剪贴板，弹出标题栏下方的紧凑 Toast 浮层。
  - **左键按住上下拖拽**可调整账号或分组顺序（`framer-motion` `<Reorder.Group>`），无顺序变化时不重写磁盘。
  - **右键或键盘**（聚焦卡片按 `Shift+F10` / `ContextMenu`）弹出 HeroUI `<Dropdown>` 上下文菜单；支持导出、编辑、上移/下移、删除，也支持 `Alt+↑` / `Alt+↓` 快捷移动。
  - **离线品牌头像**：83 个品牌图标可选，先按服务名、再按账号匹配，未命中回退名称缩写；下架项仅保留素材以显示原手选图标。来源及审查见 [`public/brands/SOURCES.md`](public/brands/SOURCES.md)。
  - **自定义账号图标**：右键「编辑」第一条为居中的圆形图标入口（无文字，悬停变灰并显示铅笔）；点击打开独立选择弹窗，顶部固定「选择图片」，下方圆形图标网格独立滚动并在首尾留白。图标按界面语言排序，支持「自动匹配」复位；选择 PNG、JPEG、WebP、GIF、BMP、ICO、AVIF、SVG（≤20 MB）后进入裁切页，可拖动、缩放并预览，确认后输出 128×128 PNG，随账号写入加密保险库。
- **语言**：通过主进程 `app.getLocale()` 自动检测系统默认语言，目前提供简体中文与英语，无手动切换入口；界面文案、Toast、无障碍标签、品牌图标名称与排序均随语言变化。
- **分组管理（强制归属分组）**：
  - 独立「分组管理」页：新建分组弹窗（非空、最长 20 字符、不区分大小写去重、无数量上限）、拖拽或键盘重排、右键/键盘菜单重命名或删除。
  - 删除分组会**单次原子地**一并删除组内账号（确认框标明数量且不可撤销）。
  - 账号列表顶部筛选栏仅展示真实分组（无「全部」「未分组」），无分组时引导先创建分组。
- **多渠道导入与多形态导出**：
  - 支持 **手动**、**链接**（`otpauth://totp/`）与 **二维码**（选图、拖拽、`Ctrl+V` 粘贴；`jsqr` 与 `qrcode` 均按需动态加载）。
  - **Google Authenticator 迁移导入**：解析 `otpauth-migration://offline?data=...` protobuf，跳过 HOTP/MD5/损坏条目，调用后端 `addbatch` **整批校验、单次加密写盘**，并按「解码后密钥 + 算法 + 位数 + 周期」自动跳过重复账号（允许同名不同密钥并存）。
  - **导出账号**：二维码（支持保存 PNG）、`otpauth://` 链接、Base32 密钥；弹窗关闭立即清空敏感状态。

---

## 2. 开发环境与常用命令

- **已验证环境**：Node.js `v24.x` / npm `12.x` / .NET SDK `10.0`
- 首次运行依次执行 `npm ci`、`npm run build:vite`、`npm run build:backend`。若 `install-scripts` 被拦截，手动执行 `node node_modules/electron/install.js` 与 `node node_modules/esbuild/install.js`。

| 命令 | 作用 |
| :--- | :--- |
| `npm start` 或双击 `启动.bat` | 运行 Electron（通过 `klipy://app/index.html` 加载 `dist/`，拉起 `bin/backend/AuthenticatorBackend.exe`） |
| `npm run dev` | 并发启动 Vite（`127.0.0.1:5173`）与 Electron |
| `npm run typecheck` | TypeScript 静态类型检查（`tsc --noEmit`） |
| `npm run build:vite` | 编译前端产物至 `dist/` |
| `npm run build:backend` | 发布 C# 后端至 `bin/backend/`（Release） |
| `npm run build:setup` | 构建自包含 .NET 后端与 Windows x64 NSIS 安装包至 `release/` |
| `npm run test:backend` | 运行 C# 后端协议、TOTP 算法、批量导入去重与原子删分组测试 |
| `npm run test:security` | 运行保险库迁移、DPAPI 加密、损坏保护、并发锁与 IPC 白名单测试 |
| `npm run test:desktop` | 运行 Electron 生产模式端到端冒烟测试（可用 `KLIPY_TEST_SKIP_CLIPBOARD=1` 避免写剪贴板） |

---

## 3. 架构设计与存储协议

```text
Renderer (React + HeroUI)           src/renderer/App.tsx 等
        │ window.authenticatorAPI (contextBridge)
Preload (Sandboxed)                 src/main/preload.js
        │ ipcRenderer.invoke / ipcMain.handle (+ ipc-validation.js)
Electron Main Process               src/main/main.js
        │ stdin / stdout (换行分隔 JSON-RPC)
C# Backend (.NET 10 Console)        bin/backend/AuthenticatorBackend.exe
        │ 独占锁 .klipy.lock + 单文件原子替换 (KLIPY-DPAPI-2)
%APPDATA%\WindowsAuthenticatorDemo\accounts.json
        （分组与账号统一加密保存，启动自动兼容升级旧明文 / DPAPI-1 / groups.json）
```

### 3.1 统一加密存储（`KLIPY-DPAPI-2`）
- 数据目录默认 `%APPDATA%\WindowsAuthenticatorDemo\`，可通过 `AUTHENTICATOR_DATA_DIR` 覆盖（[`backend/AppPaths.cs`](backend/AppPaths.cs)）。
- [`backend/VaultFile.cs`](backend/VaultFile.cs) + [`backend/VaultStore.cs`](backend/VaultStore.cs) 将分组（`groups`）与账号（`accounts`）统一保存在单个 `accounts.json`（头部 `KLIPY-DPAPI-2\n` + Windows DPAPI 当前用户密文）。
- 账号图标保存在账号记录的 `icon` 字段中：空字符串表示自动匹配，`si:<slug>` 引用内置品牌图标，`data:image/png;base64,...` 为用户上传并缩放后的自定义图片（≤256 KB）。
- 每次写入先写临时文件并刷盘、读取并解密逐字节校验，再用 `File.Replace` 一次性原子替换；文件损坏、密文篡改或遇到未知更高版本号时直接以退出码 `20` 终止启动，绝不覆盖原文件。
- 启动时自动升级旧版明文 JSON 或 `KLIPY-DPAPI-1` + `groups.json`；若存在旧版孤儿账号，在内存统一收编至「默认分组」后一次性原子落盘，随后清理遗留 `groups.json`。升级后请勿再用旧版打开同一数据目录。

### 3.2 IPC 与 Stdio JSON-RPC 动作
- 后端协议（[`backend/BackendDispatcher.cs`](backend/BackendDispatcher.cs)）：
  - 账号：`list`、`add`、`addbatch`、`delete`、`update`、`reorder`、`export`、`copycode`、`copyprivate`
  - 解析校验：`parseuri`、`parsemigration`、`validatesecret`、`ping`
  - 分组：`grouplist`、`groupadd`、`grouprename`、`groupdelete`、`groupreorder`
- Electron 通道（`src/main/main.js` / `src/main/preload.js` / `src/main/ipc-validation.js`）对所有入参做严格字段白名单与长度/数量上限校验。

---

## 4. 目录结构与关键文件

```text
身份验证器/
├── backend/
│   ├── AuthenticatorBackend.csproj   # .NET 10 控制台项目
│   ├── Models.cs                     # VaultSnapshot / AccountRecord / GroupRecord / BatchImportResultDto 等
│   ├── AccountIcon.cs                # 账号图标编码校验（自动 / si:slug / 128px PNG data URL）
│   ├── VaultFile.cs                  # KLIPY-DPAPI-2 编解码、旧版迁移与原子替换
│   ├── VaultStore.cs                 # 统一线程安全存储（分组 + 账号 + 批量去重 + 原子删分组）
│   ├── TotpEngine.cs                 # Base32、RFC 6238 HMAC-SHA1/256/512、otpauth 解析
│   ├── MigrationParser.cs            # otpauth-migration:// protobuf 解析
│   ├── PrivateClipboard.cs           # Windows 剪贴板隐私标记写入
│   ├── AppPaths.cs                   # 数据目录解析
│   ├── BackendDispatcher.cs          # Stdio JSON-RPC 分发
│   └── Program.cs                    # 独占锁与主循环
├── public/
│   ├── logo.svg                      # 唯一矢量 Logo 源文件
│   ├── app-icon.png                  # 512×512 应用图标
│   └── brands/                       # 85 个离线品牌图标及 SOURCES.md
├── src/
│   ├── main/                         # main.js / backend-client.js / ipc-validation.js / renderer-security.js / preload.js
│   └── renderer/                     # App.tsx / main.tsx / i18n.ts / types.ts / brandIcons.ts / utils/accountIcon.ts / components/* / fonts/misans/
├── tests/                            # backend.test.cjs / security.test.cjs / electron-smoke.cjs / setup-smoke.cjs
├── electron-builder.json             # NSIS 安装包配置（appId: io.github.luomuqaq.klipy）
├── HANDOFF.md                        # 本文档
├── CHANGELOG.md                      # 历次变更与验证归档
└── REVIEW.md                         # 代码审查记录
```

---

## 5. 关键工程约束（避坑指南）

1. **Tailwind 递归扫描 `@heroui`**：`tailwind.config.js` 的 `content` 必须保持 `"./node_modules/@heroui/**/dist/**/*.{js,ts,jsx,tsx}"`，否则 Modal/Dropdown 样式丢失。
2. **HeroUI 亮色分隔线**：不要写 `border-divider/80` 等透明度后缀，直接使用 `border-divider`。
3. **不要覆盖 Portal 容器 `inset: 0`**：否则右键菜单与 Toast 坐标定位会失效。
4. **剪贴板写入**：统一经主进程 `authenticator:copy` / `authenticator:copyCode` 走 `PrivateClipboard` 写入，不绕过隐私标记。
5. **拖拽与点击防冲突**：`Reorder.Item` 保持 `rounded-large`、`layout="position"`、`dragMomentum={false}` 与 `DROP_TRANSITION`；`App.tsx` 松手后延迟 80 ms 复位 `isDraggingRef`。
6. **透明背景二维码**：`AddAccountModal.tsx` 绘制二维码到 `<canvas>` 前先铺 `#ffffff` 白底。
7. **品牌图标顺序**：`brandIcons.ts` 中 `githubcopilot` 须在 `github` 前，`googlecloud`/`gmail`/`googlegemini` 须在 `google` 前。
8. **紧凑 Toast 偏移**：`src/renderer/main.tsx` 中 `placement="top-center"` + `toastOffset={52}` + `w-fit max-w-[300px] mx-auto`；改动标题栏高度（`2.75rem`）时须同步更新 `52`。
9. **打包与覆盖更新**：`electron-builder.json` 的 `appId`、`productName` 与当前用户安装模式不可随意变更，以保证新版 Setup 可直接覆盖旧版并保留 `%APPDATA%\WindowsAuthenticatorDemo`。
10. **自定义账号图标**：只允许空字符串、`si:<slug>` 或 ≤256 KB 的 `data:image/png;base64,...`（128×128 PNG，边长 ≤512）；不要保存远程 URL 或原始上传文件。Electron IPC 与 [`backend/AccountIcon.cs`](backend/AccountIcon.cs) 做双重校验，未知格式会使启动失败而不是静默清空。
11. **双语与图标排序**：界面语言只由 `app.getLocale()` 决定（经 preload 的 `additionalArguments` 注入），不要添加本地语言切换；品牌图标排序使用当前语言的 `Intl.Collator`（中文拼音、英文 A-Z），改动品牌名称时同步更新 `BRAND_NAMES` 的中英文两套标签。
