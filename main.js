const { app, BrowserWindow, BrowserView, globalShortcut, ipcMain, dialog, screen, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');
const AutoLaunch = require('auto-launch');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { clipboard, nativeImage } = require('electron');
let confirmWin = null;
let isQuitting = false;

const autoLauncher = new AutoLaunch({
    name: 'GeminiApp',
    path: app.getPath('exe'),
});

// ================================================================= //
// Settings Management
// ================================================================= //
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
let settingsWin = null;
const defaultSettings = {
  onboardingShown: false,
  autoStart: false,
  alwaysOnTop: true,
  shortcuts: {
    showHide: 'Alt+G',
    quit: 'Alt+Q',
    showInstructions: 'Alt+I',
    screenshot: 'Control+Alt+S',
    newChatPro: 'Alt+P',
    newChatFlash: 'Alt+F',
    newWindow: 'Alt+N',
    search: 'Alt+S'
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
  // Get the currently active window and view
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) return;
  const targetView = focusedWindow.getBrowserView();
  if (!targetView) return;

  if (!focusedWindow.isVisible()) focusedWindow.show();
  if (focusedWindow.isMinimized()) focusedWindow.restore();
  focusedWindow.focus();

  const modelIndex = modelType.toLowerCase() === 'flash' ? 0 : 1;

  const script = `
    (async function() {
      console.log('--- GeminiDesk: Starting script v7 ---');
      
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

      // Helper function to simulate a realistic user click
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
          modelSwitcher = await waitForElement('[data-test-id="bard-mode-menu-button"]');
        } catch (e) {
          // Attempt #2 (Fallback): If the direct method fails, click "New Chat" to reset the UI
          console.log('GeminiDesk: Attempt #1 failed. Falling back to plan B - clicking "New Chat".');
          const newChatButton = await waitForElement('[data-test-id="new-chat-button"] button', 5000);
          simulateClick(newChatButton);
          console.log('GeminiDesk: Clicked "New Chat", waiting for UI to stabilize...');
          await new Promise(resolve => setTimeout(resolve, 500)); // A longer wait after UI reset
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

  targetView.webContents.executeJavaScript(script).catch(console.error);
}

function triggerSearch() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (!focusedWindow) return;
  const targetView = focusedWindow.getBrowserView();
  if (!targetView) return;

  if (!focusedWindow.isVisible()) focusedWindow.show();
  if (focusedWindow.isMinimized()) focusedWindow.restore();
  focusedWindow.focus();

  const script = `
    (async function() {
      console.log('--- GeminiDesk: Triggering Search ---');

      // Helper function to wait for an element to be ready
      const waitForElement = (selector, timeout = 3000) => {
        console.log(\`Waiting for element: \${selector}\`);
        return new Promise((resolve, reject) => {
          let timeoutHandle = null;
          const interval = setInterval(() => {
            const element = document.querySelector(selector);
            if (element) {
              if (timeoutHandle) clearTimeout(timeoutHandle);
              clearInterval(interval);
              console.log(\`Found element: \${selector}\`);
              resolve(element);
            }
          }, 100);
          timeoutHandle = setTimeout(() => {
            clearInterval(interval);
            console.error(\`GeminiDesk Error: Timeout waiting for \${selector}\`);
            reject(new Error('Timeout for selector: ' + selector));
          }, timeout);
        });
      };
      
      // Helper function to simulate a realistic user click
      const simulateClick = (element) => {
        if (!element) {
            console.error('SimulateClick called on a null element.');
            return;
        }
        console.log('Simulating click on:', element);
        const events = ['mousedown', 'mouseup', 'click'];
        events.forEach(type => {
            const event = new MouseEvent(type, { bubbles: true, cancelable: true, view: window });
            element.dispatchEvent(event);
        });
      };

      try {
        // Step 1: Click the Main Menu button to open the sidebar
        const menuButton = document.querySelector('button[aria-label="Main menu"]');
        if (menuButton) {
            console.log('Step 1: Found and clicking main menu button.');
            simulateClick(menuButton);
            await new Promise(resolve => setTimeout(resolve, 300)); // Wait for sidebar animation
        } else {
            console.log('Step 1: Main menu button not found. Assuming sidebar is already open.');
        }

        // Step 2: Wait for the search bar to appear and click it
        const searchNavBarButton = await waitForElement('search-nav-bar button.search-nav-bar');
        console.log('Step 2: Found and clicking search navigation bar.');
        simulateClick(searchNavBarButton);
        await new Promise(resolve => setTimeout(resolve, 150)); // Wait for input field to render

        // Step 3: Wait for the actual text input field and focus it
        const searchInput = await waitForElement('input.search-input, input[placeholder="Search chats"]');
        console.log('Step 3: Found search input field.');
        searchInput.focus();
        
        console.log('--- GeminiDesk: SUCCESS! Search input focused. ---');

      } catch (error) {
        console.error('GeminiDesk Error during search sequence:', error.message);
      }
    })();
  `;

  targetView.webContents.executeJavaScript(script).catch(console.error);
}


function getSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const savedSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      return { ...defaultSettings, ...savedSettings, shortcuts: { ...defaultSettings.shortcuts, ...savedSettings.shortcuts } };
    }
  } catch (e) {
    console.error("Couldn't read settings, falling back to default.", e);
  }
  return defaultSettings;
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to save settings.", e);
  }
}

let settings = getSettings();

// ================================================================= //
// Global Settings and Variables
// ================================================================= //
const margin = 20;
const originalSize = { width: 500, height: 650 };
const canvasSize = { width: 1400, height: 800 };
const detachedViews = new Map();

// ================================================================= //
// Application Management Functions
// ================================================================= //

function setAutoLaunch(shouldEnable) {
    if (shouldEnable) {
        autoLauncher.enable();
    } else {
        autoLauncher.disable();
    }
}

function registerShortcuts() {
    // Unregister all shortcuts before registering new ones to avoid conflicts
    globalShortcut.unregisterAll();

    const shortcuts = settings.shortcuts;

let lastFocusedWindow = null;

if (shortcuts.showHide) {
    globalShortcut.register(shortcuts.showHide, () => {
        const allWindows = BrowserWindow.getAllWindows();
        if (allWindows.length === 0) return;

        // בדוק אם לפחות חלון אחד גלוי. אם כן, נסתיר את כולם.
        // אם כולם מוסתרים, נציג את כולם.
        const shouldShow = allWindows.some(win => !win.isVisible());

        if (!shouldShow) {
            // לפני הסתרה - שמור את החלון שנמצא כרגע בפוקוס
            lastFocusedWindow = allWindows.find(w => w.isFocused()) || allWindows[0];
        }

        allWindows.forEach(win => {
            if (shouldShow) {
                if (win.isMinimized()) win.restore();
                win.show();
            } else {
                win.hide();
            }
        });

        // לאחר שהצגנו את כל החלונות, נחזיר את הפוקוס לחלון האחרון שהיה פעיל
        if (shouldShow && lastFocusedWindow && !lastFocusedWindow.isDestroyed()) {
            setTimeout(() => {
                lastFocusedWindow.focus();
                const view = lastFocusedWindow.getBrowserView();
                if (view && view.webContents && !view.webContents.isDestroyed()) {
                    view.webContents.focus();
                }
            }, 150);
        }
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
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
                focusedWindow.close();
            }
        });
    }

    if (shortcuts.showInstructions) {
        globalShortcut.register(shortcuts.showInstructions, () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow && !focusedWindow.isDestroyed()) {
                const view = focusedWindow.getBrowserView();
                if (view) {
                    // Detach the view from the window and save it
                    focusedWindow.removeBrowserView(view);
                    detachedViews.set(focusedWindow, view); 
                }
                focusedWindow.loadFile('onboarding.html');
                setCanvasMode(false, focusedWindow); 
            }
        });
    }

if (shortcuts.screenshot) {
    let isScreenshotProcessActive = false;
    let screenshotTargetWindow = null;
    
    globalShortcut.register(shortcuts.screenshot, () => {
        if (isQuitting || isScreenshotProcessActive) {
            return;
        }
        isScreenshotProcessActive = true;
        
        // אם כל החלונות מוסתרים, קח את החלון האחרון שהיה פעיל
        let targetWin = BrowserWindow.getFocusedWindow();
        if (!targetWin) {
            // אם אין חלון בפוקוس, נסה את החלון האחרון שהיה פעיל (מהמשתנה של showHide)
            if (lastFocusedWindow && !lastFocusedWindow.isDestroyed()) {
                targetWin = lastFocusedWindow;
            } else {
                // אם גם זה לא עובד, קח את הראשון מהרשימה
                const allWindows = BrowserWindow.getAllWindows();
                targetWin = allWindows.length > 0 ? allWindows[0] : null;
            }
        }
        
        if (!targetWin) {
            isScreenshotProcessActive = false;
            return;
        }
        
        screenshotTargetWindow = targetWin;
        proceedWithScreenshot();
    });

    function proceedWithScreenshot() {
        clipboard.clear();
        const snippingTool = spawn('explorer', ['ms-screenclip:'], { detached: true, stdio: 'ignore' });
        snippingTool.unref();
        let processExited = false;
        snippingTool.on('exit', () => {
            processExited = true;
        });
        
        snippingTool.on('error', (err) => {
            console.error('Failed to start snipping tool:', err);
            isScreenshotProcessActive = false;
        });
        
        let checkAttempts = 0;
        const maxAttempts = 60;
        const intervalId = setInterval(() => {
            const image = clipboard.readImage();
            
            if (!image.isEmpty() && processExited) {
                clearInterval(intervalId);
                
                if (screenshotTargetWindow && !screenshotTargetWindow.isDestroyed()) {
                    // וודא שהחלון נראה ובפוקוס
                    if (!screenshotTargetWindow.isVisible()) screenshotTargetWindow.show();
                    if (screenshotTargetWindow.isMinimized()) screenshotTargetWindow.restore();
                    
                    // קבע זמנית alwaysOnTop כדי למנוע הסתרה
                    const originalAlwaysOnTop = screenshotTargetWindow.isAlwaysOnTop();
                    screenshotTargetWindow.setAlwaysOnTop(true);
                    screenshotTargetWindow.focus();
                    
                    const viewInstance = screenshotTargetWindow.getBrowserView();
                    if (viewInstance && viewInstance.webContents) {
                        setTimeout(() => {
                            viewInstance.webContents.focus();
                            viewInstance.webContents.paste();
                            console.log('Screenshot pasted!');
                            
                            // החזר את ההגדרה המקורית של alwaysOnTop
                            setTimeout(() => {
                                if (screenshotTargetWindow && !screenshotTargetWindow.isDestroyed()) {
                                    screenshotTargetWindow.setAlwaysOnTop(settings.alwaysOnTop);
                                }
                            }, 500);
                        }, 200);
                    }
                }
                isScreenshotProcessActive = false;
                screenshotTargetWindow = null;
            } else if (checkAttempts++ > maxAttempts) {
                clearInterval(intervalId);
                isScreenshotProcessActive = false;
                screenshotTargetWindow = null;
            }
        }, 500);
    }
}
// Add shortcut for search
    if (shortcuts.search) {
        globalShortcut.register(shortcuts.search, () => {
            triggerSearch();
        });
    }

    if (shortcuts.newWindow) {
        globalShortcut.register(shortcuts.newWindow, () => {
            createWindow();
        });
    }
}
function createWindow() {
  const newWin = new BrowserWindow({
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

  // Attach custom properties for canvas mode state
  newWin.isCanvasActive = false;
  newWin.prevBounds = null;

  newWin.on('blur', () => {
    if (settings.alwaysOnTop) newWin.setAlwaysOnTop(true);
  });
  
newWin.on('focus', () => {
    if (settings.alwaysOnTop) newWin.setAlwaysOnTop(true);

    // רק אם החלון באמת הוא החלון הפעיל, תן פוקוס ל-webContents
    setTimeout(() => {
        if (newWin && !newWin.isDestroyed() && newWin.isFocused()) {
            const view = newWin.getBrowserView();
            if (view && view.webContents && !view.webContents.isDestroyed()) {
                // בדוק שאף חלון אחר לא מנסה לקחת פוקוס באותו זמן
                view.webContents.focus();
            }
        }
    }, 100);
});

  newWin.on('closed', () => {
    detachedViews.delete(newWin);
  });

  if (!settings.onboardingShown) {
    newWin.loadFile('onboarding.html');
  } else {
    // Call the new version of the function with the specific window
    loadGemini(newWin);
  }
}
function loadGemini(targetWin) {
  if (!targetWin || targetWin.isDestroyed()) return;

  const view = targetWin.getBrowserView();
  if (view) {
    // If a view already exists, just load the URL
    view.webContents.loadURL('https://gemini.google.com/app');
    return;
  }

  targetWin.loadFile('drag.html');

  const newView = new BrowserView({
      webPreferences: {
        partition: 'persist:gemini-session',
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      }
    });

    newView.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://')) {
        event.preventDefault();
      }
    });

    newView.webContents.loadURL('https://gemini.google.com/app');
  targetWin.setBrowserView(newView);
  const bounds = targetWin.getBounds();
  newView.setBounds({ x: 0, y: 30, width: bounds.width, height: bounds.height - 30 });
  newView.setAutoResize({ width: true, height: true });
}
// ================================================================= //
// Animation and Resizing Functions (Unchanged from original)
// ================================================================= //

async function setCanvasMode(isCanvas, targetWin) {
  if (!targetWin || targetWin.isDestroyed() || isCanvas === targetWin.isCanvasActive) {
    return;
  }

  const activeView = targetWin.getBrowserView();
  targetWin.isCanvasActive = isCanvas;
  const currentBounds = targetWin.getBounds();
  if (targetWin.isMinimized()) targetWin.restore();

  let scrollY = 0;
  if (activeView) {
    try {
      scrollY = await activeView.webContents.executeJavaScript(`(document.scrollingElement || document.documentElement).scrollTop`);
    } catch (e) {
      console.error('Could not read scroll position:', e);
    }
  }

  if (isCanvas) {
    if (!activeView) {
      console.warn("Canvas mode requested, but no active view found. Aborting.");
      targetWin.isCanvasActive = false;
      return;
    }

    targetWin.prevBounds = { ...currentBounds };
    const display = screen.getDisplayMatching(currentBounds);
    const workArea = display.workArea;
    const targetWidth = Math.min(canvasSize.width, workArea.width - margin * 2);
    const targetHeight = Math.min(canvasSize.height, workArea.height - margin * 2);
    const newX = Math.max(workArea.x + margin, Math.min(currentBounds.x, workArea.x + workArea.width - targetWidth - margin));
    const newY = Math.max(workArea.y + margin, Math.min(currentBounds.y, workArea.y + workArea.height - targetHeight - margin));

    animateResize({ x: newX, y: newY, width: targetWidth, height: targetHeight }, targetWin, activeView);
  } else {
    if (targetWin.prevBounds) {
      animateResize(targetWin.prevBounds, targetWin, activeView);
      targetWin.prevBounds = null;
    } else {
      const newBounds = { ...originalSize, x: currentBounds.x, y: currentBounds.y };
      animateResize(newBounds, targetWin, activeView);
      // Center window only when returning to default size
      setTimeout(() => { if (targetWin && !targetWin.isDestroyed()) targetWin.center(); }, 210);
    }
  }

  if (activeView) {
    setTimeout(() => {
      if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
        activeView.webContents.executeJavaScript(`(document.scrollingElement || document.documentElement).scrollTop = ${scrollY};`).catch(console.error);
      }
    }, 300);
  }
}
function animateResize(targetBounds, activeWin, activeView, duration_ms = 200) {
  if (!activeWin || activeWin.isDestroyed()) return;

  const start = activeWin.getBounds();
  const steps = 20;
  const interval = duration_ms / steps;
  const delta = {
    x: (targetBounds.x - start.x) / steps,
    y: (targetBounds.y - start.y) / steps,
    width: (targetBounds.width - start.width) / steps,
    height: (targetBounds.height - start.height) / steps
  };
  let i = 0;

  function step() {
    i++;
    const b = {
      x: Math.round(start.x + delta.x * i),
      y: Math.round(start.y + delta.y * i),
      width: Math.round(start.width + delta.width * i),
      height: Math.round(start.height + delta.height * i)
    };
    if (activeWin && !activeWin.isDestroyed()) {
      activeWin.setBounds(b);
      if (activeView && activeView.webContents && !activeView.webContents.isDestroyed()) {
        activeView.setBounds({ x: 0, y: 30, width: b.width, height: b.height - 30 });
      }
      if (i < steps) setTimeout(step, interval);
    }
  }
  step();
}
// ================================================================= //
// Handling files from context menu and single instance lock
// ================================================================= //

let filePathToProcess = null;

// Handle file path argument if the app is opened with a file
if (process.argv.length >= 2 && !process.argv[0].includes('electron')) {
    const potentialPath = process.argv[1];
    if (fs.existsSync(potentialPath)) {
        filePathToProcess = potentialPath;
    }
}

// Single instance lock to prevent multiple app windows
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance.
        let targetWin = BrowserWindow.getAllWindows().pop() || null;

        if (targetWin) {
            if (targetWin.isMinimized()) targetWin.restore();
            targetWin.focus();

            // Check for a file path in the command line of the second instance
            const potentialPath = commandLine.find(arg => fs.existsSync(arg));
            if (potentialPath) {
                handleFileOpen(potentialPath);
            }
        }
    });
}

function handleFileOpen(filePath) {
    let targetWin = BrowserWindow.getFocusedWindow();

    if (!targetWin) {
        // If no window is focused, try to get the last created one.
        const allWindows = BrowserWindow.getAllWindows();
        if (allWindows.length > 0) {
            targetWin = allWindows[allWindows.length - 1];
        }
    }

    // If still no window, store for later.
    if (!targetWin) {
        filePathToProcess = filePath;
        return;
    }

    const targetView = targetWin.getBrowserView();
    if (!targetView) {
        // If the view isn't ready, store for later.
        filePathToProcess = filePath;
        return;
    }


    try {
        // Bring the window to the front and give it focus
        if (!targetWin.isVisible()) targetWin.show();
        if (targetWin.isMinimized()) targetWin.restore();
        targetWin.setAlwaysOnTop(true); // Temporarily bring to front to ensure it gets focus
        targetWin.focus();
        targetWin.moveTop();

        // Check file type to handle images and other files correctly
        const ext = path.extname(filePath).toLowerCase();
        if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'].includes(ext)) {
            const image = nativeImage.createFromPath(filePath);
            clipboard.writeImage(image);
        } else {
            // For other files (PDF, TXT, etc.), we put the file on the clipboard
            // This mimics the "Copy" action in the file explorer.
            // Note: This works reliably on Windows. macOS/Linux support can vary.
if (process.platform === 'win32') {
  // 1. בונים את מבנה ה-DROPFILES (20 בתים)  
  const dropFilesStruct = Buffer.alloc(20);
  // pFiles = 20 (היסט השורה הראשונה שבה מתחיל רשימת השמות)
  dropFilesStruct.writeUInt32LE(20, 0);
  // fWide = 1 (UTF-16)
  dropFilesStruct.writeUInt32LE(1, 16);

  // 2. כותבים את השם (Unicode, null-terminated)
  const utf16Path = filePath + '\0';
  const pathBuffer = Buffer.from(utf16Path, 'ucs2');
  
  // 3. מסיימים ב-double-null כדי לסמן סוף הרשימה
  const terminator = Buffer.from('\0\0', 'ucs2');

  // 4. מאחדים הכל ויוצקים ל-clipboard
  const dropBuffer = Buffer.concat([dropFilesStruct, pathBuffer, terminator]);
  clipboard.writeBuffer('CF_HDROP', dropBuffer);

} else {
  // macOS/Linux או כ fallback: רק טקסט
  clipboard.write({ text: filePath });
}

        }

        // Give the OS a moment to process the clipboard command
        setTimeout(() => {
            if (targetWin && !targetWin.isDestroyed() && targetView && targetView.webContents) {
                targetView.webContents.focus();
                targetView.webContents.paste();
                console.log('Pasting file from clipboard:', filePath);

                // Restore the original alwaysOnTop setting after a moment
                setTimeout(() => {
                    if (targetWin && !targetWin.isDestroyed()) {
                       targetWin.setAlwaysOnTop(settings.alwaysOnTop);
                    }
                }, 200);
            }
            filePathToProcess = null; // Clear the path after processing
        }, 300); // A slightly longer delay for file system operations

    } catch (error) {
        console.error('Failed to process file for pasting:', error);
        dialog.showErrorBox('File Error', 'Could not copy the selected file to the clipboard.');
        if (targetWin) { // Restore alwaysOnTop setting even on error
            targetWin.setAlwaysOnTop(settings.alwaysOnTop);
        }
    }
}
ipcMain.on('toggle-full-screen', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
        if (win.isMaximized()) {
            win.unmaximize();
            // החזר את מצב "תמיד למעלה" המקורי מההגדרות
            win.setAlwaysOnTop(settings.alwaysOnTop);
            win.focus(); // ודא שהחלון נשאר בפוקוס
        } else {
            // כבה זמנית את "תמיד למעלה" לפני ההגדלה
            win.setAlwaysOnTop(false);
            win.maximize();
            win.focus(); // ודא שהחלון נשאר בפוקוס
        }
    }
});
// ================================================================= //
// App Lifecycle
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
  
  // פתרון לבעיית צילום מסך של Windows שגורם לחלונות להעלם
  const preventWindowHiding = () => {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(win => {
      if (win && !win.isDestroyed() && win.isVisible()) {
        // שמור את המצב הנוכחי ומנע מהחלון להסתתר
        win.setAlwaysOnTop(true);
        setTimeout(() => {
          if (win && !win.isDestroyed()) {
            win.setAlwaysOnTop(settings.alwaysOnTop);
          }
        }, 3000); // שחזר אחרי 3 שניות
      }
    });
  };

  // האזן לאירועי מערכת שיכולים לגרום לחלונות להעלם
  app.on('browser-window-blur', () => {
    // בדוק אם זה בגלל Snipping Tool
    setTimeout(() => {
      const allWindows = BrowserWindow.getAllWindows();
      const visibleWindows = allWindows.filter(w => w && !w.isDestroyed() && w.isVisible());
      if (visibleWindows.length === 0) {
        // כל החלונות נעלמו - כנראה בגלל Snipping Tool
        preventWindowHiding();
      }
    }, 100);
  });

  registerShortcuts();
  if (settings.autoStart) setAutoLaunch(true);
autoUpdater.autoDownload = false;
scheduleDailyUpdateCheck();
// If the app was opened with a file, handle it now
    if (filePathToProcess) {
        const primaryWindow = BrowserWindow.getAllWindows()[0];
        if (primaryWindow) {
            const primaryView = primaryWindow.getBrowserView();
            if (primaryView) {
                // We need to wait until the Gemini page is fully loaded
                primaryView.webContents.once('did-finish-load', () => {
                    // A small extra delay to ensure all scripts on the page have run
                    setTimeout(() => {
                        handleFileOpen(filePathToProcess);
                    }, 1000);
                });
            }
        }
    }
});

app.on('will-quit', () => {
  isQuitting = true; // <-- Add this line
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdates();
});

// === Update process management with feedback to the settings window ===
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
  // Ask the user if they want to install now
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. Restart the application to apply the updates.',
    buttons: ['Restart Now', 'Later']
  }).then((buttonIndex) => {
    if (buttonIndex.response === 0) {
      autoUpdater.quitAndInstall();
    }
    // If the user chose "Later", the update will be installed automatically on the next quit
  });
});

autoUpdater.on('error', (err) => {
  sendUpdateStatus('error', { message: err.message });
});

// ================================================================= //
// IPC Event Handlers
// ================================================================= //
ipcMain.on('open-new-window', () => {
  createWindow();
});
ipcMain.on('onboarding-complete', (event) => {
  settings.onboardingShown = true;
  saveSettings(settings);
  
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  
  if (senderWindow && !senderWindow.isDestroyed()) {
    const existingView = detachedViews.get(senderWindow);
    
    if (existingView) {
      // Fix: Reload the top bar before restoring the view
      senderWindow.loadFile('drag.html').then(() => {
        // After the bar is loaded, restore the Gemini view
        senderWindow.setBrowserView(existingView);
        const bounds = senderWindow.getBounds();
        existingView.setBounds({ x: 0, y: 30, width: bounds.width, height: bounds.height - 30 });
        detachedViews.delete(senderWindow);
      }).catch(err => console.error('Failed to reload drag.html:', err));
    } else {
      // On first launch, load normally
      loadGemini(senderWindow);
    }
  }
});
ipcMain.on('canvas-state-changed', (event, isCanvasVisible) => {
    const senderWebContents = event.sender;

    for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;

        const view = window.getBrowserView();
        
        if ((view && view.webContents.id === senderWebContents.id) || 
            (window.webContents.id === senderWebContents.id)) {
            
            setCanvasMode(isCanvasVisible, window);
            return;
        }
    }
    console.warn(`Could not find a window associated with the 'canvas-state-changed' event.`);
});

ipcMain.on('update-title', (event, title) => {
    const senderWebContents = event.sender;
    const allWindows = BrowserWindow.getAllWindows();

    for (const window of allWindows) {
        const view = window.getBrowserView();
        if (view && view.webContents.id === senderWebContents.id) {
            if (!window.isDestroyed()) {
                window.webContents.send('update-title', title);
            }
            break; 
        }
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

// 2. Cancel the reset action
ipcMain.on('cancel-reset-action', () => {
  if (confirmWin) confirmWin.close();
});

// 3. Confirm and execute the reset
ipcMain.on('confirm-reset-action', () => {
  if (confirmWin) confirmWin.close();

  // The reset logic itself
  if (fs.existsSync(settingsPath)) fs.unlinkSync(settingsPath);
  settings = JSON.parse(JSON.stringify(defaultSettings));
  registerShortcuts();
  setAutoLaunch(settings.autoStart);
  BrowserWindow.getAllWindows().forEach(w => {
    if (!w.isDestroyed()) {
        w.setAlwaysOnTop(settings.alwaysOnTop);
        w.webContents.send('settings-updated', settings);
    }
  });
  console.log('All settings have been reset to default.');
});

ipcMain.handle('get-settings', async () => {
    return getSettings();
});

ipcMain.on('update-setting', (event, key, value) => {
    // **Fix:** We don't call getSettings() again.
    // We directly modify the global settings object that exists in memory.

    if (key.startsWith('shortcuts.')) {
        const subKey = key.split('.')[1];
        settings.shortcuts[subKey] = value; // Update the global object
    } else {
        settings[key] = value; // Update the global object
    }

    saveSettings(settings); // Save the updated global object

    // Apply settings immediately
    if (key === 'alwaysOnTop') {
        BrowserWindow.getAllWindows().forEach(w => {
            if (!w.isDestroyed()) {
                w.setAlwaysOnTop(value);
            }
        });
    }
    if (key === 'autoStart') {
        setAutoLaunch(value);
    }
    if (key.startsWith('shortcuts.')) {
        registerShortcuts(); // This function will now use the updated settings
    }
    
    // Send the entire updated settings object back to the window to sync
    BrowserWindow.getAllWindows().forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send('settings-updated', settings);
        }
    });
});

ipcMain.on('open-settings-window', (event) => { // Added the event word
  if (settingsWin) {
    settingsWin.focus();
    return;
  }

  // Identify the window from which the request was sent
  const parentWindow = BrowserWindow.fromWebContents(event.sender);

  settingsWin = new BrowserWindow({
    width: 450,
    height: 580,
    resizable: false,
    frame: false,
    parent: parentWindow, // Use the correct parent window
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
// Auto-update events
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