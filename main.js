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

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0b0b0f',
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    icon: path.join(appRoot(), 'assets', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(appRoot(), 'preload.js'),
    },
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const css = path.join(appRoot(), 'theme', 'dark-gold.css');
    if (fs.existsSync(css)) {
      mainWindow.webContents.insertCSS(fs.readFileSync(css, 'utf8')).catch(() => {});
    }
    const panel = path.join(appRoot(), 'theme', 'panel.js');
    if (fs.existsSync(panel)) {
      mainWindow.webContents.executeJavaScript(fs.readFileSync(panel, 'utf8')).catch(() => {});
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  serverPort = await pickPort();
  if (serverPort === null) {
    dialog.showErrorBox('启动失败', '找不到可用端口(3080-3089 均被占用)');
    app.quit();
    return;
  }
  dshProcess = startDsh(serverPort);
  if (!dshProcess) { app.quit(); return; }

  const up = await waitUp(serverPort, 90);
  if (!up) {
    dialog.showErrorBox('启动失败', 'DeepSeek Harness 服务未能就绪,请重试');
    app.quit();
    return;
  }
  createWindow(`http://127.0.0.1:${serverPort}`);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (dshProcess) {
    try { dshProcess.kill(); } catch {}
    dshProcess = null;
  }
});
