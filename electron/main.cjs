/**
 * Electron 主进程：加载 Vite 构建产物，提供本地桌面窗口。
 * 物理计算仍在渲染进程的 Web Worker 中，主进程不参与模拟。
 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('node:path');

const isDev = process.env.NODE_ENV === 'development';

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#04070e',
    title: 'N-Body Studio',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  const url = isDev
    ? 'http://localhost:5173/'
    : `file://${path.join(__dirname, '../dist/index.html').replace(/\\/g, '/')}`;
  win.loadURL(url);

  // 外部链接用系统浏览器打开
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http')) shell.openExternal(target);
    return { action: 'deny' };
  });

  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        { label: '重新加载', accelerator: 'CmdOrCtrl+R', click: () => win.reload() },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '全屏', accelerator: 'F11', click: () => win.setFullScreen(!win.isFullScreen()) },
        { label: '开发者工具', accelerator: 'F12', click: () => win.webContents.toggleDevTools() },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '项目主页',
          click: () => shell.openExternal('https://github.com/joe/nbody-studio'),
        },
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
