const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('workbench', {
  roots: () => ipcRenderer.invoke('roots'),
  listDir: (p) => ipcRenderer.invoke('list-dir', p),
  readFile: (p) => ipcRenderer.invoke('read-file', p),
  saveFile: (payload) => ipcRenderer.invoke('save-file', payload),
  fileInfo: (p) => ipcRenderer.invoke('file-info', p),
  rename: (payload) => ipcRenderer.invoke('rename', payload),
  trash: (p) => ipcRenderer.invoke('trash', p),
  newFolder: (payload) => ipcRenderer.invoke('new-folder', payload),
  move: (payload) => ipcRenderer.invoke('move', payload),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  newNote: (payload) => ipcRenderer.invoke('new-note', payload),
  toggleOrgLine: (payload) => ipcRenderer.invoke('toggle-org-line', payload),
  buildCommand: (p) => ipcRenderer.invoke('build-command', p),
  resolveOrgLink: (payload) => ipcRenderer.invoke('resolve-org-link', payload),

  terminalCreate: (payload) => ipcRenderer.invoke('terminal-create', payload),
  terminalPing: () => ipcRenderer.invoke('terminal-ping'),
  terminalWrite: (payload) => ipcRenderer.invoke('terminal-write', payload),
  terminalResize: (payload) => ipcRenderer.invoke('terminal-resize', payload),
  terminalCwd: (payload) => ipcRenderer.invoke('terminal-cwd', payload),

  onTerminalData: (cb) => ipcRenderer.on('terminal-data', (_e, data) => cb(data)),
  onTerminalExit: (cb) => ipcRenderer.on('terminal-exit', (_e, data) => cb(data)),
  onFsChanged: (cb) => ipcRenderer.on('fs:changed', (_e, data) => cb(data))
});