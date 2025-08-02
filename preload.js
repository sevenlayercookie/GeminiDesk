// בקובץ preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // קריאות מ-Renderer ל-Main
  completeOnboarding: () => ipcRenderer.send('onboarding-complete'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.send('update-setting', key, value),
  openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
   openNewWindow:     () => ipcRenderer.send('open-new-window'),
  resetSettings: () => ipcRenderer.send('reset-settings'),
  showConfirmReset: () => ipcRenderer.send('show-confirm-reset'),
  confirmReset: () => ipcRenderer.send('confirm-reset-action'),
  cancelReset: () => ipcRenderer.send('cancel-reset-action'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, ...args) => callback(...args)),
  notifyCanvasState: (isCanvasVisible) => ipcRenderer.send('canvas-state-changed', isCanvasVisible)

});

// A. הוספת קוד לקריאת כותרת הצ'אט
contextBridge.exposeInMainWorld('chatAPI', {
  onTitleUpdate: (callback) => ipcRenderer.on('update-title', (event, ...args) => callback(...args)),
});

let lastTitle = '';

setInterval(() => {
    // בודק את הכותרת מה-DOM של עמוד ה-Gemini
    const titleElement = document.querySelector('.conversation.selected .conversation-title');
    let currentTitle = 'New Chat'; // ערך ברירת מחדל אם אין צ'אט פתוח או כותרת
    if (titleElement) {
        currentTitle = titleElement.textContent.trim();
    }
    
    if (currentTitle !== lastTitle) {
        lastTitle = currentTitle;
        ipcRenderer.send('update-title', currentTitle);
    }
}, 1000); // בודק כל שנייה