// בקובץ preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // קריאות מ-Renderer ל-Main
  completeOnboarding: () => ipcRenderer.send('onboarding-complete'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.send('update-setting', key, value),
  openSettingsWindow: () => ipcRenderer.send('open-settings-window'),
  resetSettings: () => ipcRenderer.send('reset-settings'),
  showConfirmReset: () => ipcRenderer.send('show-confirm-reset'),
  confirmReset: () => ipcRenderer.send('confirm-reset-action'),
  cancelReset: () => ipcRenderer.send('cancel-reset-action'),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, ...args) => callback(...args)),
  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', (event, ...args) => callback(...args)),
  notifyCanvasState: (isCanvasVisible) => ipcRenderer.send('canvas-state-changed', isCanvasVisible)

});