// /assets/js/pwa-install.js
(function(){
  let deferredPrompt = null;
  const btn = document.getElementById("install-app-btn");
  function show(){ if (btn) btn.style.display = ""; }
  function hide(){ if (btn) btn.style.display = "none"; }

  hide();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hide();
  });

  if (btn) {
    btn.addEventListener("click", async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => ({}));
      deferredPrompt = null;
      hide();
    });
  }
})();