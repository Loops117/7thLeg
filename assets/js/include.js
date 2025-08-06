async function loadPartials(callback) {
  try {
    const headerRes = await fetch(`/assets/partials/header.html?v=${Date.now()}`);
    if (!headerRes.ok) throw new Error("Failed to load header");
    const headerHTML = await headerRes.text();
    const headerEl = document.getElementById("header");
    if (headerEl) headerEl.innerHTML = headerHTML;

    const footerRes = await fetch(`/assets/partials/footer.html?v=${Date.now()}`);
    if (!footerRes.ok) throw new Error("Failed to load footer");
    const footerHTML = await footerRes.text();
    const footerEl = document.getElementById("footer");
    if (footerEl) footerEl.innerHTML = footerHTML;

    if (typeof callback === "function") {
      callback();
    }
  } catch (err) {
    console.error("❌ Error loading partials:", err);
  }
}

// Optional global function for pages to use
window.includeHTML = function(callback) {
  loadPartials(callback);
};

// Fallback behavior for pages that just import include.js directly
document.addEventListener("DOMContentLoaded", () => {
  if (!window._includeWasManuallyTriggered) {
    loadPartials();
  }
});
