const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('omegaDesktop', {
    invoke: (command, args) => ipcRenderer.invoke('omega:invoke', command, args),
    onEvent: callback => {
        const listener = (_event, name, payload) => callback(name, payload);
        ipcRenderer.on('omega:event', listener);
        return () => ipcRenderer.removeListener('omega:event', listener);
    },
    onChannel: callback => {
        const listener = (_event, id, payload) => callback(id, payload);
        ipcRenderer.on('omega:channel', listener);
        return () => ipcRenderer.removeListener('omega:channel', listener);
    },
    pathForFile: file => webUtils.getPathForFile(file),
});
