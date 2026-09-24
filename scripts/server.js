const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

let PORT = parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'portfolio-data.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.ico': 'image/x-icon'
};

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function openBrowser(url) {
  console.log(`[Browser] 正在尝试打开浏览器: ${url}`);
  if (process.platform === 'win32') {
    exec(`cmd.exe /c start "" "${url}"`, (err) => {
      if (err) {
        exec(`powershell -Command "Start-Process '${url}'"`, () => {});
      }
    });
  } else if (process.platform === 'darwin') {
    exec(`open "${url}"`, () => {});
  } else {
    exec(`xdg-open "${url}"`, () => {});
  }
}

const server = http.createServer((req, res) => {
  // 处理跨域预检
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // API 1: 保存配置
  if (req.method === 'POST' && pathname === '/api/save') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        if (!payload || !payload.items) {
          return sendJSON(res, 400, { success: false, message: '无效的配置数据' });
        }
        // 备份一次旧配置以防意外
        if (fs.existsSync(DATA_FILE)) {
          fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak');
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        console.log(`[${new Date().toLocaleTimeString()}] ✅ 配置已成功保存至本地 data/portfolio-data.json`);

        // 异步后台同步更新 media-previews.json，使前台海报与预览保持最新
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        exec(`${pythonCmd} scripts/build-previews.py`, { cwd: ROOT_DIR }, (err, stdout) => {
          if (!err) {
            console.log(`[Auto-Build] 已自动完成预览图与海报同步更新。`);
          }
        });

        return sendJSON(res, 200, {
          success: true,
          message: '保存成功！已自动写盘并同步更新前台海报预览。',
          savedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error('[Error] 保存失败:', err);
        return sendJSON(res, 500, { success: false, message: '保存出错: ' + err.message });
      }
    });
    return;
  }

  // API 2: 重新扫描本地 images 目录
  if (req.method === 'POST' && pathname === '/api/rescan') {
    try {
      delete require.cache[require.resolve('./scan-assets.js')];
      require('./scan-assets.js');
      return sendJSON(res, 200, { success: true, message: '全量素材已重新扫描并同步完成！' });
    } catch (err) {
      return sendJSON(res, 500, { success: false, message: '重新扫描失败: ' + err.message });
    }
  }

  // API 3: 生成/更新 WebP 缩略图与视频关键帧海报
  if (req.method === 'POST' && pathname === '/api/build-previews') {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    exec(`${pythonCmd} scripts/build-previews.py`, { cwd: ROOT_DIR }, (err, stdout, stderr) => {
      if (err) {
        console.error('[Error] 生成预览失败:', err, stderr);
        return sendJSON(res, 500, { success: false, message: '生成预览失败: ' + (stderr || err.message) });
      }
      console.log('[Build] 预览海报生成完成:\n', stdout);
      return sendJSON(res, 200, {
        success: true,
        message: 'WebP 预览图与视频海报已全部生成并同步！',
        details: stdout
      });
    });
    return;
  }

  // API 4: 一键发布到 GitHub 远程仓库 (免 Token)
  if (req.method === 'POST' && pathname === '/api/git-push') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let commitMsg = 'chore: update portfolio configuration from admin';
      try {
        if (body) {
          const payload = JSON.parse(body);
          if (payload.commitMsg) commitMsg = payload.commitMsg;
        }
      } catch (e) {}

      exec('git status --porcelain', { cwd: ROOT_DIR }, (statusErr, statusOut) => {
        const hasChanges = statusOut && statusOut.trim().length > 0;
        const pushCmd = hasChanges
          ? `git add -A && git commit -m "${commitMsg.replace(/"/g, '\\"')}" && git push origin main`
          : `git push origin main`;

        console.log(`[Git] 正在执行自动提交与推送: ${pushCmd}`);
        exec(pushCmd, { cwd: ROOT_DIR }, (err, stdout, stderr) => {
          if (err) {
            console.error('[Error] Git 推送失败:', err, stderr);
            return sendJSON(res, 500, {
              success: false,
              message: 'Git 推送失败: ' + (stderr || err.message),
              details: stdout + '\n' + stderr
            });
          }
          console.log('[Git] ✅ 推送成功:\n', stdout);
          return sendJSON(res, 200, {
            success: true,
            message: '🎉 成功发布到 GitHub！线上网站将在 1-2 分钟内自动部署生效。',
            siteUrl: 'https://zhangbling1.github.io',
            details: stdout
          });
        });
      });
    });
    return;
  }

  // API 3: 服务器状态
  if (req.method === 'GET' && pathname === '/api/status') {
    return sendJSON(res, 200, {
      status: 'running',
      mode: 'local-server',
      port: PORT,
      dataFileExists: fs.existsSync(DATA_FILE),
      time: new Date().toISOString()
    });
  }

  // 静态文件服务
  let filePath = path.join(ROOT_DIR, pathname === '/' ? 'index.html' : pathname);

  // 安全检查防止目录穿越
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

// 处理端口冲突自动递增
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[提示] 端口 ${PORT} 已被占用，自动尝试端口 ${PORT + 1}...`);
    PORT++;
    server.listen(PORT);
  } else {
    console.error('[错误] 服务启动异常:', err);
  }
});

server.listen(PORT, () => {
  const adminUrl = `http://localhost:${PORT}/admin.html`;
  const siteUrl = `http://localhost:${PORT}/index.html`;

  console.log(`\n======================================================`);
  console.log(`🚀 作品集本地服务已启动成功！`);
  console.log(`👉 管理后台地址: ${adminUrl}`);
  console.log(`👉 前台展出页面: ${siteUrl}`);
  console.log(`💡 提示: 在后台点击【保存配置】将直接保存至本地文件。`);
  console.log(`======================================================\n`);

  openBrowser(adminUrl);
});
