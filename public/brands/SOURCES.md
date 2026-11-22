# 账号品牌图标来源

这些素材仅用于标识对应的账号服务，商标归各自所有者所有。应用从本地加载图标，不向服务商发送请求。

## 品牌图标：Simple Icons

- 图标合集：[Simple Icons](https://simpleicons.org) / [GitHub 仓库](https://github.com/simple-icons/simple-icons)
- 许可：**CC0 1.0 Universal**（公共领域贡献）；品牌标识本身仍受各自商标法保护，仅作本地账号标识用途。
- 版本：
  - 主体取自 `simple-icons@15`；
  - 已从新版移除、但旧版仍收录的 9 个品牌取自 `simple-icons@12`（Microsoft、Amazon Web Services、LinkedIn、Adobe、IBM、Oracle、Nintendo Switch、Tencent QQ）与 `simple-icons@11`（Twitter）。
- 处理方式：保留原始 `viewBox="0 0 24 24"` 的 path 数据，去掉 `<title>`，把官方品牌色 `hex` 写入 SVG 根节点的 `fill`，输出为 `public/brands/si/<slug>.svg`。
- 当前收录 85 个常见服务：开发/云（GitHub、GitLab、AWS、Google Cloud、Cloudflare、Docker、Vercel、Netlify、Notion、Figma、Slack、Discord、Zoom…）、AI（OpenAI、Anthropic、Hugging Face、Gemini、Perplexity、Muse…）、大厂账号（Google、Gmail、Microsoft、Apple、Amazon…）、娱乐与社交（YouTube、Netflix、Spotify、Steam、X、Telegram、微信、QQ、Bilibili、知乎…）等。

## 补充图标：Muse（Meta）

- 服务：Muse（Meta 的个人 AI 助手，[muse.ai](https://muse.ai)）。
- 素材来源：[LobeHub Icons](https://github.com/lobehub/lobe-icons) 的 `muse` 彩色图标（`@lobehub/icons-static-svg`）。
- 许可：**MIT**。
- 处理方式：保留原始 path 与官方蓝色渐变（`#0082FB → #0064E0 → #0040DC`），去掉 `1em` 尺寸等运行时样式，输出为 `public/brands/si/muse.svg`。

## 匹配规则

- 见 [`src/renderer/brandIcons.ts`](../../src/renderer/brandIcons.ts)：先按「服务名称（issuer）」、再按「账号」在顺序正则表中匹配；都没有命中时回退到名称缩写。
- 例如导入的迁移链接常出现 `issuer = 未命名, account = Muse`，此时会用账号字段命中 Muse 图标。
- 新增品牌：把 `<slug>.svg` 放进 `public/brands/si/`，并在 `brandIcons.ts` 的顺序表中补一条规则即可。
