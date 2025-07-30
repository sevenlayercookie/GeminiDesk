const { app, BrowserWindow, BrowserView, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function shouldShowOnboarding() {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return settings.onboardingShown !== true;
  } catch (e) {
    return true; // אם הקובץ לא קיים או פגום – נציג onboarding
  }
}

function markOnboardingAsShown() {
  fs.writeFileSync(settingsPath, JSON.stringify({ onboardingShown: true }));
}
let win;
let view;
function loadGemini() {
  win.loadFile('drag.html');

  view = new BrowserView({
    webPreferences: {
      partition: 'persist:gemini-session'
    }
  });

  win.setBrowserView(view);
  view.setBounds({ x: 0, y: 30, width: 500, height: 620 });
  view.setAutoResize({ width: true, height: true });
  view.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  view.webContents.loadURL('https://gemini.google.com/app');
}
function showGeminiView() {
  if (win && view) {
    win.loadFile('drag.html'); // טען מחדש את סרגל הגרירה
    win.setBrowserView(view); // החזר את התצוגה הקיימת של Gemini לחלון
    view.setBounds({ x: 0, y: 30, width: win.getBounds().width, height: win.getBounds().height - 30 }); // ודא שהגודל נכון
  }
}
function createWindow(showOnboarding) {
  win = new BrowserWindow({
    width: 500,
    height: 650,
    frame: false,
    alwaysOnTop: true,
    icon: path.join(__dirname, 'icon.ico'),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      partition: 'persist:gemini-session'
    }
  });

  if (showOnboarding) {
    win.loadFile('onboarding.html');
  } else {
    loadGemini();
  }
}



app.whenReady().then(() => {
  const showOnboarding = shouldShowOnboarding();
  createWindow(showOnboarding);
  globalShortcut.register('Control+Q', () => {
    if (win) win.destroy();
    app.quit();
  });
  globalShortcut.register('Control+G', () => {
    if (!win) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
globalShortcut.register('Control+I', () => {
  if (win && win.getBrowserView()) { // בדוק שיש מה להסיר
    win.removeBrowserView(win.getBrowserView()); // הסר את התצוגה מהחלון, אך שמור אותה בזיכרון
    win.loadFile('onboarding.html');
  }
});
});

const { ipcMain } = require('electron');

ipcMain.on('onboarding-complete', () => {
  markOnboardingAsShown();
  // במקום לבנות מחדש, נציג את התצוגה הקיימת
  if (!win.getBrowserView()) { // אם אנחנו חוזרים מדף ההוראות
    showGeminiView();
  } else { // אם זו הפעלה ראשונה
    loadGemini();
  }
});


app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});