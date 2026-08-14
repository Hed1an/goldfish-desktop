// 主题持久化桥(隔离环境,只暴露最小接口)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dshTheme', {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (value) => ipcRenderer.invoke('theme:set', value),
});
