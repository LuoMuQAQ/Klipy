/**
 * Electron 在 ipcRenderer.invoke 失败时会把错误包成
 * "Error invoking remote method 'xxx': Error: 真实信息"，
 * 这里剥掉外层包装，只把后端返回的中文提示交给界面。
 */
export function formatError(error: unknown, fallback = '操作失败，请重试'): string {
  if (!(error instanceof Error)) return fallback;

  const message = error.message || '';
  const match = message.match(/Error:\s*([\s\S]*)$/);
  const cleaned = (match ? match[1] : message).trim();
  return cleaned || fallback;
}
