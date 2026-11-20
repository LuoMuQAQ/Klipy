# 项目交接文档 (Handoff Document)

**项目名称**：Klipy（Windows 轻量级 2FA / TOTP 身份验证器）  
**当前版本**：`1.0.0`  
**技术栈**：Electron 33.4.11 + React 18 + TypeScript + HeroUI (`@heroui/react` 2.8.10) + Tailwind CSS 3 + Framer Motion 11 + C# (.NET 10)  
**文档日期**：2026-11-20  
**最近更新**：2026-11-20 20:16（定名 Klipy、移除分组数量上限、平面扁平式 Logo 重制、分组管理页 UI 优化并同步 GitHub 公开仓库）  
**当前状态**：可运行；`dist/` 与 `bin/backend/` 已按最新代码重新构建并通过验证。  

> ⚠️ **不要清空 `%APPDATA%\WindowsAuthenticatorDemo`**：其中已是用户的真实数据（9 个账号，均在 `Google` 分组）。需要测试时请设置 `AUTHENTICATOR_DATA_DIR` 指向临时目录。

---

## 1. 项目概览与当前状态

本项目是一个面向 Windows 桌面的 2FA / TOTP 身份验证器 Demo，定位为开箱即用、无进入密码/密钥验证的轻量级验证工具。

### 已完成功能
- **窗口与外观**：
  - 亮色主题（HeroUI `defaultTheme: "light"`，浅灰冷色调画布 `#f5f7fa` + 纯白卡片 `#ffffff` + 靛蓝主色 `#4f46e5`）。
  - 无系统边框、固定不可缩放窗口（`400 × 620`，`resizable: false`、`maximizable: false`、`fullscreenable: false`）。
  - 使用 HeroUI 原生 `<Navbar>` 实现自定义原生风格标题栏（支持拖拽移动、`+` 添加账号、文件夹按钮「分组管理」、最小化和关闭），配合专属矢量 SVG Logo。标题栏按钮提示悬停 300 ms 显示，移开立即关闭。`+` 仅在存在分组时显示，没有分组时由主页面引导先创建分组。
- **核心验证与倒计时**：
  - C# 后端实现 RFC 6238 TOTP 算法（支持 Base32 解码、HMAC-SHA1/SHA256/SHA512、6/8 位动态码、`otpauth://totp/` 链接解析与生成）。
  - 顶部 `<TotpProgress>` 使用 Web Animations API 线性缩放，与系统时间对齐，不再每 100 ms 重渲染主列表。剩余 10 秒变黄、5 秒变红，30 秒周期切换时自动向后端拉取新验证码。
  - 账号数据持久化在 `%APPDATA%\WindowsAuthenticatorDemo\accounts.json`；首次启动为空账号库，界面引导先创建分组（不再预置演示账号）。
- **卡片交互与排序**：
  - 取消独立复制与删除按钮，**左键单击卡片**通过主进程 `clipboard.writeText` 自动复制验证码，并弹出 HeroUI `<Toast>` 提示。
  - **左键按住卡片上下拖拽**可实时调整排序（基于 `framer-motion` `<Reorder.Group>` / `<Reorder.Item>`），松手后平滑归位，并调用后端 `reorder` 持久化顺序，不误触发复制。
  - **右键点击卡片**弹出 HeroUI `<Dropdown>` 上下文菜单，可导出、编辑或删除账号。菜单锚定点击坐标，不做缩放，避免卡片尚未归位时菜单文字移动。
  - **账号头像**：内置 85 个常见品牌图标（`public/brands/si/<slug>.svg`，24×24 path + 官方品牌色），匹配时先看服务名称（issuer）、再看账号字段，因此「未命名 / Muse」这类迁移账号也能拿到图标；未识别服务或图片加载失败时使用名称缩写。素材出处见 [`public/brands/SOURCES.md`](public/brands/SOURCES.md)。
- **分组管理**（账号必须归属分组，不提供「未分组」）：
  - 点击标题栏文件夹按钮进入独立「分组管理」页：标题栏左侧变为返回按钮，右上角显示 `+` 按钮用于弹窗新建分组；卡片支持左键按住上下拖拽排序（`groupreorder` 持久化，主页面分组筛选栏实时同步顺序），右键点击分组卡片弹出上下文菜单可重命名（弹窗）或删除，并显示每个分组下的账号数。
  - 分组名称校验：非空、最长 20 字符、不区分大小写去重；不限制分组数量。错误提示由 `formatError` 剥离 Electron IPC 包装后直接展示后端中文文案。
  - 删除分组前弹确认框，**组内账号会随分组一并删除**（确认框会标明数量与不可撤销）；重命名在同一位置内联编辑（Enter 保存、Esc 取消）。
  - 数据保存在 `%APPDATA%\WindowsAuthenticatorDemo\groups.json`；账号通过 `accounts.json` 中的 `groupId` 字段引用分组，后端在启动时会把「没有分组 / 分组已不存在」的历史账号收进「默认分组」，避免账号从界面上消失。
  - 账号列表顶部出现**分组筛选栏**（`GroupFilterBar`）：只列出各分组胶囊按钮（带数量），没有「全部」也没有「未分组」；进入列表时自动落在某个有效分组（优先第一个有账号的分组）。
  - 没有任何分组时列表为空，显示「还没有分组」引导页（隐藏标题栏 `+`，点击「新建分组」进入分组管理）；分组内没有账号时显示「该分组暂无账号」空状态。
  - 添加账号弹窗顶部是**必选**的分组选择器，默认选中当前分组；编辑账号弹窗同样必须选择分组。
- **多渠道导入与多形态导出**：
  - **添加账号**（`AddAccountModal`）：支持 **手动**、**链接**（`otpauth://totp/...` 解析）及 **二维码**（支持点击选图、拖拽图片、`Ctrl+V` 粘贴截图，基于 `jsqr` 解码）。输入框已按要求移除 `例如...` 占位提示。
  - **Google Authenticator 迁移导入**：链接与二维码页签都识别 `otpauth-migration://offline?data=...`，后端 `MigrationParser` 解析 `MigrationPayload` protobuf，逐个列出待导入账号（显示平台/账号/位数/算法），点「导入 N 个」批量写入当前选择的分组；HOTP、MD5 与损坏条目计入 `skipped` 并在预览里提示。
  - **导出账号**（`ExportAccountModal`）：支持 **二维码**（基于 `qrcode` 生成并支持下载 PNG）、**链接**（只读文本框 + 复制按钮）与 **Base32**（HeroUI `<Snippet>` 一键复制）三种形态。

---

## 2. 开发环境与构建运行

### 已验证环境
- **Node.js**：`v24.22.1` / **npm**：`12.0.2`
- **.NET SDK**：`10.0.404`（本机同时安装有 .NET 8 / .NET 10 运行时）

### 常用脚本
当前运行链路为 Electron；`host/` 仅保留 WebView2 迁移备份，不参与启动或构建。首次运行依次执行 `npm ci`、`npm run build:vite`、`npm run build:backend`，再启动应用。
| 命令 | 作用 |
| :--- | :--- |
| `npm start` 或双击 `启动.bat` | 运行 Electron（加载 `dist/index.html` 与 `bin/backend/AuthenticatorBackend.exe`） |
| `npm run dev` | 并发启动 Vite 开发服务器（`127.0.0.1:5173`）与 Electron |
| `npm run build:vite` | 编译前端产物至 `dist/` |
| `npm run build:backend` | 发布 C# 后端至 `bin/backend/`（Release 配置） |
| `npx tsc --noEmit` | 执行 TypeScript 静态类型检查 |

> **注意**：若在新环境执行 `npm install` 时遇到 `install-scripts` 被拦截提示，需手动执行一次 `node node_modules/electron/install.js` 和 `node node_modules/esbuild/install.js` 以拉取二进制文件。

### 数据目录
- 默认：`%APPDATA%\WindowsAuthenticatorDemo\`，包含 `accounts.json`（账号，含 `groupId`）与 `groups.json`（分组）。
- 设置环境变量 `AUTHENTICATOR_DATA_DIR` 可改用任意目录（便携运行 / 自动化测试），解析逻辑在 [`backend/AppPaths.cs`](backend/AppPaths.cs)。
- 做协议测试或界面测试时务必指向临时目录；用户真实数据不要动。

---

## 3. 架构设计与通信协议

```text
┌──────────────────────────────────┐
│  Renderer (React + HeroUI)       │  src/renderer/App.tsx 等
└────────────────┬─────────────────┘
                 │ window.authenticatorAPI (contextBridge)
┌────────────────▼─────────────────┐
│  Preload (Sandboxed)             │  src/main/preload.js
└────────────────┬─────────────────┘
                 │ ipcRenderer.invoke / ipcMain.handle
┌────────────────▼─────────────────┐
│  Electron Main Process           │  src/main/main.js
└────────────────┬─────────────────┘
                 │ stdin / stdout (换行分隔 JSON-RPC)
┌────────────────▼─────────────────┐
│  C# Backend (.NET 10 Console)    │  bin/backend/AuthenticatorBackend.exe
└───────┬──────────────────┬───────┘
        │ 文件读写          │ 文件读写
        ▼                  ▼
 %APPDATA%\WindowsAuthenticatorDemo\
   accounts.json        groups.json
   （账号列表，含 groupId）（用户自建分组）
```

### 3.1 Electron 进程选择后端策略
`src/main/backend-client.js` 会优先检查 `bin/backend/AuthenticatorBackend.exe` 是否存在；存在则直接派生该 exe，否则回退为 `dotnet run --project backend/AuthenticatorBackend.csproj -c Release --no-launch-profile`。通信采用 stdio 管道，不占用任何本地 TCP 端口，可避免 Windows 防火墙弹窗，并在 `will-quit` 时关闭子进程 stdin，使后端退出。

### 3.2 IPC 通道清单（Main ↔ Preload）
- **窗口控制**：`window:minimize`、`window:maximize`、`window:close`、`window:isMaximized`（以及主进程向渲染层推送的 `window:maximized-changed`）。
- **剪贴板**：`authenticator:copy`（主进程调用 `clipboard.writeText`）。
- **业务代理**：`authenticator:list`、`authenticator:add`、`authenticator:delete`、`authenticator:update`、`authenticator:parseUri`、`authenticator:parseMigration`、`authenticator:validateSecret`、`authenticator:reorder`、`authenticator:export`。
- **分组管理**：`authenticator:groupList`、`authenticator:groupAdd`、`authenticator:groupRename`、`authenticator:groupDelete`、`authenticator:groupReorder`（对应 preload 的 `listGroups` / `addGroup(name)` / `renameGroup(id, name)` / `deleteGroup(id)` / `reorderGroups(ids)`；`deleteGroup` 返回 `{ deleted, removedAccounts }`）。

### 3.3 C# 后端 Stdio JSON-RPC 协议
- **请求格式**：`{"id":"1","action":"<action>","params":{...}}\n`
- **响应格式**：`{"id":"1","success":true,"data":...,"error":null}\n`
- **已支持 `action`**（见 `backend/BackendDispatcher.cs`）：
  - `ping`：健康检查。
  - `list`：返回 `AccountDto[]`（含当前验证码及剩余秒数，**不含明文 `secret`**）。
  - `add`：接收 `{ issuer, account, secret, digits?, period?, algorithm?, groupId }`，`groupId` 必填且必须存在（否则返回「请先选择分组。」/「分组不存在。」），校验 Base32 后插入列表顶部并保存。
  - `delete`：按 `id` 删除并保存。
  - `update`：接收 `{ id, issuer?, account?, groupId }`，修改服务名称/账号/分组；`groupId` 必填且必须存在，不允许把账号改成无分组。
  - `parseuri`：解析 `otpauth://totp/...` 字符串返回结构化字段。
  - `parsemigration`：解析 `otpauth-migration://offline?data=...`（Google Authenticator `MigrationPayload` protobuf），返回 `{ accounts: MigrationAccountDto[], skipped, batchSize, batchIndex }`；仅 TOTP、非 MD5 且密钥可解码的条目进入 `accounts`。
  - `validatesecret`：仅验证 Base32 密钥合法性。
  - `grouplist`：返回 `GroupDto[]`（按保存顺序返回）。
  - `groupadd`：接收 `{ name }`，校验非空 / 长度 / 重名后返回新分组（无数量上限）。
  - `grouprename`：接收 `{ id, name }`，返回更新后的分组。
  - `groupdelete`：接收 `{ id }`，删除分组并**一并删除组内账号**，返回 `{ deleted, removedAccounts }`。
  - `groupreorder`：传入 `{ "ids": string[] }`，按顺序重排分组并保存（未包含的分组追加到末尾）。
  - `reorder`：传入 `{ "ids": string[] }`，按顺序重排 `_accounts` 并保存（未包含的账号追加到末尾）。
  - `export`：传入 `{ "id": string }`，返回 `ExportAccountDto`（包含 `secret` 与标准生成的 `uri`）。

---

## 4. 目录结构与关键文件

```text
身份验证器/
├── backend/
│   ├── AuthenticatorBackend.csproj   # .NET 10 控制台项目配置
│   ├── Models.cs                     # AccountRecord / AccountDto / GroupRecord / GroupDto / MigrationAccountDto / IpcRequest / IpcResponse
│   ├── TotpEngine.cs                 # Base32 编解码、RFC 6238 HMAC-SHA1/256/512、otpauth URI 解析
│   ├── MigrationParser.cs            # otpauth-migration:// 链接的 protobuf 解析（TOTP 过滤）
│   ├── AccountStore.cs               # 线程安全内存缓存 + JSON 持久化 + 排序与导出 + 历史分组修复
│   ├── GroupStore.cs                 # 分组管理：独立 groups.json、重名校验与增删改
│   ├── AppPaths.cs                   # 数据目录解析（默认 %APPDATA%，支持 AUTHENTICATOR_DATA_DIR 覆盖）
│   ├── BackendDispatcher.cs          # 业务分发（账号 / 分组 / 迁移解析）
│   └── Program.cs                    # Stdio JSON-RPC 主循环 + 启动时收编无分组账号
├── bin/backend/                      # dotnet publish 输出的 C# 可执行文件目录
├── host/                             # WebView2 迁移备份，当前不使用
├── public/
│   ├── logo.svg                      # 平面扁平式矢量 Logo（标题栏与页面图标）
│   ├── app-icon.png                  # 512×512 透明底 PNG 窗口与任务栏图标
│   └── brands/                       # 离线品牌图标（si/*.svg 共 85 个）与 SOURCES.md
├── src/
│   ├── main/
│   │   ├── main.js                   # BrowserWindow (400x620 固定无边框)、后端进程守护、IPC 注册
│   │   ├── backend-client.js         # C# 后端进程及 stdio 请求管理
│   │   └── preload.js                # contextBridge 注入 window.authenticatorAPI
│   └── renderer/
│       ├── assets/logo.svg           # 应用图标源码备份（根目录 logo.svg 同）
│       ├── components/
│       │   ├── TitleBar.tsx          # HeroUI Navbar（添加、分组管理、最小化、关闭）
│       │   ├── GroupFilterBar.tsx    # 各分组筛选胶囊（不含「全部 / 未分组」）
│       │   ├── GroupManagementPage.tsx # 分组管理整页（新建 / 重命名 / 删除 + 确认框）
│       │   ├── AccountCard.tsx       # HeroUI Card + User，品牌图标匹配与点击复制
│       │   ├── AddAccountModal.tsx   # HeroUI Modal（分组选择 + 手动 / 链接 / 二维码 / 迁移导入）
│       │   ├── ExportAccountModal.tsx# HeroUI Modal（二维码保存 / 链接复制 / Base32 Snippet）
│       │   ├── DeleteConfirmModal.tsx # HeroUI Modal 删除确认
│       │   ├── EditAccountModal.tsx  # 账号右键菜单「编辑」弹窗（名称 / 账号 / 分组）
│       │   └── TotpProgress.tsx      # 30 秒动画、预警变色及刷新时钟
│       ├── utils/errors.ts           # 剥离 Electron IPC 错误包装的文案格式化
│       ├── brandIcons.ts             # 品牌图标匹配表（Simple Icons slug + 正则）
│       ├── App.tsx                   # 主视图、筛选与拖拽排序、右键菜单、分组页切换
│       ├── main.tsx                  # HeroUIProvider 与 ToastProvider 挂载
│       ├── index.css                 # 亮色基础样式与 .app-drag / .app-nodrag 区域规则
│       └── types.ts                  # TypeScript 接口定义
├── index.html                        # HTML 入口（class="light"）
├── tailwind.config.js                # HeroUI 插件配置（defaultTheme: "light"）
├── vite.config.ts                    # Vite 构建配置（base: './'，输出至 dist/）
├── tsconfig.json                     # TypeScript 编译配置
├── package.json                      # 依赖与构建脚本
├── 启动.bat                           # Windows 一键启动脚本
└── HANDOFF.md                        # 本文档
```

---

## 5. 关键工程细节与避坑指南

1. **Tailwind 必须递归扫描 `@heroui` 嵌套包路径**
   - npm 将 `@heroui/theme`、`@heroui/modal` 等子包嵌套安装在了 `node_modules/@heroui/react/node_modules/@heroui/` 下。
   - `tailwind.config.js` 的 `content` 必须保持为 `"./node_modules/@heroui/**/dist/**/*.{js,ts,jsx,tsx}"`。若改回 `@heroui/theme/dist/...`，会导致 Modal/Dropdown 的 `fixed`、`inset-0` 等样式缺失。

2. **HeroUI 亮色模式禁止对 `border-divider` 使用透明度后缀**
   - HeroUI 亮色主题下的 `--heroui-divider` 基色接近黑色（`#111111`），内置默认透明度为 `0.15`。
   - **不要写 `border-divider/80` 或 `border-divider/60`**，否则 Tailwind 会用 `80%` 覆盖 `15%` 导致边框发黑；直接使用 `border-divider` 即可呈现柔和浅灰边框。

3. **Portal 浮层容器不要强行覆盖 `inset: 0`**
   - 切勿在 `index.css` 中添加 `body > *:not(#root) { inset: 0 !important }`。HeroUI 的右键 `<Dropdown>` 和 `<ToastProvider>` 依赖 React Aria 计算 `left`/`top` 坐标，全局强制 `inset: 0` 会使右键菜单在顶部全宽拉伸。

4. **Electron 33 默认沙箱下的剪贴板写入**
   - Electron 33 默认 `sandbox: true`，导致 `preload.js` 中 `require('electron').clipboard` 为 `undefined`。
   - 剪贴板写入已统一通过主进程 `ipcMain.handle('authenticator:copy', ...)` 完成，不要再尝试在 `preload.js` 直接引用 `clipboard`。

5. **卡片拖拽排序与点击复制防冲突**
   - `Reorder.Item` 的外层必须保持与卡片一致的 `rounded-large` 圆角，否则 `whileDrag` 的阴影会露出方角。保持 `layout="position"`、`dragMomentum={false}` 及 `DROP_TRANSITION` 的临界阻尼，避免松手拖尾和归位跳动。
   - `App.tsx` 在 `onDragEnd` 后延迟 80 ms 复位 `isDraggingRef`，避免松手时的 `onPress` 误触复制。右键菜单使用固定坐标锚点与 `disableAnimation`，不要重新引入缩放。

6. **透明背景二维码解码**
   - `AddAccountModal.tsx` 中 `decodeQrFromFile` 在将图片绘制到 `<canvas>` 前会先用 `#ffffff` 填充画布背景，确保带透明通道的 PNG 二维码能被 `jsQR` 正常识别。

7. **分组与账号的一致性**
   - 账号的归属只存在 `accounts.json` 的 `groupId` 字段，且必须指向 `groups.json` 中真实存在的分组；没有「未分组」状态。分组本身存在 `groups.json`，两者不合并写。
   - 删除分组必须走 `groupdelete`：后端先删分组、再用 `DeleteByGroup` 删除组内账号，返回 `removedAccounts`；前端确认框会明确提示账号会被一并删除。
   - 后端启动时会调用 `FindOrphanGroupIds`：把 `groupId` 为空或指向已删除分组的账号统一移入「默认分组」（不存在则创建），保证任何历史数据都不会在界面上消失。
   - 筛选状态下拖拽排序只改变可见账号的相对顺序，`App.handleReorder` 会把它们合并回全局顺序再调用 `reorder`，避免把其它分组的账号挤到末尾。
   - 迁移导入时逐条调用 `add` 并带上当前分组；单条失败不阻断其余条目，最后用 Toast 汇总成功/失败数量。

8. **品牌图标匹配**
   - 图标是内置资源：`public/brands/si/<slug>.svg`，主体来自 Simple Icons（CC0），由脚本保留 24×24 path、去掉 `<title>`、把品牌 hex 写入根节点 `fill`；不要手工改 path 数据。`muse.svg` 例外，来自 LobeHub Icons（MIT，保留官方蓝色渐变），见 `SOURCES.md`。
   - 规则顺序敏感：`githubcopilot` 必须排在 `github` 前，`googlecloud` / `gmail` / `googlegemini` 必须排在 `google` 前；`amazon` 复用 AWS 图标。
   - `resolveBrand(issuer, account)` 先匹配服务名称、再匹配账号字段，因此迁移链接里常见的 `issuer = 未命名, account = Muse` 也能命中；账号是邮箱时会落到 Gmail / Outlook 等品牌。
   - 新增品牌：放 `<slug>.svg` 到 `public/brands/si/`，再在 `src/renderer/brandIcons.ts` 的顺序表补一条规则即可；未命中时卡片回退到名称缩写。

---

## 6. 已知局限与后续演进建议

1. **密钥存储安全性**：目前为 Demo 阶段，账号 `secret` 以明文 JSON 存储在 `%APPDATA%\WindowsAuthenticatorDemo\accounts.json`（分组只存名称，不含密钥）。后续上线生产前建议在 C# 层使用 Windows DPAPI（`System.Security.Cryptography.ProtectedData`）对 `Secret` 字段或整文件进行本机用户态加密。
2. **迁移导入范围**：`parsemigration` 只导入 TOTP 且算法非 MD5 的条目，HOTP 账号会被计入 `skipped` 并跳过；Google Authenticator 的分批导出（`batchSize > 1`）需要用户分别导入每个链接，当前不做跨批次合并。
3. **分组容量与排序**：分组数量不设上限，名称最长 20 字符；支持在分组管理页左键按住上下拖拽调整顺序并持久化。因为账号必须归属分组，**删除分组会连带删除组内账号**（确认框会显示数量），目前没有「移到其他分组」的批量操作；如需保留账号，请先在「编辑」里逐个改到其它分组。
4. **自定义刷新周期兼容**：后端支持任意 `period`（如 60 秒），但当前前端 `<TotpProgress>` 动画与刷新定时器固定按 `30000ms` 周期计算。若后续在界面重新开放非 30 秒周期录入，需改为基于各账号 `period` 独立计算或分类展示倒计时。
5. **独立打包与分发**：当前 `npm run build:backend` 采用框架依赖发布（依赖目标机器存在 .NET 10 运行时）。若需打包为独立安装包给无 .NET 环境的用户使用，可将 `build:backend` 调整为 `dotnet publish backend/AuthenticatorBackend.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -o bin/backend`，并引入 `electron-builder` 配置将 `dist/` 与 `bin/backend/` 一起打入安装包的 `resources`。
6. **测试覆盖**：当前以构建检查、脚本化协议验证与无头渲染校验为主，尚未建立自动化单元测试套件。建议后续为 `TotpEngine.cs` 补充 RFC 6238 / RFC 4226 标准测试向量单元测试，并为 `MigrationParser` 增加固定样本测试。
7. **图标版本与覆盖**：主体使用 `simple-icons@15`；Microsoft、AWS、LinkedIn、Adobe、IBM、Oracle、Nintendo Switch、Tencent QQ 取自 `simple-icons@12`，Twitter 取自 `simple-icons@11`（这些品牌在较新版本中已被移除）。`muse` 为补充图标，取自 [LobeHub Icons](https://github.com/lobehub/lobe-icons)（MIT）。升级图标集时需确认这些品牌是否仍可用，缺失时需寻找替代来源。

---

> 以下第 7–11 节按时间顺序保留历次验证记录；**当前有效的实现与数据约束以第 1、3、5 节和第 11 节（最新）为准**。早期记录中出现的「未分组」「movedAccounts」等描述已被后续轮次取代。

## 7. 历史验证记录（WebView2 迁移前）

- `npx tsc --noEmit && npm run build:vite && npm run build:backend`：全部通过（退出码 `0`）。
- 运行时端到端检查：已验证 `AuthenticatorBackend.exe` 启动、`list` / `export` / `reorder` 协议响应、亮色无边框固定窗口启动、单击卡片复制剪贴板与 Toast、右键菜单位置、导出二维码生成，以及真实鼠标左键拖拽卡片重排顺序。

## 8. Electron 回退与后续验证记录（2026-11-20）

- `npm start`、`启动.bat` 和 `npm run dev` 均使用 Electron 33.4.11。`host/` 仅作 WebView2 迁移源码备份，不参与启动或构建；账号存储的位置和格式未改变。
- 本次通过 TypeScript 检查、Vite 构建和 .NET 后端发布；Electron 正式模式与 Vite 开发模式均通过冒烟检查，包括固定窗口、渲染层 bridge、真实后端的 `list` / `parseUri`、剪贴板 IPC（拦截写入）及测试 PNG 下载事件（不落盘）。账号文件哈希未变化。
- 后续离屏回归验证了拖动阴影圆角、松手归位和右键菜单位置、顶部进度条逐帧变化与跨周期单次刷新、提示移开后关闭、五个品牌图标离线加载以及未知账号缩写回退。
- 临时验证通过了无效 Base32 拒绝、验证码与独立 HMAC-SHA1 计算核对、过期刷新、复制、退出与重开清空的验证；未调用添加账号接口，账号文件哈希一致。HeroUI 调整后再次完成类型检查、前端构建和离屏测试，确认明文输入、正常提交与退出清理。

## 9. 分组管理 + 迁移导入（2026-11-20 晚，替代临时验证）

- **移除临时验证**：删除临时验证整页、独立历史存储、`generatetemporarycode` / `templist` / `tempstart` / `tempupdate` / `tempdelete` 等 action 与相关组件，`temp-history.json` 已清理，不再保留任何临时验证入口。
- **新增分组管理**：
  - 后端 `GroupStore`（`groups.json`，最多 50 个、名称最长 20 字符、不区分大小写去重）+ `groupadd` / `grouprename` / `groupdelete` / `grouplist`；`AccountRecord`/`AccountDto` 增加 `groupId`，`add` / `update` 支持带分组。
  - 标题栏计时器按钮替换为「分组管理」入口；分组管理页支持新建、行内重命名（Enter 保存 / Esc 取消）、删除（确认框；当时代码把组内账号移回「未分组」，第 11 节起改为随分组级联删除）。
  - 账号列表顶部新增分组筛选栏；筛选状态下拖拽排序会合并回全局顺序后持久化；添加账号弹窗默认选中当前筛选的分组，编辑弹窗可切换分组。
- **修复迁移导入报「链接格式无效」**：新增 `MigrationParser` 解析 `otpauth-migration://offline?data=...`（`MigrationPayload` protobuf），链接与二维码页签都识别该格式，预览后批量导入到所选分组；用户提供的 9 条导出链接现已可以完整导入。
- **错误文案清洗**：新增 `utils/errors.ts`，把 `Error invoking remote method 'authenticator:xxx': Error: ...` 剥成后端中文提示（如「分组名称已存在。」）。
- **验证**：
  - `npx tsc --noEmit`、`npm run build:vite`、`npm run build:backend` 全部退出码 `0`。
  - 协议级端到端：分组新建/改名/重名拒绝/删除（`movedAccounts` 正确）；迁移链接解析出 9 条 TOTP 账号（全部 SHA1 / 6 位，其中 2 条无 issuer），逐条 `add` 到分组后 `list` 返回 9 条且 `groupId` 全部正确；对其中一条用 `export` 取密钥独立计算 HMAC-SHA1，验证码与 `list` 返回值一致（PASS）；当时代码在删除分组后把 9 条账号的 `groupId` 清空（该行为已在第 11 节收紧为级联删除）。
  - 界面侧已验证：分组管理页创建（含 Enter 提交）、重命名、重名报错、筛选胶囊切换、添加弹窗默认选中当前分组；其余交互（卡片分组后缀、筛选内拖拽合并、删除分组的确认框）由代码审查与协议测试覆盖。本轮测试数据已清理；随后用户已自行导入正式账号并建立分组（`accounts.json` / `groups.json` 为真实数据，勿当作测试数据清空）。

## 10. 品牌图标扩充 + 主页面去掉「全部」（2026-11-20）

- **图标合集**：改用 [Simple Icons](https://simpleicons.org)（CC0）并内置 85 个常见品牌图标，输出到 `public/brands/si/<slug>.svg`（24×24 path + 官方品牌色 `fill`，无网络请求）；新增 `src/renderer/brandIcons.ts` 顺序匹配表，替换原先 5 个品牌的硬编码正则，`AccountCard` 改用 `resolveBrand` / `brandIconUrl`，未命中仍回退名称缩写。
  - 覆盖示例：OpenAI、Anthropic、Hugging Face、Gemini、Perplexity、Mozilla、Firefox、Microsoft、Google/Gmail/Google Cloud、AWS、Apple、GitHub/GitLab/Bitbucket、Slack、Discord、Notion、Figma、Zoom、PayPal、Stripe、Binance、Steam、Netflix、Spotify、X/Twitter、LinkedIn、Telegram、微信、QQ、B 站、知乎、小米、华为等。
  - 授权与处理方式记录在 [`public/brands/SOURCES.md`](public/brands/SOURCES.md)。
- **主页面不再显示「全部」**：分组筛选栏只列 `未分组 + 各分组`（第 11 节起进一步移除「未分组」，只列真实分组）；进入账号列表时自动选中一个有效分组；没有任何分组时隐藏筛选栏（第 11 节起改为引导创建分组）；卡片不再追加分组后缀。
- **验证**：
  - `npx tsc --noEmit`、`npm run build:vite`、`npm run build:backend` 全部退出码 `0`。
  - 脚本校验：85 条匹配规则覆盖 84 个品牌 slug，图标文件全部存在且为含 `fill="#RRGGBB"` 的合法 SVG；33 条服务名匹配用例全部通过（含 OpenAI、ChatGPT、Mozilla、Firefox、AWS、Microsoft/Outlook、X、Twitter、QQ、微信、未命中回退等）；构建产物 `dist/brands/si` 共 85 个图标。
  - 无头 Chrome 渲染 85 图标总览图并人工核验，图标显示正常、颜色与形状符合各品牌。

## 11. 分组归属收紧 + Muse 图标（2026-11-20 晚，最新）

- **移除「未分组」**：`GroupFilterBar` 只渲染真实分组；`App` 用 `selectedGroupId` 计算当前分组（优先第一个有账号的分组），不再有 `UNGROUPED` 状态；没有任何分组时主页面显示「还没有分组」引导卡片（按钮进入分组管理），标题栏隐藏 `+`。
- **添加/编辑必须选分组**：`AddAccountModal` / `EditAccountModal` 的分组选择器去掉「未分组」选项并设为必选；后端 `add` / `update` 在 `groupId` 为空时返回「请先选择分组。」，分组不存在返回「分组不存在。」，`AccountStore` 再做一次兜底校验。
- **删除分组级联删除账号**：`groupdelete` 调用 `AccountStore.DeleteByGroup`，返回 `{ deleted, removedAccounts }`；分组页确认框显示「组内 N 个账号会被一并删除，此操作无法撤销」，Toast 汇总删除数量。
- **历史数据修复**：启动时 `AccountStore.FindOrphanGroupIds(groupStore.Exists)` 找出 `groupId` 为空或指向已删除分组的账号，`GroupStore.Ensure("默认分组")` 后统一 `ReassignGroups`，防止账号在界面上不可见。
- **移除演示账号**：首次启动不再预置 GitHub / Google / Microsoft 示例账号，空账号库直接引导创建分组。
- **数据目录可覆盖**：新增 `backend/AppPaths.cs`，支持 `AUTHENTICATOR_DATA_DIR` 环境变量指定数据目录，便于便携运行与自动化测试；默认仍是 `%APPDATA%\WindowsAuthenticatorDemo`。
- **Muse 图标**：
  - `resolveBrand(issuer, account)` 先匹配服务名称、再匹配账号字段；用户数据里的 `未命名 / Muse` 现在会命中 `muse` 图标。
  - 新增 `public/brands/si/muse.svg`（Muse / Meta，[muse.ai](https://muse.ai)，取自 LobeHub Icons，MIT，保留蓝色渐变），图标总数 85。
  - OpenAI 匹配规则放宽为 `[0o]pen\s*ai`，用户数据里 `0penai`（数字 0）的账号也能显示 OpenAI 图标。
- **涉及文件**：
  - 后端：[`AccountStore.cs`](backend/AccountStore.cs)、[`GroupStore.cs`](backend/GroupStore.cs)、[`BackendDispatcher.cs`](backend/BackendDispatcher.cs)、[`Program.cs`](backend/Program.cs)、新增 [`AppPaths.cs`](backend/AppPaths.cs)。
  - 前端：[`App.tsx`](src/renderer/App.tsx)、[`GroupFilterBar.tsx`](src/renderer/components/GroupFilterBar.tsx)、[`TitleBar.tsx`](src/renderer/components/TitleBar.tsx)、[`AddAccountModal.tsx`](src/renderer/components/AddAccountModal.tsx)、[`EditAccountModal.tsx`](src/renderer/components/EditAccountModal.tsx)、[`GroupManagementPage.tsx`](src/renderer/components/GroupManagementPage.tsx)、[`AccountCard.tsx`](src/renderer/components/AccountCard.tsx)、[`brandIcons.ts`](src/renderer/brandIcons.ts)、[`types.ts`](src/renderer/types.ts)。
  - 资源与文档：[`muse.svg`](public/brands/si/muse.svg)、[`SOURCES.md`](public/brands/SOURCES.md)、[`README.md`](README.md)。
- **已知取舍**：
  - 删除分组 = 删除组内账号（没有「未分组」可回退）；确认框已标明数量与不可撤销。若要改为「非空分组禁止删除」，需要同时改 `groupdelete` 与分组页按钮状态。
  - Muse 按 Meta 的 Muse（muse.ai）处理；若实际是其它服务，替换 `muse.svg` 与 `brandIcons.ts` 中对应规则即可。
- **验证**：
  - `npx tsc --noEmit`、`npm run build:vite`、`npm run build:backend` 全部退出码 `0`。
  - 协议测试（临时数据目录，21 项全 PASS）：add 无分组/假分组被拒、update 无分组被拒、分组重名/空名被拒、级联删除数量正确、删除后其它分组账号保留、历史 `groupId` 为空/失效时启动收编到「默认分组」并落盘。
  - 无头 Chrome（mock bridge，400×620@2x）16 项断言全 PASS：筛选栏仅 Google/AI 两个分组且无「未分组/全部」、Muse 与 OpenAI/Google/Mozilla 图标全部解码成功、`0penai` 命中 OpenAI、添加弹窗分组必选且提交时自动带上当前分组、删除确认显示「5 个账号…一并删除」、无分组时隐藏 `+` 且显示引导；截图见临时目录（不随仓库分发）。
  - 用户真实数据（9 个账号 + Google 分组）未被测试触碰。

## 12. 品牌定名（Klipy）、平面扁平式 Logo、分组管理 UI 优化与移除分组上限（2026-11-20 晚）

- **产品定名**：**Klipy**
  - 纯英文短词，融合 **K**ey（动态密钥）与 C**lip**（单击即复制到剪贴板），不含 `auth`，轻快好记。
  - 数据目录保持 `%APPDATA%\WindowsAuthenticatorDemo` 不变，确保用户已有真实数据不受影响。
- **现代化平面扁平式 Logo**：
  - 彻底移除旧版深色拟物玻璃、渐变与发光滤镜，重制为仅由 6 个基础几何图元构成的纯平 2D 矢量 SVG（`viewBox="0 0 512 512"`，约 0.97 KB）：
    - HeroUI 靛蓝圆角方形底托（`#4F46E5`）+ 纯平轨道（`#6860F0`）+ 270° 白色倒计时环（`#FFFFFF`）+ 右上 1:30 翠绿时间脉冲点（`#34D399`）+ 居中实心几何钥匙孔（`#FFFFFF`）。
  - 同步更新 `logo.svg`、`public/logo.svg`、`src/renderer/assets/logo.svg`，导出透明底 `512×512` 的 `public/app-icon.png` 作为 Electron 窗口与任务栏图标，并重绘浅色扁平风格的品牌展示图 `logo-preview.png`。
- **分组管理优化与取消上限**：
  - 后端 `GroupStore.cs` 移除 `MaxGroups = 50` 限制，不再对分组总数设上限。
  - 前端 `GroupManagementPage.tsx` 移除底部「账号必须属于某个分组；删除分组会同时删除组内账号。」文案及 50 上限禁用逻辑，计数胶囊改为 `{groups.length} 个`；顶部新建区收拢为单行紧凑卡片；列表项改用 `Folder` 图标配柔和靛蓝圆角底托并优化重命名态、空状态与删除确认弹窗。
- **界面、文档与仓库**：
  - 更新 `TitleBar.tsx`、`index.html`、`src/main/main.js`、`启动.bat`、`package.json`、`README.md` 与本文档，并同步至 GitHub 公开仓库 `https://github.com/LuoMuQAQ/Klipy`。
- **验证**：
  - `npx tsc --noEmit`、`npm run build:vite` 与 `npm run build:backend` 均以退出码 `0` 通过。
  - 协议测试（临时 `AUTHENTICATOR_DATA_DIR`）：连续创建 55 个分组全部成功，确认无上限限制。
  - 通过无头 Chrome 渲染查验 `logo-preview.png`、主界面标题栏与分组管理页（mock bridge，不触碰 `%APPDATA%\WindowsAuthenticatorDemo`）。
