/**
 * 品牌图标匹配表：图标来自 Simple Icons（https://simpleicons.org，CC0 1.0），
 * 随应用打包在 public/brands/si/ 下，运行时不会发起网络请求。
 *
 * 规则按「越具体越靠前」排列，例如 GitHub Copilot 必须排在 GitHub 之前，
 * Google Cloud / Gmail 也必须排在 Google 之前。
 */
export interface BrandIcon {
  slug: string;
  pattern: RegExp;
}

export const BRAND_ICONS: BrandIcon[] = [
  // 开发工具 / 云服务（先匹配更具体的子品牌）
  { slug: 'githubcopilot', pattern: /\bgithub\s*copilot\b/i },
  { slug: 'github', pattern: /\bgithub\b/i },
  { slug: 'gitlab', pattern: /\bgitlab\b/i },
  { slug: 'bitbucket', pattern: /\bbitbucket\b/i },
  { slug: 'googlecloud', pattern: /\bgoogle\s*cloud\b|谷歌云/i },
  { slug: 'alibabacloud', pattern: /\bali(?:baba)?\s*cloud\b|阿里云/i },
  { slug: 'amazonwebservices', pattern: /\b(?:aws|amazon\s+web\s+services)\b|亚马逊云/i },
  { slug: 'cloudflare', pattern: /\bcloudflare\b/i },
  { slug: 'docker', pattern: /\bdocker\b/i },
  { slug: 'digitalocean', pattern: /\bdigital\s*ocean\b/i },
  { slug: 'vercel', pattern: /\bvercel\b/i },
  { slug: 'netlify', pattern: /\bnetlify\b/i },
  { slug: 'heroku', pattern: /\bheroku\b/i },
  { slug: 'nvidia', pattern: /\bnvidia\b|英伟达/i },
  { slug: 'intel', pattern: /\bintel\b|英特尔/i },
  { slug: 'adobe', pattern: /\badobe\b/i },
  { slug: 'canva', pattern: /\bcanva\b/i },
  { slug: 'oracle', pattern: /\boracle\b|甲骨文/i },
  { slug: 'ibm', pattern: /\bibm\b/i },
  { slug: 'sap', pattern: /\bsap\b/i },
  { slug: 'salesforce', pattern: /\bsalesforce\b/i },
  { slug: 'hubspot', pattern: /\bhubspot\b/i },
  { slug: 'shopify', pattern: /\bshopify\b/i },
  { slug: 'stripe', pattern: /\bstripe\b/i },
  { slug: 'atlassian', pattern: /\batlassian\b/i },
  { slug: 'jira', pattern: /\bjira\b/i },
  { slug: 'confluence', pattern: /\bconfluence\b/i },
  { slug: 'notion', pattern: /\bnotion\b/i },
  { slug: 'figma', pattern: /\bfigma\b/i },
  { slug: 'slack', pattern: /\bslack\b/i },
  { slug: 'discord', pattern: /\bdiscord\b/i },
  { slug: 'zoom', pattern: /\bzoom\b/i },
  { slug: 'dropbox', pattern: /\bdropbox\b/i },
  { slug: 'trello', pattern: /\btrello\b/i },
  { slug: 'asana', pattern: /\basana\b/i },
  { slug: 'airtable', pattern: /\bairtable\b/i },
  { slug: 'miro', pattern: /\bmiro\b/i },

  // 支付 / 金融
  { slug: 'paypal', pattern: /\bpaypal\b|贝宝/i },
  { slug: 'binance', pattern: /\bbinance\b|币安/i },
  { slug: 'coinbase', pattern: /\bcoinbase\b/i },
  { slug: 'wise', pattern: /\bwise\b/i },
  { slug: 'revolut', pattern: /\brevolut\b/i },

  // AI / 浏览器
  { slug: 'openai', pattern: /\b[0o]pen\s*ai\b|chatgpt/i },
  { slug: 'anthropic', pattern: /\banthropic\b|claude/i },
  { slug: 'huggingface', pattern: /\bhugging\s*face\b/i },
  { slug: 'perplexity', pattern: /\bperplexity\b/i },
  { slug: 'muse', pattern: /\bmuse\b/i },
  { slug: 'googlegemini', pattern: /\bgemini\b|\bbard\b/i },
  { slug: 'mozilla', pattern: /\bmozilla\b/i },
  { slug: 'firefoxbrowser', pattern: /\bfirefox\b|火狐/i },
  { slug: 'proton', pattern: /\bproton(?:\s*mail)?\b/i },
  { slug: 'nordvpn', pattern: /\bnord\s*vpn\b/i },
  { slug: 'expressvpn', pattern: /\bexpress\s*vpn\b/i },
  { slug: 'evernote', pattern: /\bevernote\b|印象笔记/i },
  { slug: 'mailchimp', pattern: /\bmailchimp\b/i },

  // 大厂账号
  { slug: 'microsoft', pattern: /\b(?:microsoft|outlook|hotmail|office\s*365|entra|ms\s*account)\b|微软/i },
  { slug: 'gmail', pattern: /\bgmail\b|谷歌邮箱/i },
  { slug: 'google', pattern: /\bgoogle\b|谷歌/i },
  { slug: 'apple', pattern: /\bapple\b|icloud|苹果/i },
  { slug: 'amazonwebservices', pattern: /\bamazon\b|亚马逊/i },
  { slug: 'ebay', pattern: /\bebay\b/i },

  // 内容 / 娱乐
  { slug: 'youtube', pattern: /\byoutube\b|油管/i },
  { slug: 'netflix', pattern: /\bnetflix\b/i },
  { slug: 'spotify', pattern: /\bspotify\b/i },
  { slug: 'twitch', pattern: /\btwitch\b/i },
  { slug: 'steam', pattern: /\bsteam\b/i },
  { slug: 'epicgames', pattern: /\bepic\s*games\b/i },
  { slug: 'roblox', pattern: /\broblox\b/i },
  { slug: 'playstation', pattern: /\bplaystation\b|\bpsn\b/i },
  { slug: 'nintendoswitch', pattern: /\bnintendo\b|任天堂/i },

  // 社交 / 通讯
  { slug: 'facebook', pattern: /\bfacebook\b|脸书/i },
  { slug: 'instagram', pattern: /\binstagram\b|ins\b/i },
  { slug: 'twitter', pattern: /\btwitter\b/i },
  { slug: 'x', pattern: /^x$/i },
  { slug: 'linkedin', pattern: /\blinkedin\b|领英/i },
  { slug: 'reddit', pattern: /\breddit\b/i },
  { slug: 'telegram', pattern: /\btelegram\b|电报/i },
  { slug: 'whatsapp', pattern: /\bwhatsapp\b/i },
  { slug: 'wechat', pattern: /\bwechat\b|微信/i },
  { slug: 'tencentqq', pattern: /(?:^|\W)qq(?:\W|$)|腾讯\s*qq/i },
  { slug: 'tiktok', pattern: /\btiktok\b|抖音/i },
  { slug: 'alipay', pattern: /\balipay\b|支付宝/i },
  { slug: 'bilibili', pattern: /\bbilibili\b|哔哩哔哩|b\s*站/i },
  { slug: 'zhihu', pattern: /\bzhihu\b|知乎/i },
  { slug: 'xiaomi', pattern: /\bxiaomi\b|小米/i },
  { slug: 'huawei', pattern: /\bhuawei\b|华为/i },
];

/**
 * 按顺序匹配品牌：先看服务名称（issuer），再看账号字段。
 * 迁移链接里常见的「未命名 + 账号名就是服务名」也能命中；账号是邮箱时会落到邮箱品牌上。
 * 未命中返回 undefined（由界面回退到名称缩写）。
 */
export function resolveBrand(
  issuer: string | null | undefined,
  account?: string | null,
): BrandIcon | undefined {
  for (const candidate of [issuer, account]) {
    const name = (candidate ?? '').trim();
    if (!name) continue;
    const hit = BRAND_ICONS.find((brand) => brand.pattern.test(name));
    if (hit) return hit;
  }
  return undefined;
}

/** 图标随应用打包在 dist/brands/si/ 下。 */
export function brandIconUrl(slug: string): string {
  return `${import.meta.env.BASE_URL}brands/si/${slug}.svg`;
}
