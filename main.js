const { app, BrowserWindow, BrowserView, globalShortcut, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

// ================================================================= //
// הגדרות ומשתנים גלובליים
// ================================================================= //
// נתיב לקובץ ההגדרות ששומר אם המשתמש כבר ראה את ההוראות
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// משתנים שיחזיקו את החלון הראשי (win) ואת התצוגה של ג'מיני (view)
// הם מוגדרים כאן כדי שיהיו זמינים בכל הפונקציות בקובץ.
let win;
let view;

// ================================================================= //
// פונקציות עזר (Helper Functions)
// ================================================================= //

/**
 * פונקציה שבודקת האם יש להציג את דף ההוראות (onboarding).
 * היא קוראת את קובץ ההגדרות. אם הקובץ לא קיים או שהערך לא מסומן, תחזיר true.
 * @returns {boolean} - true אם צריך להציג את ההוראות, אחרת false.
 */
function shouldShowOnboarding() {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    return settings.onboardingShown !== true;
  } catch (e) {
    // אם הקובץ לא קיים או שיש שגיאה בקריאה שלו - נניח שצריך להציג את ההוראות.
    return true;
  }
}

/**
 * פונקציה שכותבת לקובץ ההגדרות שהמשתמש סיים את תהליך ההוראות.
 */
function markOnboardingAsShown() {
  fs.writeFileSync(settingsPath, JSON.stringify({ onboardingShown: true }), 'utf-8');
}


// ================================================================= //
// ניהול החלון והתצוגה הראשית
// ================================================================= //

/**
 * הפונקציה המרכזית שמנהלת את טעינת והצגת התצוגה של Gemini.
 * **הערה חשובה:** היא יוצרת את אובייקט ה-BrowserView (שמכיל את אתר ג'מיני)
 * רק בפעם הראשונה. בפעמים הבאות, היא משתמשת באובייקט הקיים כדי למנוע טעינה מחדש.
 */
function loadGemini() {
  // טוען את קובץ ה-HTML שמכיל רק את סרגל הגרירה העליון לחלון הראשי.
  win.loadFile('drag.html');

  // **החלק החכם**: בדוק אם התצוגה (view) כבר נוצרה.
  if (!view) {
    // אם לא, צור אותה בפעם הראשונה.
    console.log('Creating new BrowserView for Gemini.');
    view = new BrowserView({
      webPreferences: {
        // 'partition' מבטיח שהסשן (עוגיות, לוקל סטורג') יישמר בין הפעלות.
        partition: 'persist:gemini-session'
      }
    });

    // מונע ניווט לקבצים מקומיים מתוך האתר של ג'מיני (אבטחה).
    view.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('file://')) {
        event.preventDefault();
      }
    });

    // טען את האתר של ג'מיני לתוך התצוגה.
    view.webContents.loadURL('https://gemini.google.com/app');
  }

  // הצמד את התצוגה (הקיימת או החדשה) לחלון הראשי.
  win.setBrowserView(view);

  // קבע את הגודל והמיקום של התצוגה כך שתתאים לחלון, מתחת לסרגל הגרירה.
  const bounds = win.getBounds();
  view.setBounds({ x: 0, y: 30, width: bounds.width, height: bounds.height - 30 });
  view.setAutoResize({ width: true, height: true }); // מאפשר שינוי גודל אוטומטי עם החלון.
}

/**
 * פונקציה שיוצרת את החלון הראשי של האפליקציה.
 * @param {boolean} showOnboarding - קובע האם להציג את דף ההוראות או לטעון ישר את ג'מיני.
 */
function createWindow(showOnboarding) {
  win = new BrowserWindow({
    width: 500,
    height: 650,
    frame: false, // מסתיר את מסגרת ברירת המחדל של חלונות
    alwaysOnTop: true, // החלון תמיד יהיה מעל חלונות אחרים
    icon: path.join(__dirname, 'icon.ico'),
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      partition: 'persist:gemini-session'
    }
  });

  // החלטה מה לטעון בהתבסס על הפרמטר שהתקבל.
  if (showOnboarding) {
    win.loadFile('onboarding.html');
  } else {
    loadGemini();
  }
}

// ================================================================= //
// מחזור החיים של האפליקציה (App Lifecycle)
// ================================================================= //

// בלוק זה ירוץ רק לאחר ש-Electron סיים את האתחול שלו ומוכן ליצור חלונות.
app.whenReady().then(() => {
  // 1. צור את החלון הראשי.
  createWindow(shouldShowOnboarding());

  // 2. בדוק אם קיימים עדכונים לאפליקציה והודע למשתמש.
  autoUpdater.checkForUpdatesAndNotify();

  // 3. רשום את קיצורי המקשים הגלובליים.
  globalShortcut.register('Control+Q', () => {
    if (win) win.destroy();
    app.quit();
  });

  globalShortcut.register('Control+G', () => {
    if (!win) return;
    win.isVisible() ? win.hide() : win.show();
  });

  globalShortcut.register('Control+I', () => {
    // אם החלון קיים ויש לו תצוגה מוצמדת (כלומר, ג'מיני מוצג)
    if (win && win.getBrowserView()) {
      win.removeBrowserView(view); // הסר את התצוגה מהחלון (אך היא נשארת בזיכרון במשתנה 'view')
      win.loadFile('onboarding.html'); // טען את דף ההוראות
    }
  });
});

// ================================================================= //
// טיפול באירועים (Event Handlers)
// ================================================================= //

// האזנה לאירוע 'onboarding-complete' שנשלח מדף ההוראות.
ipcMain.on('onboarding-complete', () => {
  markOnboardingAsShown();
  // קרא לפונקציה שטוענת את ג'מיני. היא תשתמש בתצוגה הקיימת אם קיימת.
  loadGemini();
});

// אירועי עדכון אוטומטי
autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'A new version is available and will be downloaded in the background.',
    buttons: ['OK']
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded. It will be installed on the next restart.',
    buttons: ['Restart Now', 'Later']
  }).then(result => {
    if (result.response === 0) { // אם המשתמש לחץ על "Restart Now"
      autoUpdater.quitAndInstall();
    }
  });
});


// ניקוי לפני יציאה מהאפליקציה
app.on('will-quit', () => {
  // בטל את כל קיצורי הדרך הגלובליים
  globalShortcut.unregisterAll();
});

// סגירת האפליקציה כאשר כל החלונות נסגרים (התנהגות סטנדרטית)
app.on('window-all-closed', () => {
  app.quit();
});
