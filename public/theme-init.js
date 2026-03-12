(function () {
  var stored = localStorage.getItem("webcinetv-theme-preference");
  var resolved = stored === "light" || stored === "dark" ? stored : "dark";
  document.documentElement.setAttribute("data-mantine-color-scheme", resolved);
})();
