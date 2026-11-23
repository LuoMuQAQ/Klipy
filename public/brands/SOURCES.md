# 账号品牌图标来源

这些素材仅用于标识对应的账号服务，商标归各自所有者所有。应用从本地加载图标，不向服务商发送请求。

## 品牌图标：Simple Icons

- 图标合集：[Simple Icons](https://simpleicons.org) / [GitHub 仓库](https://github.com/simple-icons/simple-icons)
- 许可：**CC0 1.0 Universal**（公共领域贡献）；品牌标识本身仍受各自商标法保护，仅作本地账号标识用途。
- 版本：
  - 主体取自 `simple-icons@15`；
  - 已从新版移除、但旧版仍收录的 9 个品牌取自 `simple-icons@12`（Microsoft、Amazon Web Services、LinkedIn、Adobe、IBM、Oracle、Nintendo Switch、Tencent QQ）与 `simple-icons@11`（Twitter）。
- 处理方式：保留原始 `viewBox="0 0 24 24"` 的 path 数据，去掉 `<title>`，把官方品牌色 `hex` 写入 SVG 根节点的 `fill`，输出为 `public/brands/si/<slug>.svg`。
- 共打包 85 个素材（含下方的 Muse），其中 83 个在图标选择器中可选。下架的素材只用于显示已有的手选图标，不再参与自动匹配。

## 双因素认证审查（2026-11-23）

图标用于标识账号，不表示 Klipy 能生成该平台的所有验证码。对照 [2FA Directory](https://2fa.directory/) 与服务商帮助文档；按账号类型区分，目录未收录或资料冲突不等于不支持。

- **资料支持 TOTP 或第三方验证器**：Airtable、阿里云、AWS、Asana、Atlassian（含 Jira、Confluence、Trello）、Bitbucket、币安、Canva、Cloudflare、Coinbase、DigitalOcean、Discord、Docker、Dropbox、eBay、Epic Games、Evernote、Facebook、Figma、GitHub（含 Copilot）、GitLab、Google（含 Gmail、Google Cloud、Gemini、YouTube）、Heroku、华为云、HubSpot、Hugging Face、IBM Cloud、Instagram、LinkedIn、Mailchimp、Microsoft、Miro、Mozilla（Firefox 账号）、Netlify、Nintendo Account、NordVPN、Notion、NVIDIA、OpenAI、Oracle Cloud、PayPal、PlayStation Network、Proton、Reddit、Roblox、Salesforce、SAP、Shopify、Slack、Stripe、TikTok、Twitch、Wise、X（含 Twitter）、Zoom。部分功能受账号套餐、地区或组织策略限制。
- **特定产品有明确支持**：[Spotify for Artists](https://support.spotify.com/us/artists/article/setting-up-2-step-verification/) 支持验证器，因此保留其图标，但普通 Spotify 名称不再自动匹配；[支付宝小程序商家平台](https://idocs.alipay.com/miniprogram/miniprogram/dev_platform_merchant/settings_2fa) 支持验证器，不据此推断支付宝个人账号；[Intel 企业账号](https://www.intel.com/content/www/us/en/support/articles/000092340/programs/access-entitlement-for-myintel-users.html) 有 MFA。
- **有额外验证，不据此声明兼容 Klipy**：Adobe、[Apple](https://support.apple.com/en-us/102660)、ExpressVPN、[Revolut](https://help.revolut.com/help/more/revolut-web-app/accessing-the-retail-web-app/)、[Steam](https://help.steampowered.com/en/faqs/view/7EFD-3CAE-64D3-1C31)、[Telegram](https://telegram.org/blog/sessions-and-2-step-verification)、[WhatsApp](https://faq.whatsapp.com/1278661612895630/)。
- **另有官方验证器指南**：[Vercel](https://vercel.com/docs/two-factor-authentication)。
- **证据不足或说法不一，暂留**：Anthropic Claude、哔哩哔哩、Muse、Perplexity、QQ、微信、知乎。不把社区教程、第三方登录或对其他账号生成验证码的功能当成该服务原生 2FA 的证明。
- **从可选库及自动匹配移除**：小米（[账号手册](https://account.xiaomi.com/helpcenter/faq/en_US/03.account-safety/12.safety-verification/faq-4)说明原两步验证已停用，信任中心对账号保护的描述不同）；Netflix（[普通账号安全指南](https://help.netflix.com/en/node/13243)未列可开启的两步验证，2FA Directory 未标记支持；Netflix Open Connect 合作伙伴账号的 MFA 不代表普通订阅账号）。已手选这两个图标的账号继续显示原图标，不改写保险库。

## 补充图标：Muse（Meta）

- 服务：Muse（Meta 的个人 AI 助手，[muse.ai](https://muse.ai)）。
- 素材来源：[LobeHub Icons](https://github.com/lobehub/lobe-icons) 的 `muse` 彩色图标（`@lobehub/icons-static-svg`）。
- 许可：**MIT**。
- 处理方式：保留原始 path 与官方蓝色渐变（`#0082FB → #0064E0 → #0040DC`），去掉 `1em` 尺寸等运行时样式，输出为 `public/brands/si/muse.svg`。

## 匹配规则

- 见 [`src/renderer/brandIcons.ts`](../../src/renderer/brandIcons.ts)：先按「服务名称（issuer）」、再按「账号」在顺序正则表中匹配；都没有命中时回退到名称缩写。
- 例如导入的迁移链接常出现 `issuer = 未命名, account = Muse`，此时会用账号字段命中 Muse 图标。
- 新增品牌前先核实该服务的账号 2FA，并记录适用范围及来源；再添加 `<slug>.svg`、匹配规则与中英文标签。
