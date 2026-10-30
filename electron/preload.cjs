// الجسر بين الصفحة والبرنامج | the small, explicit bridge the page may use.
// Nothing else from Node or Electron is exposed to the page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  print: (opts) => ipcRenderer.invoke("pos:print", opts),
  listPrinters: () => ipcRenderer.invoke("pos:printers"),
  setupReceiptPrinter: (port) => ipcRenderer.invoke("pos:setupReceiptPrinter", port),
  usbPorts: () => ipcRenderer.invoke("pos:usbPorts"),
  tryPorts: () => ipcRenderer.invoke("pos:tryPorts"),
  testPrinter: () => ipcRenderer.invoke("pos:testPrinter"),
  openLastReceipt: () => ipcRenderer.invoke("pos:openLastReceipt"),
  getConfig: () => ipcRenderer.invoke("pos:getConfig"),
  setConfig: (patch) => ipcRenderer.invoke("pos:setConfig", patch),
  chooseFolder: () => ipcRenderer.invoke("pos:chooseFolder"),
  chooseBackupFile: (defaultDir) => ipcRenderer.invoke("pos:chooseBackupFile", defaultDir),
  openPath: (p) => ipcRenderer.invoke("pos:openPath", p),
  updateState: () => ipcRenderer.invoke("pos:updateState"),
  checkUpdates: () => ipcRenderer.invoke("pos:checkUpdates"),
  installUpdate: () => ipcRenderer.invoke("pos:installUpdate"),
  onUpdate: (cb) => {
    const fn = (_e, s) => cb(s);
    ipcRenderer.on("pos:update", fn);
    return () => ipcRenderer.removeListener("pos:update", fn);
  },
});
