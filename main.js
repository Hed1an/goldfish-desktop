// DeepSeek Harness Desktop — 主进程
// 内嵌启动 dsh Web UI(内置 Node 运行时),独立窗口呈现 + 黑金主题
const { app, BrowserWindow, dialog, Tray, Menu, nativeImage } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT_START = 3081;
const PORT_TRIES = 10;

let mainWindow = null;
let dshProcess = null;
let dshExited = false;
let tray = null;
let isQuitting = false;

// ---- 无头检查更新模式:--check-update ----
// 由计划任务每天 8:00 / 20:00 调用;发现新版则静默下载安装后退出
const HEADLESS_CHECK = process.argv.includes('--check-update');
// ---- 开机静默启动:--hidden(托盘运行,不弹窗,等待用户点击) ----
const HIDDEN_START = process.argv.includes('--hidden');

// ---- 单实例:再点快捷方式时聚焦已有窗口 ----
const gotLock = app.requestSingleInstanceLock();
console.log('[goldfish] gotLock:', gotLock, 'headless:', HEADLESS_CHECK);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showMainWindow();
  });
}

function appRoot() {
  // 打包后 resources/app/ 下是全量文件(asar 关闭);开发模式就是项目根
  return app.isPackaged ? path.join(process.resourcesPath, 'app') : __dirname;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = http.createServer();
    s.once('error', () => resolve(false));
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function pickPort() {
  for (let i = 0; i < PORT_TRIES; i++) {
    if (await portFree(PORT_START + i)) return PORT_START + i;
  }
  return null;
}

function waitUp(port, tries) {
  return new Promise((resolve) => {
    let n = 0;
    const t = setInterval(() => {
      // dsh 子进程崩溃 → 立即判定失败,不空等超时
      if (dshExited) { clearInterval(t); resolve(false); return; }
      const req = http.get(`http://127.0.0.1:${port}/`, (r) => { clearInterval(t); resolve(true); r.resume(); });
      req.on('error', () => { if (++n >= tries) { clearInterval(t); resolve(false); } });
    }, 800);
  });
}

function startDsh(port) {
  const root = appRoot();
  const binJs = path.join(root, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
  const nodeExe = path.join(root, 'node-runtime', 'node.exe');
  if (!fs.existsSync(binJs)) {
    dialog.showErrorBox('启动失败', `未找到 dsh 组件:\n${binJs}`);
    return null;
  }
  if (!fs.existsSync(nodeExe)) {
    dialog.showErrorBox('启动失败', `未找到内置 Node 运行时:\n${nodeExe}`);
    return null;
  }
  dshExited = false;
  // dsh 错误输出写入日志文件,便于诊断(不再静默丢弃)
  let logFd = null;
  try { logFd = fs.openSync(path.join(app.getPath('userData'), 'dsh-error.log'), 'a'); } catch {}
  const child = spawn(nodeExe, ['--expose-internals', binJs, 'web', '--port', String(port)], {
    env: {
      ...process.env,
      DSH_HOME: path.join(app.getPath('userData'), 'dsh-home'),
    },
    stdio: ['ignore', logFd ?? 'ignore', logFd ?? 'ignore'],
    windowsHide: true,
  });
  child.on('exit', (code) => {
    dshExited = true;
    console.log('[goldfish] dsh exited', code);
    if (logFd) { try { fs.closeSync(logFd); } catch {} }
  });
  return child;
}

// 启动 dsh 服务并等待就绪;崩溃/超时自动重试,最多 3 次
// 启动前先 reconcile bundles:把 dependencies 里有 bundle patch 的插件自动注册进 bundles
// (插件市场下载插件后,重启应用即可自动生效,无需手动编辑配置)
function reconcileBundles() {
  try {
    const profileDir = path.join(app.getPath('userData'), 'dsh-home', 'profiles', 'web');
    const pkgPath = path.join(profileDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const bundles = new Set(pkg.dsh?.profile?.bundles ?? []);
    const added = [];
    for (const name of Object.keys(pkg.dependencies ?? {})) {
      if (!bundles.has(name) && fs.existsSync(path.join(profileDir, 'node_modules', name, 'cordis.patch.yml'))) {
        bundles.add(name);
        added.push(name);
      }
    }
    if (added.length > 0) {
      pkg.dsh = pkg.dsh ?? {};
      pkg.dsh.profile = pkg.dsh.profile ?? {};
      pkg.dsh.profile.bundles = [...bundles];
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log('[goldfish] 自动注册插件到 bundles:', added.join(', '));
    }
  } catch (e) {
    console.log('[goldfish] reconcileBundles error:', e.message);
  }
}

// 自动放行插件构建脚本:pnpm-workspace.yaml 里 allowBuilds 的占位符改成 true
// (否则 pnpm 默认拦截构建脚本,导致依赖 native 模块的插件不完整、无法运行)
function allowBuildScripts() {
  try {
    const yamlPath = path.join(app.getPath('userData'), 'dsh-home', 'profiles', 'web', 'pnpm-workspace.yaml');
    if (!fs.existsSync(yamlPath)) return;
    const s = fs.readFileSync(yamlPath, 'utf8');
    if (s.includes('set this to true or false')) {
      fs.writeFileSync(yamlPath, s.replace(/set this to true or false/g, 'true'));
      console.log('[goldfish] 已自动放行所有插件构建脚本');
    }
  } catch (e) {}
}

// 本地 LLM 服务(Ollama + Control Plane)自动启动 —— 让桌面版具备本地省 token 能力
let ollamaProcess = null;
let localLlmProcess = null;

function isOllamaRunning() {
  return new Promise((resolve) => {
    try {
      const req = http.get('http://127.0.0.1:11434/api/tags', (r) => { r.resume(); resolve(r.statusCode === 200); });
      req.on('error', () => resolve(false));
      req.setTimeout(1500, () => { try { req.destroy(); } catch {} resolve(false); });
    } catch { resolve(false); }
  });
}

async function startLocalLLM() {
  try {
    // 1) Ollama 本地模型服务(未运行则启动)
    if (!(await isOllamaRunning())) {
      const ollamaPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Ollama', 'ollama.exe');
      if (fs.existsSync(ollamaPath)) {
        console.log('[goldfish] 启动本地 Ollama...');
        ollamaProcess = spawn(ollamaPath, ['serve'], { stdio: 'ignore', windowsHide: true });
        for (let i = 0; i < 20; i++) {
          await new Promise((r) => setTimeout(r, 1000));
          if (await isOllamaRunning()) break;
        }
      }
    }
    // 2) Control Plane 本地 LLM 中介(127.0.0.1:8765)
    const cpNode = path.join(appRoot(), 'node-runtime', 'node.exe');
    const cpFile = path.join(appRoot(), 'control-plane.mjs');
    if (fs.existsSync(cpNode) && fs.existsSync(cpFile)) {
      console.log('[goldfish] 启动 Control Plane(本地 LLM 8765)...');
      localLlmProcess = spawn(cpNode, [cpFile], { stdio: 'ignore', windowsHide: true });
    }
  } catch (e) {
    console.log('[goldfish] localLLM start error:', e.message);
  }
}

async function startServer() {
  reconcileBundles();
  allowBuildScripts();
  for (let attempt = 1; attempt <= 3; attempt++) {
    const port = await pickPort();
    if (port === null) {
      dialog.showErrorBox('启动失败', '找不到可用端口(3081-3090 均被占用)');
      return null;
    }
    dshProcess = startDsh(port);
    if (!dshProcess) return null;
    const up = await waitUp(port, 300);
    if (up) return port;
    console.log(`[goldfish] 启动尝试 ${attempt} 失败,清理后重试...`);
    if (dshProcess) { try { dshProcess.kill(); } catch {} dshProcess = null; }
    await new Promise((r) => setTimeout(r, 1200));
  }
  return null;
}

// 插件变更自动检测:装/卸插件后自动 reconcile + 重启 dsh(免手动重启应用)
async function restartDsh() {
  console.log('[goldfish] 检测到插件变更,重启 dsh 以加载...');
  if (dshProcess) { try { dshProcess.kill(); } catch {} dshProcess = null; }
  const port = await startServer();
  if (port !== null && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`http://127.0.0.1:${port}`);
  }
}

function watchProfileChanges() {
  let lastDepsKey = null;
  setInterval(async () => {
    try {
      const pkgPath = path.join(app.getPath('userData'), 'dsh-home', 'profiles', 'web', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const depsKey = Object.keys(pkg.dependencies || {}).sort().join(',');
      if (lastDepsKey !== null && depsKey !== lastDepsKey) {
        const b1 = JSON.stringify(pkg.dsh?.profile?.bundles || []);
        reconcileBundles();
        const p2 = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (b1 !== JSON.stringify(p2.dsh?.profile?.bundles || [])) await restartDsh();
      }
      lastDepsKey = depsKey;
    } catch (e) {}
  }, 6000);
}

function createWindow(page) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0b0f',
    title: 'DeepSeek Harness Desktop',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(appRoot(), 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    // 开机静默(--hidden)不自动弹窗,等用户点托盘/图标;否则立即显示
    if (!HIDDEN_START) mainWindow.show();
  });

  mainWindow.webContents.on('did-finish-load', () => {
    // 仅在加载真实 UI(http://127.0.0.1)时注入样式;splash 页跳过
    const url = mainWindow.webContents.getURL();
    if (!url.startsWith('http://127.0.0.1')) return;
    const css = path.join(appRoot(), 'theme', 'dark-gold.css');
    if (fs.existsSync(css)) {
      mainWindow.webContents.insertCSS(fs.readFileSync(css, 'utf8')).catch(() => {});
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (page.startsWith('http')) mainWindow.loadURL(page);
  else mainWindow.loadFile(page);
  // 关闭窗口 → 隐藏到托盘(驻留常驻,dsh 服务保持运行,再点秒开)
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
}

function createTray() {
  try {
    const icon = nativeImage.createFromPath(path.join(appRoot(), 'assets', 'icon.png'));
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    tray.setToolTip('DeepSeek Harness Desktop');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '打开 DeepSeek Harness Desktop', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '退出', click: () => { isQuitting = true; app.quit(); } },
    ]));
    tray.on('click', () => showMainWindow());
  } catch (e) {
    console.log('[goldfish] tray init failed:', e.message);
  }
}

app.whenReady().then(async () => {
  // ---- 自动更新(electron-updater,仅打包版) ----
  if (app.isPackaged) {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => console.log('[goldfish] checking for update...'));
    autoUpdater.on('update-available', (info) => console.log('[goldfish] update available:', info.version));
    autoUpdater.on('update-not-available', () => {
      console.log('[goldfish] already latest');
      if (HEADLESS_CHECK) app.exit(0);
    });
    autoUpdater.on('download-progress', (p) => {
      if (HEADLESS_CHECK || (p.percent % 25 < 1)) console.log(`[goldfish] download ${Math.round(p.percent)}%`);
    });
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[goldfish] update downloaded:', info.version);
      if (HEADLESS_CHECK) {
        // 计划任务模式:静默安装后退出
        setImmediate(() => autoUpdater.quitAndInstall(false, true));
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info',
          title: '发现新版本',
          message: `新版本 ${info.version} 已下载完成`,
          detail: '点击"重启更新"立即安装,或下次退出应用时自动安装。',
          buttons: ['重启更新', '稍后'],
          defaultId: 0,
        }).then((r) => {
          if (r.response === 0) autoUpdater.quitAndInstall(false, true);
        }).catch(() => {});
      }
    });
    autoUpdater.on('error', (err) => {
      console.log('[goldfish] updater error:', err.message);
      if (HEADLESS_CHECK) app.exit(1);
    });

    const checkNow = () => {
      try { autoUpdater.checkForUpdates().catch((e) => console.log('[goldfish] check failed:', e.message)); }
      catch (e) { console.log('[goldfish] check failed:', e.message); }
    };

    if (HEADLESS_CHECK) {
      // 无头模式:检查 → 下载 → 静默安装;总超时 15 分钟兜底
      setTimeout(checkNow, 3000);
      setTimeout(() => app.exit(0), 15 * 60 * 1000);
      return;
    }

    // 常规模式:启动 30 秒后检查一次 + 每天 8:00 / 20:00 准点检查
    setTimeout(checkNow, 30 * 1000);
    setInterval(() => {
      const h = new Date().getHours();
      if (h === 8 || h === 20) checkNow();
    }, 60 * 1000);
  }

  // ---- 立即显示 splash 加载窗口(1 秒内反馈) ----
  createWindow(path.join(appRoot(), 'splash.html'));
  createTray();

  // ---- 开机自启(注册 Run 键,--hidden 托盘静默运行)→ 开机后点击即秒开 ----
  if (app.isPackaged && !HEADLESS_CHECK) {
    try {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    } catch (e) { console.log('[goldfish] autostart register failed:', e.message); }
  }

  // 启动本地 LLM 服务(Ollama + Control Plane),让 dsh 的本地省 token 工具可用
  await startLocalLLM();

  const serverPort = await startServer();
  if (serverPort === null) {
    dialog.showErrorBox('启动失败', 'DeepSeek Harness 服务未能就绪,请重试');
    app.quit();
    return;
  }
  // 服务就绪 → 切换到真实 UI
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  }

  // 开始监听插件变更(装/卸插件自动 reconcile + 重启 dsh,免手动重启应用)
  watchProfileChanges();
});

app.on('window-all-closed', () => {
  // 驻留托盘:窗口全关不退出,dsh 服务保持运行(点击秒开)
});
app.on('before-quit', () => {
  if (localLlmProcess) { try { localLlmProcess.kill(); } catch {} localLlmProcess = null; }
  if (ollamaProcess) { try { ollamaProcess.kill(); } catch {} ollamaProcess = null; }
  if (dshProcess) {
    try { dshProcess.kill(); } catch {}
    dshProcess = null;
  }
});
