const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("remindme", {
  notifyReminder: (payload) => ipcRenderer.send("notify-reminder", payload),
  onFocusNewReminder: (callback) => {
    ipcRenderer.on("focus-new-reminder", () => callback());
  },
  onNotificationAction: (callback) => {
    ipcRenderer.on("notification-action", (_event, payload) => callback(payload));
  },
});
