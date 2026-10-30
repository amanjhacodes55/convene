// Convene for desktop: the web app in its own window, with what a browser tab would otherwise ask for
// (camera, microphone, screen sharing, notifications) granted to the Convene server and nothing else.
const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } = require("electron");
const path = require("node:path");

/** The server to open. Point it at a self-hosted Convene with CONVENE_URL=https://… */
const HOME = (process.env.CONVENE_URL || "https://convene-meet.netlify.app").replace(/\/$/, "");
const ORIGIN = new URL(HOME).origin;

const ALLOWED = new Set(["media", "display-capture", "notifications", "fullscreen", "clipboard-read", "clipboard-sanitized-write"]);

const sameOrigin = (url) => {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
};

const openOutside = (url) => {
  if (/^https?:\/\//.test(url)) void shell.openExternal(url);
};

// The site can tell it is running in the app.
app.userAgentFallback = `${app.userAgentFallback} ConveneDesktop/${app.getVersion()}`;

/** @type {BrowserWindow | null} */
let main = null;

function createWindow() {
  main = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 420,
    minHeight: 560,
    title: "Convene",
    backgroundColor: "#0b0d12",
    autoHideMenuBar: true,
    show: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  main.once("ready-to-show", () => main?.show());
  main.on("closed", () => (main = null));

  const contents = main.webContents;
  // Links to other sites open in the browser; Convene's own pages stay in the app.
  contents.setWindowOpenHandler(({ url }) => {
    if (sameOrigin(url)) {
      void contents.loadURL(url);
    } else {
      openOutside(url);
    }
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (!sameOrigin(url)) {
      event.preventDefault();
      openOutside(url);
    }
  });
  // No connection: a page with a Try again button instead of a blank window.
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3) void main?.loadFile(path.join(__dirname, "offline.html"), { query: { url } });
  });

  void main.loadURL(HOME);
}

/** Lets the person choose a screen or window to share, from a small window of thumbnails. */
function pickSource(sources) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      parent: main ?? undefined,
      modal: Boolean(main),
      width: 760,
      height: 560,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "Share your screen",
      backgroundColor: "#13161d",
      autoHideMenuBar: true,
      show: false,
      webPreferences: { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "picker-preload.js") },
    });
    const list = sources.map((s) => ({ id: s.id, name: s.name, screen: s.id.startsWith("screen:"), thumbnail: s.thumbnail.toDataURL() }));
    let chosen = null;
    const onList = () => list;
    const onChoose = (_event, id) => {
      chosen = sources.find((s) => s.id === id) ?? null;
      picker.close();
    };
    ipcMain.handle("picker:sources", onList);
    ipcMain.on("picker:choose", onChoose);
    picker.once("ready-to-show", () => picker.show());
    picker.on("closed", () => {
      ipcMain.removeHandler("picker:sources");
      ipcMain.removeListener("picker:choose", onChoose);
      resolve(chosen);
    });
    void picker.loadFile(path.join(__dirname, "picker.html"));
  });
}

function guardSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(sameOrigin(details.requestingUrl || contents.getURL()) && ALLOWED.has(permission));
  });
  ses.setPermissionCheckHandler((_contents, permission, requestingOrigin) => requestingOrigin === ORIGIN && ALLOWED.has(permission));

  // getDisplayMedia: the system picker on macOS 15 and later, our own picker everywhere else.
  ses.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (!sameOrigin(request.securityOrigin)) return callback({});
      try {
        const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 320, height: 180 } });
        const source = sources.length === 1 ? sources[0] : await pickSource(sources);
        if (!source) return callback({});
        // Windows can send what the computer is playing along with a whole screen.
        callback({ video: source, audio: process.platform === "win32" && request.audioRequested && source.id.startsWith("screen:") ? "loopback" : undefined });
      } catch {
        callback({});
      }
    },
    { useSystemPicker: true },
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!main) return createWindow();
    if (main.isMinimized()) main.restore();
    main.focus();
  });

  app.whenReady().then(() => {
    guardSession();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
