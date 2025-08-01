const { app, BrowserWindow, BrowserView, globalShortcut, ipcMain, dialog, screen, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const { clipboard, nativeImage } = require('electron');
let confirmWin = null;
let isQuitting = false;
// ================================================================= //
// ניהול הגדרות (Settings Management)
// ================================================================= //
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
let settingsWin = null;
// הגדרות ברירת מחדל
const defaultSettings = {
  onboardingShown: false,
  autoStart: true,
  alwaysOnTop: true,
  shortcuts: {
    showHide: 'Alt+G',
    quit: 'Alt+Q',
    showInstructions: 'Alt+I',
    screenshot: 'Control+Alt+S',
    newChatPro: 'Alt+P',
    newChatFlash: 'Alt+F'
  },
lastUpdateCheck: 0,
microphoneGranted: null,
  theme: 'dark'
};
function scheduleDailyUpdateCheck() {
  const checkForUpdates = () => {
    const now = new Date().getTime();
    const oneDay = 24 * 60 * 60 * 1000; // Milliseconds in a day

    // Check if more than a day has passed since the last check
    if (!settings.lastUpdateCheck || (now - settings.lastUpdateCheck > oneDay)) {
      console.log('Checking for updates...');
      autoUpdater.checkForUpdates();
      
      // Update the last check time and save it
      settings.lastUpdateCheck = now;
      saveSettings(settings);
    } else {
      console.log('Update check skipped, less than 24 hours since last check.');
    }
  };

  // Check immediately on startup
  checkForUpdates();
  
  // And then check again every 6 hours to see if a day has passed
  setInterval(checkForUpdates, 6 * 60 * 60 * 1000); 
}
function createNewChatWithModel(modelType) {
  if (!win || win.isDestroyed() || !view) return;

  if (!win.isVisible()) win.show();
  if (win.isMinimized()) win.restore();
  win.focus();

  // Determine the index based on the model type: 0 for Flash (first), 1 for Pro (second)
  const modelIndex = modelType.toLowerCase() === 'flash' ? 0 : 1;

  const script = `
    (async function() {
      console.log('--- GeminiDesk: Starting script v7 (with correct selector) ---');
      
      // Helper function to wait for an element to be ready (exists and is not disabled)
      const waitForElement = (selector, timeout = 3000) => {
        console.log(\`Waiting for an active element: \${selector}\`);
        return new Promise((resolve, reject) => {
          const timer = setInterval(() => {
            const element = document.querySelector(selector);
            if (element && !element.disabled) {
              clearInterval(timer);
              console.log(\`Found active element: \${selector}\`);
              resolve(element);
            }
          }, 100);
          setTimeout(() => {
            clearInterval(timer);
            console.warn('GeminiDesk Warn: Timeout. Could not find an active element for:', selector);
            reject(new Error('Element not found or disabled: ' + selector));
          }, timeout);
        });
      };

      // Helper function to simulate a more realistic user click
      const simulateClick = (element) => {
        console.log('Simulating a click on:', element);
        const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        element.dispatchEvent(mousedownEvent);
        element.dispatchEvent(mouseupEvent);
        element.dispatchEvent(clickEvent);
      };

      try {
        let modelSwitcher;
        try {
          // Attempt #1: Directly open the model menu (the fast method)
          console.log('GeminiDesk: Attempt #1 - Direct model menu opening.');
          // *** The critical fix is here ***
          modelSwitcher = await waitForElement('[data-test-id="bard-mode-menu-button"]');
        } catch (e) {
          // Attempt #2 (Fallback): If the direct method fails, click "New Chat" to reset the UI
          console.log('GeminiDesk: Attempt #1 failed. Falling back to plan B - clicking "New Chat".');
          const newChatButton = await waitForElement('[data-test-id="new-chat-button"] button', 5000);
          simulateClick(newChatButton);
          console.log('GeminiDesk: Clicked "New Chat", waiting for UI to stabilize...');
          await new Promise(resolve => setTimeout(resolve, 500)); // A longer wait after UI reset
          // *** The critical fix is here ***
          modelSwitcher = await waitForElement('[data-test-id="bard-mode-menu-button"]', 5000);
        }
        
        simulateClick(modelSwitcher);
        console.log('GeminiDesk: Clicked model switcher dropdown.');

        // Final step: Select the model from the list by its position
        const menuPanel = await waitForElement('mat-bottom-sheet-container, .mat-mdc-menu-panel', 5000);
        console.log('GeminiDesk: Found model panel. Selecting by index...');
        
        const modelIndexToSelect = ${modelIndex};
        console.log(\`Target index: \${modelIndexToSelect}\`);
        
        const items = menuPanel.querySelectorAll('button.mat-mdc-menu-item.bard-mode-list-button');
        console.log(\`Found \${items.length} models in the menu.\`);
        
        if (items.length > modelIndexToSelect) {
          const targetButton = items[modelIndexToSelect];
          console.log('Target button:', targetButton.textContent.trim());
          await new Promise(resolve => setTimeout(resolve, 150));
          simulateClick(targetButton);
          console.log('GeminiDesk: Success! Clicked model at index:', modelIndexToSelect);
        } else {
          console.error(\`GeminiDesk Error: Could not find a model at index \${modelIndexToSelect}\`);
          document.body.click(); // Attempt to close the menu
        }

      } catch (error) {
        console.error('GeminiDesk Error: The entire process failed.', error);
      }
      console.log('--- GeminiDesk: Script v7 finished ---');
    })();
  `;

  view.webContents.executeJavaScript(script).catch(console.error);
}
function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      // מיזוג עם הגדרות ברירת המחדל כדי להבטיח שכל המפתחות קיימים
      return { ...defaultSettings, ...savedSettings, shortcuts: { ...defaultSettings.shortcuts, ...savedSettings.shortcuts } };
    }
  } catch (e) {
    console.error("Couldn't read settings, falling back to default.", e);
  }
  return defaultSettings;
}

// פונקציה לשמירת ההגדרות
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to save settings.", e);
  }
}

let settings = getSettings();

// ================================================================= //
// הגדרות ומשתנים גלובליים
// ================================================================= //
let win;
let view;
let prevBounds = null;
const margin = 20;
const originalSize = { width: 500, height: 650 };
const canvasSize = { width: 1400, height: 800 };
let isCanvasActive = false;


// ================================================================= //
// פונקציות ניהול האפליקציה
// ================================================================= //

function setAutoLaunch(shouldEnable) {
  // הפונקציה רלוונטית רק לחלונות
  if (process.platform !== 'win32') {
    return;
  }

  const appName = 'GeminiApp';
  const appPath = `"${app.getPath('exe')}"`; // הנתיב עטוף במרכאות - זה התיקון!
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

  try {
    if (shouldEnable) {
      // הוספת המפתח לרישום עם הנתיב המלא במרכאות
      execSync(`REG ADD "${regKey}" /v "${appName}" /t REG_SZ /d ${appPath} /f`);
    } else {
      // מחיקת המפתח מהרישום
      execSync(`REG DELETE "${regKey}" /v "${appName}" /f`);
    }
  } catch (e) {
    console.error('Failed to update registry for auto-start:', e);
  }
}

function registerShortcuts() {
    // הסר רישום קודם כדי למנוע התנגשויות
    globalShortcut.unregisterAll();

    const shortcuts = settings.shortcuts;

    // הרשמה מחדש עם הקיצורים המעודכנים
    if (shortcuts.showHide) {
        globalShortcut.register(shortcuts.showHide, () => {
            if (!win) return;
            win.isVisible() ? win.hide() : win.show();
        });
    }
    if (shortcuts.newChatPro) {
        globalShortcut.register(shortcuts.newChatPro, () => createNewChatWithModel('Pro'));
    }

    if (shortcuts.newChatFlash) {
        globalShortcut.register(shortcuts.newChatFlash, () => createNewChatWithModel('Flash'));
    }
    if (shortcuts.quit) {
        globalShortcut.register(shortcuts.quit, () => {
            if (win) win.destroy();
            app.quit();
        });
    }

    if (shortcuts.showInstructions) {
        globalShortcut.register(shortcuts.showInstructions, () => {
            if (win && win.getBrowserView()) {
                win.removeBrowserView(view);
                win.loadFile('onboarding.html');
                setCanvasMode(false);
            } else if (win) {
                 win.loadFile('onboarding.html');
            }
        });
    }

if (shortcuts.screenshot) {
    let isScreenshotProcessActive = false;

    globalShortcut.register(shortcuts.screenshot, () => {
        if (isQuitting || isScreenshotProcessActive) {
            return;
        }
        isScreenshotProcessActive = true;

        if (!win || win.isDestroyed()) {
            createWindow();
            win.once('ready-to-show', () => {
                proceedWithScreenshot();
            });
        } else {
            proceedWithScreenshot();
        }
    });

    function proceedWithScreenshot() {
        clipboard.clear();

        // שמור את מצב הנראות הנוכחי של החלון
        const wasVisible = win.isVisible();
        
        const snippingTool = spawn('explorer', ['ms-screenclip:'], {
            detached: true,
            stdio: 'ignore'
        });
        snippingTool.unref();

        snippingTool.on('error', (err) => {
            console.error('Failed to start snipping tool:', err);
            isScreenshotProcessActive = false;
        });

        let checkAttempts = 0;
        const maxAttempts = 60;
        const intervalId = setInterval(() => {
            if (checkAttempts++ > maxAttempts || (!win || win.isDestroyed())) {
                clearInterval(intervalId);
                isScreenshotProcessActive = false;
                return;
            }
            
            const image = clipboard.readImage();
            if (!image.isEmpty()) {
                clearInterval(intervalId);

                if (win && !win.isDestroyed()) {
                    // הבא את החלון לחזית ותן לו פוקוס
                    if (!win.isVisible()) {
                        win.show(); 
                    }
                    if (win.isMinimized()) {
                        win.restore(); 
                    }
                    
                    // הבטח שהחלון יישאר בראש
                    win.setAlwaysOnTop(true);
                    win.focus();
                    win.moveTop(); // הוסף שורה זו - מבטיח שהחלון יהיה בחלק העליון של Z-order

                    // המתן קצת כדי להבטיח שהחלון באמת בפוקוס
                    setTimeout(() => {
                        if (win && !win.isDestroyed() && view && view.webContents) {
                            view.webContents.focus();
                            view.webContents.paste();
                            console.log('Screenshot pasted from clipboard!');
                            
                            // אם החלון היה מוסתר לפני הצילום ואנחנו לא ב-alwaysOnTop mode,
                            // החזר אותו למצב הקודם
                            if (!wasVisible && !settings.alwaysOnTop) {
                                // אבל רק לאחר זמן קצר כדי לתת למשתמש לראות שההדבקה הצליחה
                                setTimeout(() => {
                                    if (win && !win.isDestroyed()) {
                                        win.setAlwaysOnTop(settings.alwaysOnTop);
                                    }
                                }, 300);
                            } else {
                                // החזר את ההגדרה המקורית של alwaysOnTop
                                win.setAlwaysOnTop(settings.alwaysOnTop);
                            }
                        }
                        isScreenshotProcessActive = false;
                    }, 200);
                } else {
                    isScreenshotProcessActive = false;
                }
            }
        }, 500);
    }
}
}

function createWindow() {
  win = new BrowserWindow({
    width: originalSize.width,
    height: originalSize.height,
    frame: false,
    alwaysOnTop: settings.alwaysOnTop,
    icon: path.join(__dirname, 'icon.ico'),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      partition: 'persist:gemini-session'
    }
  });

  win.on('blur', () => {
    if(settings.alwaysOnTop) win.setAlwaysOnTop(true);
  });
  
  win.on('focus', () => {
    if(settings.alwaysOnTop) win.setAlwaysOnTop(true);
  });

  if (!settings.onboardingShown) {
    win.loadFile('onboarding.html');
  } else {
    loadGemini();
  }
}

function loadGemini() {
  if (!win) return;
  win.loadFile('drag.html');

  if (!view) {
view = new BrowserView({
      webPreferences: {
        partition: 'persist:gemini-session',
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        // ✅ הוסף את השורה הבאה
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });

    view.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://')) {
        event.preventDefault();
      }
    });

    view.webContents.loadURL('https://gemini.google.com/app');
    view.webContents.on('did-finish-load', () => {
        const checkerScript = `
            let isCanvasVisible = false;
            setInterval(() => {
                const canvasElement = document.querySelector('immersive-panel');
                const currentlyVisible = canvasElement !== null;
                if (currentlyVisible !== isCanvasVisible) {
                    isCanvasVisible = currentlyVisible;
                    window.electronAPI.notifyCanvasState(isCanvasVisible);
                }
            }, 1000);
        `;
        view.webContents.executeJavaScript(checkerScript).catch(console.error);
    });
  }

  win.setBrowserView(view);
  const bounds = win.getBounds();
  view.setBounds({ x: 0, y: 30, width: bounds.width, height: bounds.height - 30 });
  view.setAutoResize({ width: true, height: true });
}

// ================================================================= //
// פונקציות אנימציה ושינוי גודל (ללא שינוי מהמקור)
// ================================================================= //

async function setCanvasMode(isCanvas) {
  if (!win || isCanvas === isCanvasActive) return;
  isCanvasActive = isCanvas;
  const currentBounds = win.getBounds();
  if (win.isMinimized()) win.restore();

  let scrollY = 0;
  try {
    scrollY = await view.webContents.executeJavaScript(`(document.scrollingElement || document.documentElement).scrollTop`);
  } catch (e) { console.error('Could not read scroll position:', e); }

  if (isCanvas) {
    prevBounds = { ...currentBounds };
    const display  = screen.getDisplayMatching(currentBounds);
    const workArea = display.workArea;
    const targetWidth  = Math.min(canvasSize.width,  workArea.width - margin * 2);
    const targetHeight = Math.min(canvasSize.height, workArea.height - margin * 2);
    const newX = Math.max(workArea.x + margin, Math.min(currentBounds.x, workArea.x + workArea.width  - targetWidth  - margin));
    const newY = Math.max(workArea.y + margin, Math.min(currentBounds.y, workArea.y + workArea.height - targetHeight - margin));
    animateResize({ x: newX, y: newY, width: targetWidth, height: targetHeight });
  } else {
    if (prevBounds) {
      animateResize(prevBounds);
      prevBounds = null;
    } else {
      animateResize({ ...originalSize, x: currentBounds.x, y: currentBounds.y });
      win.center();
    }
  }
  setTimeout(() => {
    view.webContents.executeJavaScript(`(document.scrollingElement || document.documentElement).scrollTop = ${scrollY};`).catch(console.error);
  }, 300);
}

function animateResize(targetBounds, duration_ms = 200) {
  const start = win.getBounds();
  const steps = 20;
  const interval = duration_ms / steps;
  const delta = {
    x: (targetBounds.x - start.x) / steps, y: (targetBounds.y - start.y) / steps,
    width: (targetBounds.width - start.width) / steps, height: (targetBounds.height - start.height) / steps
  };
  let i = 0;
  function step() {
    i++;
    const b = {
      x: Math.round(start.x + delta.x * i), y: Math.round(start.y + delta.y * i),
      width: Math.round(start.width + delta.width * i), height: Math.round(start.height + delta.height * i)
    };
    win.setBounds(b);
    if (view) view.setBounds({ x:0, y:30, width:b.width, height:b.height-30 });
    if (i < steps) setTimeout(step, interval);
  }
  step();
}

// ================================================================= //
// מחזור החיים של האפליקציה (App Lifecycle)
// ================================================================= //

app.whenReady().then(() => {
  createWindow();
const ses = session.defaultSession;
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    // We will check for the 'media' permission which includes the microphone.
    if (permission === 'media') {
      // Automatically grant the permission every time without asking the user.
      // This is simpler and more reliable for fixing intermittent issues.
      callback(true);
    } else {
      // For any other permission request, deny it for security.
      callback(false);
    }
  });
  registerShortcuts();
  if (settings.autoStart) setAutoLaunch(true);
autoUpdater.autoDownload = false;
scheduleDailyUpdateCheck();
});

app.on('will-quit', () => {
  isQuitting = true; // <-- הוסף את השורה הזו
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});

// === ניהול תהליך העדכון עם פידבק לחלון ההגדרות ===
const sendUpdateStatus = (status, data = {}) => {
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(win => {
    if (!win.isDestroyed()) {
      win.webContents.send('update-status', { status, ...data });
    }
  });
};

autoUpdater.on('checking-for-update', () => {
  sendUpdateStatus('checking');
});

autoUpdater.on('update-not-available', (info) => {
  sendUpdateStatus('up-to-date');
});

autoUpdater.on('update-available', (info) => {
  sendUpdateStatus('available');
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: `A new version (${info.version}) is available. Would you like to open the download page?`,
    buttons: ['Yes, open page', 'Later']
  }).then((buttonIndex) => {
    if (buttonIndex.response === 0) {
      // This will open the latest release page on GitHub in the user's default browser.
      const repoUrl = `https://github.com/hillelkingqt/GeminiDesk/releases/latest`;
      shell.openExternal(repoUrl);
    }
  });
});

autoUpdater.on('download-progress', (progressObj) => {
  sendUpdateStatus('downloading', { percent: Math.round(progressObj.percent) });
});

autoUpdater.on('update-downloaded', (info) => {
  sendUpdateStatus('downloaded');
  // שאל את המשתמש אם להתקין עכשיו
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart the application to apply the updates.',
    buttons: ['Restart Now', 'Later']
  }).then((buttonIndex) => {
    if (buttonIndex.response === 0) {
      autoUpdater.quitAndInstall();
    }
    // אם המשתמש בחר "Later", העדכון יותקן אוטומטית ביציאה הבאה
  });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { message: err.message });
});

// ================================================================= //
// טיפול באירועים (IPC Event Handlers)
// ================================================================= //

ipcMain.on('onboarding-complete', () => {
  settings.onboardingShown = true;
  saveSettings(settings);
  loadGemini();
});

ipcMain.on('canvas-state-changed', (event, isCanvasVisible) => {
    setCanvasMode(isCanvasVisible);
});

ipcMain.on('update-title', (event, title) => {
    if (win && !win.isDestroyed()) {
        win.webContents.send('update-title', title);
    }
});

ipcMain.on('show-confirm-reset', () => {
  if (confirmWin) return;
  confirmWin = new BrowserWindow({
    width: 340, height: 180, resizable: false, frame: false,
    parent: settingsWin, modal: true, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    }
  });
  confirmWin.loadFile('confirm-reset.html');
  confirmWin.once('ready-to-show', () => confirmWin.show());
  confirmWin.on('closed', () => confirmWin = null);
});

// 2. ביטול פעולת האיפוס
ipcMain.on('cancel-reset-action', () => {
  if (confirmWin) confirmWin.close();
});

// 3. אישור וביצוע האיפוס
ipcMain.on('confirm-reset-action', () => {
  if (confirmWin) confirmWin.close();

  // הלוגיקה של האיפוס עצמו
  if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
  settings = JSON.parse(JSON.stringify(defaultSettings));
  registerShortcuts();
  if (win) win.setAlwaysOnTop(settings.alwaysOnTop);
  setAutoLaunch(settings.autoStart);
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) w.webContents.send('settings-updated', settings);
  });
  console.log('All settings have been reset to default.');
});

ipcMain.handle('get-settings', async () => {
    return getSettings();
});

ipcMain.on('update-setting', (event, key, value) => {
    // **התיקון:** לא קוראים ל-getSettings() מחדש.
    // אנחנו משנים ישירות את אובייקט ההגדרות הגלובלי שקיים בזיכרון.

    if (key.startsWith('shortcuts.')) {
        const subKey = key.split('.')[1];
        settings.shortcuts[subKey] = value; // עדכון האובייקט הגלובלי
    } else {
        settings[key] = value; // עדכון האובייקט הגלובלי
    }

    saveSettings(settings); // שמירת האובייקט הגלובלי המעודכן

    // החל הגדרות באופן מיידי
    if (key === 'alwaysOnTop' && win) {
        win.setAlwaysOnTop(value);
    }
    if (key === 'autoStart') {
        setAutoLaunch(value);
    }
    if (key.startsWith('shortcuts.')) {
        registerShortcuts(); // הפונקציה הזו תשתמש עכשיו בהגדרות המעודכנות
    }
    
    // שלח את כל אובייקט ההגדרות המעודכן בחזרה לחלון כדי שיסתנכרן
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send('settings-updated', settings);
        }
    });
});

// פתיחת חלון הגדרות נפרד
ipcMain.on('open-settings-window', () => {
  if (settingsWin) {
    settingsWin.focus();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 450,
    height: 580,
    resizable: false,
    frame: false,
    parent: win, // קושר את החלון לחלון הראשי
    modal: true, // מונע אינטראקציה עם החלון הראשי עד סגירת ההגדרות
    show: false, // מנע הבהוב, הצג רק כשהוא מוכן
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // חשוב מאוד!
      contextIsolation: true,
    }
  });

  settingsWin.loadFile('settings.html');

  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
  });

  settingsWin.on('closed', () => {
    settingsWin = null;
  });
});

// אירועי עדכון אוטומטי
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({ 
    type: 'info', 
    title: 'Update Available', 
    message: 'A new version is available and will be downloaded.', 
    buttons: ['OK'] 
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info', 
    title: 'Update Ready', 
    message: 'Install the new version now?',
    buttons: ['Restart Now', 'Later']
  }).then(result => { 
    if (result.response === 0) autoUpdater.quitAndInstall(); 
  });
});