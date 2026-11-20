const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

function createBackendClient(root, { allowSource = false, backendDir = path.join(root, 'bin', 'backend') } = {}) {
  const executable = path.join(backendDir, 'AuthenticatorBackend.exe');
  const project = path.join(root, 'backend', 'AuthenticatorBackend.csproj');
  let connection;
  let nextId = 0;
  let closed = false;

  function start() {
    const published = existsSync(executable);
    if (!published && !allowSource) throw new Error('未找到 C# 后端。请先运行 npm run build:backend。');
    const child = spawn(
      published ? executable : 'dotnet',
      published ? [] : ['run', '--project', project, '-c', 'Release', '--no-launch-profile'],
      { cwd: published ? backendDir : root, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    const pending = new Map();
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    const current = { child, pending, stop };
    connection = current;

    function stop(error) {
      if (connection === current) connection = undefined;
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      pending.clear();
      lines.close();
    }

    child.stderr.resume(); // Do not surface raw backend diagnostics containing sensitive input.
    child.on('error', stop);
    child.stdin.on('error', stop);
    child.once('close', (code) => stop(new Error({
      20: '无法读取或迁移数据。请保留原文件，不要用旧版本覆盖。',
      21: '数据目录不可用或正在被另一个 Klipy 进程使用。',
    }[code] || `C# 后端已退出（${code ?? '已终止'}）。`)));
    lines.on('line', (line) => {
      let response;
      try {
        response = JSON.parse(line);
      } catch {
        // dotnet run 的构建输出不属于业务协议。
        return;
      }
      const item = pending.get(response?.id);
      if (!item || typeof response.success !== 'boolean') return;
      pending.delete(response.id);
      clearTimeout(item.timer);
      if (response.success) item.resolve(response.data);
      else item.reject(new Error(response.error || 'C# 后端请求失败。'));
    });

    return current;
  }

  function request(action, params) {
    if (closed) return Promise.reject(new Error('身份验证器正在关闭。'));
    const id = String(++nextId);
    const payload = `${JSON.stringify({ id, action, params })}\n`;
    if (Buffer.byteLength(payload) > 512 * 1024) return Promise.reject(new Error('请求过大。'));
    const { child, pending } = connection ?? start();
    if (pending.size >= 32 || child.stdin.writableLength >= 1024 * 1024) {
      return Promise.reject(new Error('请求过多，请稍后重试。'));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`C# 后端请求超时（${action}）。`));
      }, 30_000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(payload, 'utf8', (error) => {
        if (!error || !pending.delete(id)) return;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function close() {
    closed = true;
    if (!connection) return;
    const { child, stop } = connection;
    // 关闭 stdin 使后端循环自然退出，包括 dotnet run 回退路径。
    child.stdin.end();
    stop(new Error('身份验证器正在关闭。'));
  }

  return { request, close };
}

module.exports = { createBackendClient };
