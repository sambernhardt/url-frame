document.documentElement.dataset.appTheme = matchMedia(
  "(prefers-color-scheme: dark)"
).matches
  ? "dark"
  : "light";
