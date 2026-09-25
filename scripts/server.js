const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const run = require('util').promisify(execFile);
const Order = require('../js/portfolio-order.js');
const { rescan } = require('./scan-assets.js');
const ROOT_DIR = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff' };
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw fail(413, '配置超过 20 MB，请检查文件');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw fail(400, 'JSON 格式无效'); }
}

function createServer({ rootDir = ROOT_DIR, assetRoot = rootDir, allowPublish = true } = {}) {
  const dataFile = path.join(rootDir, 'data', 'portfolio-data.json');
  let maintenance = false;
  const read = () => {
    const text = fs.readFileSync(dataFile, 'utf8');
    return { data: JSON.parse(text), revision: hash(text) };
  };
  const checkRevision = revision => {
    if (!revision || revision !== read().revision) throw fail(409, '磁盘配置已更新，请先导出当前修改，再重新载入后合并。');
  };
  const write = data => {
    try { Order.validate(data); } catch (error) { throw fail(400, error.message); }
    const text = JSON.stringify(data, null, 2);
    const temporary = `${dataFile}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, text, 'utf8');
      fs.copyFileSync(dataFile, `${dataFile}.bak`);
      fs.renameSync(temporary, dataFile);
    } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    return { revision: hash(text), savedAt: new Date().toISOString() };
  };
  const missing = data => data.items.filter(item => !fs.existsSync(path.join(rootDir, item.src))).map(item => item.id);
  const git = args => run('git', args, { cwd: rootDir, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  const gitStatus = async () => {
    const [{ stdout: changes }, { stdout: branch }, { stdout: remote }] = await Promise.all([
      git(['-c', 'core.quotepath=false', 'status', '--porcelain']), git(['branch', '--show-current']), git(['remote', 'get-url', 'origin'])
    ]);
    const { stdout: ahead } = await git(['rev-list', '--count', `origin/${branch.trim()}..HEAD`]).catch(() => ({ stdout: '0' }));
    return { changes, branch: branch.trim(), remote: remote.trim(), ahead: Number(ahead.trim()), review: hash(changes + branch + remote) };
  };
  return http.createServer(async (req, res) => {
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname.startsWith('/api/')) {
        const ownOrigin = `http://${req.headers.host}`;
        if (req.headers.origin && req.headers.origin !== ownOrigin) throw fail(403, '请从本地后台页面操作');
        if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(ownOrigin).hostname)) throw fail(403, '仅支持本地管理');
        if (req.method === 'GET' && pathname === '/api/status') return send(res, 200, {
          status: 'running', mode: 'local-server', dataFileExists: fs.existsSync(dataFile), canPublish: allowPublish
        });
        if (req.method === 'GET' && pathname === '/api/portfolio') {
          const snapshot = read();
          return send(res, 200, { ...snapshot, missing: missing(snapshot.data) });
        }
        if (req.method === 'GET' && pathname === '/api/git-status') {
          if (!allowPublish) throw fail(403, '测试环境不提供发布');
          return send(res, 200, await gitStatus());
        }
        if (req.method !== 'POST') throw fail(404, '接口不存在');
        if (!req.headers['content-type']?.startsWith('application/json')) throw fail(415, '请使用 JSON 请求');
        const body = await readBody(req);
        if (maintenance) throw fail(423, '服务正在处理素材或发布，请稍后保存');
        if (pathname === '/api/save') {
          checkRevision(body.revision);
          return send(res, 200, { success: true, ...write(body.data), message: '已保存到本地，刷新前台即可查看。' });
        }
        if (pathname === '/api/rescan') {
          checkRevision(body.revision);
          const result = rescan(rootDir, read().data);
          if (body.preview) return send(res, 200, { success: true, summary: result.summary });
          const saved = write(result.data);
          return send(res, 200, { success: true, ...result, ...saved, missing: missing(result.data) });
        }
        if (pathname === '/api/build-previews') {
          maintenance = true;
          try {
            const python = process.env.PORTFOLIO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
            await run(python, [path.join(rootDir, 'scripts', 'build-previews.py')], {
              cwd: rootDir, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 10 * 60 * 1000
            });
            return send(res, 200, { success: true, message: '预览图与视频海报已生成。' });
          } finally { maintenance = false; }
        }
        if (pathname === '/api/git-push') {
          if (!allowPublish) throw fail(403, '测试环境不提供发布');
          checkRevision(body.revision);
          const status = await gitStatus();
          if (!body.review || status.review !== body.review) throw fail(409, '待发布文件已变化，请重新查看发布清单');
          if (!status.branch) throw fail(400, '请先切换到一个 Git 分支');
          maintenance = true;
          try {
            if (status.changes.trim()) {
              await git(['add', '-A']);
              await git(['commit', '-m', String(body.commitMsg || 'Update portfolio from studio')]);
            }
            await git(['push', 'origin', status.branch]);
            return send(res, 200, { success: true, message: '已推送到 GitHub，网站更新取决于部署结果。' });
          } finally { maintenance = false; }
        }
        throw fail(404, '接口不存在');
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, '不支持此方法');
      if (pathname.split('/').some(part => part.startsWith('.')) || /\.(bak|tmp)$/.test(pathname)) throw fail(403, 'Forbidden');
      // Separate editable data from application assets for isolated integration tests.
      const base = pathname.startsWith('/data/') || pathname.startsWith('/images/') ? rootDir : assetRoot;
      const filename = path.resolve(base, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!filename.startsWith(path.resolve(base) + path.sep)) throw fail(403, 'Forbidden');
      let stat;
      try { stat = fs.statSync(filename); } catch { throw fail(404, '文件不存在'); }
      if (!stat.isFile()) throw fail(404, '文件不存在');
      const headers = { 'Content-Type': MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'Accept-Ranges': 'bytes' };
      let start = 0, end = stat.size - 1, status = 200;
      if (req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!range || (!range[1] && !range[2])) throw fail(416, '无效的媒体范围');
        start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
        end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
        if (start > end || start >= stat.size) throw fail(416, '媒体范围超出文件大小');
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
      }
      headers['Content-Length'] = Math.max(0, end - start + 1);
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !stat.size) return res.end();
      const stream = fs.createReadStream(filename, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) send(res, error.status || 500, { success: false, message: error.message });
      else res.destroy();
    }
  });
}

if (require.main === module) {
  let port = Number(process.env.PORT || 3000);
  const server = createServer();
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') { port++; server.listen(port, '127.0.0.1'); }
    else { console.error(error); process.exitCode = 1; }
  });
  server.on('listening', () => {
    const url = `http://127.0.0.1:${port}/admin.html`;
    console.log(`作品集管理后台：${url}\n前台预览：http://127.0.0.1:${port}/\n保存仅写入本地，发布需单独操作。`);
    if (!process.argv.includes('--no-open')) {
      const command = process.platform === 'win32' ? 'rundll32' : process.platform === 'darwin' ? 'open' : 'xdg-open';
      execFile(command, process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url] : [url], { windowsHide: true }, () => {});
    }
  });
  server.listen(port, '127.0.0.1');
}
module.exports = { createServer };
