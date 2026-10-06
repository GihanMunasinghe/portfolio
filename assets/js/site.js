/* Shared page chrome: theme toggle, mobile menu, footer year. */
(function () {
  "use strict";
  var root = document.documentElement;
  var dark = window.matchMedia("(prefers-color-scheme: dark)");

  /* ---------- theme ---------- */
  function currentTheme() {
    return root.dataset.theme || (dark.matches ? "dark" : "light");
  }
  function syncTheme() {
    var t = currentTheme();
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
      b.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
      b.title = t === "dark" ? "Light theme" : "Dark theme";
      var use = b.querySelector("use");
      if (use) use.setAttribute("href", "/assets/icons.svg#i-" + (t === "dark" ? "sun" : "moon"));
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    var series = getComputedStyle(document.body).getPropertyValue("--series").trim();
    if (meta && series) meta.setAttribute("content", series);
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem("gm_theme", next); } catch (e) {}
      syncTheme();
    });
  });
  if (dark.addEventListener) dark.addEventListener("change", syncTheme);
  syncTheme();

  /* ---------- mobile menu ---------- */
  var menuBtn = document.querySelector("[data-menu-button]");
  var panel = menuBtn && document.getElementById(menuBtn.getAttribute("aria-controls"));
  if (menuBtn && panel) {
    var setOpen = function (open) {
      panel.classList.toggle("open", open);
      menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
      var use = menuBtn.querySelector("use");
      if (use) use.setAttribute("href", "/assets/icons.svg#i-" + (open ? "x" : "list"));
    };
    menuBtn.addEventListener("click", function () { setOpen(!panel.classList.contains("open")); });
    panel.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", function () { setOpen(false); }); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && panel.classList.contains("open")) { setOpen(false); menuBtn.focus(); }
    });
    window.matchMedia("(min-width: 961px)").addEventListener("change", function (m) { if (m.matches) setOpen(false); });
  }

  /* ---------- footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
