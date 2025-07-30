const { app, BrowserWindow, BrowserView, globalShortcut } = require('electron');
const path = require('path');

let win;
let view;

function createWindow() {
  win = new BrowserWindow({
    width: 500,
    height: 650,
    frame: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'icon.ico'), // ← כאן אתה מוסיף את האייקון
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      partition: 'persist:gemini-session' // התיקון כאן
    }
  });

  win.loadFile('drag.html');

  view = new BrowserView({
    webPreferences: {
      partition: 'persist:gemini-session'
    }
  });

  win.setBrowserView(view);
  view.setBounds({ x: 0, y: 30, width: 500, height: 620 });
  view.setAutoResize({ width: true, height: true });
  win.setAlwaysOnTop(true, 'screen-saver');
  view.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
    }
  });
  view.webContents.loadURL('https://gemini.google.com/app');
}

app.whenReady().then(() => {
  createWindow();
  // Ctrl + Q = quit the app completely
  globalShortcut.register('Control+Q', () => {
    if (win) win.destroy();
    app.quit();
  });

  // קיצור מקשים Ctrl + G
  globalShortcut.register('Control+G', () => {
    if (!win) return;

    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});