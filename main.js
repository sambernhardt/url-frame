const {
  app,
  BrowserWindow,
  ipcMain,
  clipboard,
  Menu,
  nativeTheme,
  nativeImage,
} = require("electron");
const path = require("path");

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** Chroma key used when Background is off — knocked out to real PNG alpha */
const CHROMA = { r: 255, g: 0, b: 170 }; // #ff00aa

function requestCopyImage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("copy-image");
}

function knockOutChroma(image, { r, g, b }, tolerance = 12) {
  const { width, height } = image.getSize();
  const buf = Buffer.from(image.toBitmap());

  for (let i = 0; i < buf.length; i += 4) {
    const B = buf[i];
    const G = buf[i + 1];
    const R = buf[i + 2];
    if (
      Math.abs(R - r) <= tolerance &&
      Math.abs(G - g) <= tolerance &&
      Math.abs(B - b) <= tolerance
    ) {
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 0;
    }
  }

  return nativeImage.createFromBitmap(buf, { width, height });
}

function writePngClipboard(image) {
  const png = image.toPNG();
  clipboard.clear();

  // Prefer real PNG on the pasteboard (keeps alpha; Slack/Figma expect this)
  if (process.platform === "darwin") {
    clipboard.writeBuffer("public.png", png);
  } else if (process.platform === "linux") {
    clipboard.writeBuffer("image/png", png);
  } else {
    clipboard.writeImage(image);
  }

  // Also expose as native image for apps that don't read public.png
  // (skip on macOS when transparent so we don't replace PNG with opaque TIFF)
  const size = image.getSize();
  const bitmap = image.toBitmap();
  let hasAlpha = false;
  for (let i = 3; i < bitmap.length; i += 4) {
    if (bitmap[i] < 255) {
      hasAlpha = true;
      break;
    }
  }
  if (!hasAlpha) {
    clipboard.writeImage(image);
  }

  return { width: size.width, height: size.height, bytes: png.length };
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        {
          label: "Copy Image",
          accelerator: "CmdOrCtrl+C",
          click: () => requestCopyImage(),
        },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function appTheme() {
  return nativeTheme.shouldUseDarkColors ? "dark" : "light";
}

function applyNativeChromeTheme() {
  const theme = appTheme();
  const bg = theme === "dark" ? "#0a0a0a" : "#f4f4f5";
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(bg);
    mainWindow.webContents.send("app-theme", theme);
  }
}

function createWindow() {
  // Follow the OS appearance setting
  nativeTheme.themeSource = "system";

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    backgroundColor: appTheme() === "dark" ? "#0a0a0a" : "#f4f4f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      sandbox: false,
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("app-theme", appTheme());
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("capture-region", async (event, rect, options = {}) => {
  const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  if (!win) return { ok: false, error: "No window" };
  if (!rect?.width || !rect?.height) {
    return { ok: false, error: "Invalid region" };
  }

  await new Promise((r) => setTimeout(r, 50));

  try {
    let image = await win.capturePage({
      x: Math.max(0, Math.round(rect.x)),
      y: Math.max(0, Math.round(rect.y)),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });

    if (options.transparent) {
      image = knockOutChroma(image, CHROMA);
    }

    const meta = writePngClipboard(image);
    return { ok: true, ...meta, format: "png" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("before-input-event", (event, input) => {
    if (contents.getType() !== "webview") return;
    if (input.type !== "keyDown") return;
    const key = (input.key || "").toLowerCase();
    if (!(input.meta || input.control) || key !== "c" || input.alt) return;
    event.preventDefault();
    requestCopyImage();
  });
});

ipcMain.handle("get-app-theme", () => appTheme());

app.whenReady().then(() => {
  nativeTheme.themeSource = "system";
  buildMenu();
  createWindow();

  nativeTheme.on("updated", () => {
    applyNativeChromeTheme();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
