/* Shared page chrome: theme toggle (dark by default), mobile menu, footer year. */
(function () {
  "use strict";
  var root = document.documentElement;
  var KEY = "gm-theme";

  /* ---------- theme ---------- */
  function isLight() { return root.dataset.theme === "light"; }
  function syncTheme() {
    var light = isLight();
    document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
      b.setAttribute("aria-pressed", light ? "true" : "false");
      b.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");
      b.title = light ? "Dark theme" : "Light theme";
      var use = b.querySelector("use");
      if (use) use.setAttribute("href", "/assets/icons.svg#i-" + (light ? "moon" : "sun"));
    });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", light ? "#fafafa" : "#0a0a0a");
  }
  document.querySelectorAll("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (isLight()) { delete root.dataset.theme; } else { root.dataset.theme = "light"; }
      try { localStorage.setItem(KEY, isLight() ? "light" : "dark"); } catch (e) {}
      syncTheme();
    });
  });
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
    var wide = window.matchMedia("(min-width: 961px)");
    var onWide = function (m) { if (m.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide); else if (wide.addListener) wide.addListener(onWide);
  }

  /* ---------- footer year ---------- */
  document.querySelectorAll("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
