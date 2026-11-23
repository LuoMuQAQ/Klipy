import { brandIconUrl, resolveBrand } from '../brandIcons';
import { t } from '../i18n';

/** 自定义图标统一缩放为正方形 PNG；界面按 36px 显示，128px 已覆盖高分屏。 */
export const ICON_SIZE = 128;
export const ICON_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/bmp,image/x-icon,image/vnd.microsoft.icon,image/svg+xml,image/avif';
/** 与主进程 / 后端保持一致的自定义图标上限。 */
export const MAX_ICON_URL_LENGTH = 256 * 1024;

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_EDGE = 16_384;
const ACCEPTED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/x-ms-bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/svg+xml',
  'image/avif',
]);
const ACCEPTED_EXTENSION = /\.(png|jpe?g|webp|gif|bmp|dib|ico|avif|svg)$/i;

export type AccountIconKind = 'brand' | 'custom';

export interface ResolvedAccountIcon {
  src: string;
  kind: AccountIconKind;
  /** 内置图标的 slug；自定义图片为空。 */
  slug?: string;
}

/** 解析账号图标：显式选择优先，其次按服务名/账号自动匹配品牌。 */
export function resolveAccountIcon(
  icon: string | null | undefined,
  issuer: string | null | undefined,
  account?: string | null,
): ResolvedAccountIcon | undefined {
  if (icon?.startsWith('si:')) {
    const slug = icon.slice(3);
    if (/^[a-z0-9-]{1,64}$/.test(slug)) {
      return { src: brandIconUrl(slug), kind: 'brand', slug };
    }
  }
  if (icon?.startsWith('data:image/')) {
    return { src: icon, kind: 'custom' };
  }

  const brand = resolveBrand(issuer, account);
  return brand ? { src: brandIconUrl(brand.slug), kind: 'brand', slug: brand.slug } : undefined;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t('iconLoadFailed')));
    image.src = url;
  });
}

function assertSupportedFile(file: File) {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error(t('iconTooLarge'));
  }
  const type = (file.type || '').toLowerCase();
  if (type ? !ACCEPTED_TYPES.has(type) : !ACCEPTED_EXTENSION.test(file.name)) {
    throw new Error(t('iconUnsupported'));
  }
}

export async function loadAccountIcon(file: File): Promise<HTMLImageElement> {
  assertSupportedFile(file);

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) {
      throw new Error(t('iconSizeUnknown'));
    }
    if (width > MAX_SOURCE_EDGE || height > MAX_SOURCE_EDGE) {
      throw new Error(t('iconTooLargeDimensions'));
    }

    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface IconCrop {
  x: number;
  y: number;
  size: number;
}

/** 预览与输出共用同一块原图坐标；保留透明度，动画取默认帧。 */
export function drawAccountIcon(canvas: HTMLCanvasElement, image: HTMLImageElement, crop: IconCrop) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error(t('iconCanvasUnavailable'));
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, canvas.width, canvas.height);
}

export function rasterizeAccountIcon(image: HTMLImageElement, crop: IconCrop): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_SIZE;
  drawAccountIcon(canvas, image, crop);
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length > MAX_ICON_URL_LENGTH) {
    throw new Error(t('iconStillTooLarge'));
  }
  return dataUrl;
}
