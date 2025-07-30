const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  completeOnboarding: () => ipcRenderer.send('onboarding-complete')
});
