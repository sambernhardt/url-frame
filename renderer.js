const view = document.getElementById("view");
const empty = document.getElementById("empty");
const form = document.getElementById("url-form");
const input = document.getElementById("url-input");
const browser = document.getElementById("browser");
const stage = document.getElementById("stage");
const copyBtn = document.getElementById("copy-btn");
const copyLabel = document.getElementById("copy-label");
const bgToggle = document.getElementById("bg-toggle");
const modeToggle = document.getElementById("mode-toggle");
const paddingSeg = document.getElementById("padding-seg");

let hasLoaded = false;
let copyResetTimer = null;

function normalizeUrl(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.includes(" ") || !trimmed.includes(".")) {
    return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
  }

  return `https://${trimmed}`;
}

function displayUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "about:") return "";
    return u.href;
  } catch {
    return url;
  }
}

function isEditingUrl() {
  return document.activeElement === input;
}

function setLoaded(url) {
  hasLoaded = Boolean(url) && url !== "about:blank";
  empty.classList.toggle("hidden", hasLoaded);
  view.classList.toggle("visible", hasLoaded);
  syncChromeUrl();
}

function updateChromeUrl(url) {
  if (!isEditingUrl()) {
    input.value =
      url && url !== "about:blank" ? displayUrl(url) || chromeUrlLabel(url) : "";
  }
}

function chromeUrlLabel(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "about:") return "";
    return u.href;
  } catch {
    return url;
  }
}

function syncChromeUrl() {
  try {
    updateChromeUrl(view.getURL());
  } catch {
    updateChromeUrl("");
  }
}

function navigate(raw) {
  const url = normalizeUrl(raw);
  if (!url) return;
  input.value = displayUrl(url) || raw.trim();
  input.blur();
  updateChromeUrl(url);
  view.src = url;
  setLoaded(true);
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  navigate(input.value);
});

input.addEventListener("focus", () => {
  requestAnimationFrame(() => input.select());
});

// Clicking the chrome URL row focuses the field
form.addEventListener("click", () => {
  input.focus();
});

view.addEventListener("did-navigate", (e) => {
  setLoaded(e.url);
});

view.addEventListener("did-navigate-in-page", (e) => {
  updateChromeUrl(e.url);
});

view.addEventListener("did-finish-load", () => {
  const url = view.getURL();
  if (url && url !== "about:blank") {
    setLoaded(url);
  }
  syncChromeUrl();
});

view.addEventListener("page-title-updated", (e) => {
  document.title = e.title
    ? `${e.title} · Copy browser as image`
    : "Copy browser as image";
});

view.addEventListener("did-fail-load", (e) => {
  if (e.errorCode === -3) return;
  syncChromeUrl();
});

/* —— Toolbar —— */

bgToggle.addEventListener("click", () => {
  const on = stage.dataset.bg !== "on";
  stage.dataset.bg = on ? "on" : "off";
  bgToggle.classList.toggle("on", on);
  bgToggle.setAttribute("aria-pressed", String(on));
});

function setWindowDark(on) {
  browser.classList.toggle("dark", on);
  modeToggle.classList.toggle("on", on);
  modeToggle.setAttribute("aria-pressed", String(on));
}

modeToggle.addEventListener("click", () => {
  setWindowDark(!browser.classList.contains("dark"));
});

paddingSeg.addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  stage.dataset.padding = btn.dataset.padding;
  paddingSeg.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b === btn);
  });
});

/* —— Export —— */

function setCopyState(state, label) {
  copyBtn.classList.remove("success", "error");
  if (state) copyBtn.classList.add(state);
  copyLabel.textContent = label;
  clearTimeout(copyResetTimer);
  copyResetTimer = setTimeout(() => {
    copyBtn.classList.remove("success", "error");
    copyLabel.textContent = "Copy Image";
  }, 1600);
}

function stageRect() {
  const r = stage.getBoundingClientRect();
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

async function copyFramedImage() {
  copyBtn.blur();
  document.activeElement?.blur?.();

  const transparent = stage.dataset.bg !== "on";
  document.body.classList.toggle("capturing-transparent", transparent);
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));

  try {
    const result = await window.urlFrame.captureRegion(stageRect(), {
      transparent,
    });
    if (result?.ok) {
      setCopyState("success", "Copied");
    } else {
      setCopyState("error", result?.error || "Failed");
    }
  } catch (err) {
    console.error(err);
    setCopyState("error", "Failed");
  } finally {
    document.body.classList.remove("capturing-transparent");
  }
}

copyBtn.addEventListener("click", () => {
  copyFramedImage();
});

window.addEventListener("keydown", (e) => {
  const meta = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  const inEditable =
    e.target instanceof HTMLInputElement ||
    e.target instanceof HTMLTextAreaElement ||
    e.target?.isContentEditable;

  if (meta && key === "l") {
    e.preventDefault();
    input.focus();
    input.select();
  }

  if (meta && key === "c" && !e.shiftKey && !e.altKey) {
    const sel = String(window.getSelection?.() || "");
    const inputHasSelection =
      inEditable &&
      typeof e.target.selectionStart === "number" &&
      e.target.selectionStart !== e.target.selectionEnd;

    if (!inputHasSelection && !sel) {
      e.preventDefault();
      copyFramedImage();
    }
  }

  if (meta && e.shiftKey && key === "c") {
    e.preventDefault();
    copyFramedImage();
  }

  if (meta && key === "r") {
    e.preventDefault();
    if (hasLoaded) view.reload();
  }

  if (meta && key === "[") {
    e.preventDefault();
    if (view.canGoBack()) view.goBack();
  }

  if (meta && key === "]") {
    e.preventDefault();
    if (view.canGoForward()) view.goForward();
  }
});

window.urlFrame.onCopyImage(() => {
  const el = document.activeElement;
  if (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    typeof el.selectionStart === "number" &&
    el.selectionStart !== el.selectionEnd
  ) {
    const text = el.value.slice(el.selectionStart, el.selectionEnd);
    navigator.clipboard.writeText(text).catch(() => {});
    return;
  }
  copyFramedImage();
});

function applyAppTheme(theme) {
  const mode = theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.appTheme = mode;
}

window.urlFrame.onAppTheme(applyAppTheme);
window.urlFrame.getAppTheme().then(applyAppTheme);

setWindowDark(false);

const bootParams = new URLSearchParams(location.search);
const bootUrl = bootParams.get("url");
if (bootUrl) {
  navigate(bootUrl);
} else {
  setLoaded(false);
  updateChromeUrl("");
  input.focus();
}
