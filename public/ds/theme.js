// Loaded synchronously in <head> so the saved theme applies before first paint.
try {
  const theme = localStorage.getItem('lab-theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage unavailable (private mode); fall back to the system theme.
}
