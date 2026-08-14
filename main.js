// DeepSeek Harness Desktop — 主进程
// 内嵌启动 dsh Web UI(内置 Node 运行时),独立窗口呈现 + 黑金主题
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT_START = 3080;
const PORT_TRIES = 10;

let mainWindow = null;
let dshProcess = null;
let serverPort = null;

// ---- 无头检查更新模式:--check-update ----
// 由计划任务每天 8:00 / 20:00 调用;发现新版则静默下载安装后退出
const HEADLESS_CHECK = process.argv.includes('--check-update');

// ---- 主题持久化(userData/themes.json,不受端口变化影响) ----
function themeFile() {
  return path.join(app.getPath('userData'), 'themes.json');
}
ipcMain.handle('theme:get', () => {
  try { return fs.readFileSync(themeFile(), 'utf8'); } catch { return null; }
});
ipcMain.handle('theme:set', (_e, value) => {
  try { fs.writeFileSync(themeFile(), String(value)); return true; } catch { return false; }
});

// ---- 单实例:再点快捷方式时聚焦已有窗口 ----
const gotLock = app.requestSingleInstanceLock();
console.log('[goldfish] gotLock:', gotLock, 'headless:', HEADLESS_CHECK);
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
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
  const child = spawn(nodeExe, ['--expose-internals', binJs, 'web', '--port', String(port)], {
    env: {
      ...process.env,
      DSH_HOME: path.join(app.getPath('userData'), 'dsh-home'),
    },
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('exit', (code) => {
    console.log('[goldfish] dsh exited', code);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('dsh-exited', code);
    }
  });
  return child;
}

function createWindow(page) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0b0f',
    title: '黑金小鲸鱼',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(appRoot(), 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(appRoot(), 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.on('did-finish-load', () => {
    // 仅在加载真实 UI(http://127.0.0.1)时注入主题与工具;splash 页跳过
    const url = mainWindow.webContents.getURL();
    if (!url.startsWith('http://127.0.0.1')) return;
    const css = path.join(appRoot(), 'theme', 'dark-gold.css');
    if (fs.existsSync(css)) {
      mainWindow.webContents.insertCSS(fs.readFileSync(css, 'utf8')).catch(() => {});
    }
    const panel = path.join(appRoot(), 'theme', 'panel.js');
    if (fs.existsSync(panel)) {
      mainWindow.webContents.executeJavaScript(fs.readFileSync(panel, 'utf8')).catch(() => {});
    }
    const token = path.join(appRoot(), 'theme', 'token.js');
    if (fs.existsSync(token)) {
      mainWindow.webContents.executeJavaScript(fs.readFileSync(token, 'utf8')).catch(() => {});
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (page.startsWith('http')) mainWindow.loadURL(page);
  else mainWindow.loadFile(page);
  mainWindow.on('closed', () => { mainWindow = null; });
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

  serverPort = await pickPort();
  if (serverPort === null) {
    dialog.showErrorBox('启动失败', '找不到可用端口(3080-3089 均被占用)');
    app.quit();
    return;
  }
  dshProcess = startDsh(serverPort);
  if (!dshProcess) { app.quit(); return; }

  const up = await waitUp(serverPort, 150);
  if (!up) {
    dialog.showErrorBox('启动失败', 'DeepSeek Harness 服务未能就绪,请重试');
    app.quit();
    return;
  }
  // 服务就绪 → 切换到真实 UI
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  }
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (dshProcess) {
    try { dshProcess.kill(); } catch {}
    dshProcess = null;
  }
});
