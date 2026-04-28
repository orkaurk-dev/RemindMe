const { app, BrowserWindow, Menu, Tray, Notification, ipcMain, shell } = require("electron");
const path = require("path");

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

let mainWindow;
let tray;
let isQuitting = false;

function getIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "icon.ico")
    : path.join(__dirname, "build", "icon.ico");
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 900,
    minWidth: 920,
    minHeight: 700,
    backgroundColor: "#07111f",
    title: "RemindMe",
    icon: getIconPath(),
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.once("ready-to-show", () => {
    if (!isQuitting) {
      mainWindow.show();
    }
  });
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("minimize", (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showWindow() {
  if (!mainWindow) {
    createWindow();
  }

  mainWindow.show();
  mainWindow.restore();
  mainWindow.focus();
}

function createTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(getIconPath());
  tray.setToolTip("RemindMe");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Show RemindMe", click: () => showWindow() },
    { label: "New Reminder", click: () => focusNewReminder() },
    { type: "separator" },
    { label: "Quit", click: () => quitApp() },
  ]));
  tray.on("double-click", showWindow);
}

function focusNewReminder() {
  showWindow();
  sendToRenderer("focus-new-reminder");
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function notifyReminderAction(reminderId, action) {
  showWindow();
  sendToRenderer("notification-action", {
    id: reminderId,
    action,
  });
}

app.whenReady().then(() => {
  const menuTemplate = [
    {
      label: "RemindMe",
      submenu: [
        { label: "Show", click: showWindow },
        { label: "New Reminder", accelerator: "Ctrl+N", click: focusNewReminder },
        { label: "Hide to Tray", click: () => mainWindow?.hide() },
        { label: "Quit", accelerator: "Ctrl+Q", click: quitApp },
      ],
    },
    {
      label: "File",
      submenu: [
        { label: "New Reminder", accelerator: "Ctrl+N", click: focusNewReminder },
        { label: "Show", click: showWindow },
        { label: "Quit", click: quitApp },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Help",
      submenu: [
        {
          label: "About RemindMe",
          click: () => {
            new Notification({
              title: "RemindMe",
              body: "Local reminders, quick capture, and Windows notifications.",
            }).show();
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
  createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }

    createTray();
    showWindow();
  });
});

app.on("second-instance", () => {
  showWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.on("notify-reminder", (_event, reminder) => {
  const notification = new Notification({
    title: reminder.title,
    subtitle: reminder.subtitle,
    body: reminder.body,
    icon: getIconPath(),
    actions: [
      { type: "button", text: "Open" },
      { type: "button", text: "Done" },
      { type: "button", text: "Snooze 1 day" },
    ],
    silent: false,
  });

  notification.on("click", () => notifyReminderAction(reminder.id, "open"));
  notification.on("action", (_event, actionIndex) => {
    const actions = ["open", "done", "snooze"];
    notifyReminderAction(reminder.id, actions[actionIndex] || "open");
  });

  notification.show();
  shell.beep();
});

app.on("before-quit", () => {
  isQuitting = true;
});
