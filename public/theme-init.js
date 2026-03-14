(function () {
  var stored = localStorage.getItem("webcinetv-theme-preference");
  var legacy = localStorage.getItem("webcinema-theme-preference");
  var resolved =
    stored === "light" || stored === "dark"
      ? stored
      : legacy === "light" || legacy === "dark"
        ? legacy
        : "dark";
  document.documentElement.setAttribute("data-mantine-color-scheme", resolved);
})();
