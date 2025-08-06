document.addEventListener("DOMContentLoaded", () => {
  const content = document.getElementById("hub-content");
  const links = document.querySelectorAll("#hub-sidebar .nav-link");
  const sidebarWrapper = document.getElementById("sidebar-wrapper");

  // Inject header/footer, then init auth, then load Home
  includeHTML(() => {
    const script = document.createElement("script");
    script.src = "/assets/js/header-auth.js?v=" + Date.now(); // cache-bust
    script.onload = () => {
      console.log("✅ header-auth.js loaded after header");
      loadModule("home"); // Only load home after header is injected
    };
    document.body.appendChild(script);
  });

  async function loadModule(name) {
    try {
      const res = await fetch(`hub_modules/${name}.html`);
      if (!res.ok) throw new Error(`Module ${name} not found`);
      const html = await res.text();
      content.innerHTML = html;

      // Reload module JS with cache-busting + better logging
      const scriptUrl = `./hub_modules/${name}.js?v=${Date.now()}`;
      import(scriptUrl).then(mod => {
        console.log(`✅ ${name}.js loaded successfully`);
        if (mod.init) {
          console.log(`📌 Running init() for ${name}`);
          mod.init();
        }
      }).catch(err => {
        console.error(`❌ Failed to import ${name}.js:`, err);
        content.innerHTML += `<p class="text-danger">Failed to load ${name}.js</p>`;
      });

    } catch (err) {
      console.error(`❌ Error loading module ${name}:`, err);
      content.innerHTML = `<p class="text-danger">Failed to load ${name}.</p>`;
    }
  }

  // Sidebar link clicks
  links.forEach(link => {
    link.addEventListener("click", e => {
      const moduleName = link.dataset.module;

      // ✅ If no data-module, let browser handle navigation (like Dashboard)
      if (!moduleName) return;

      e.preventDefault();
      links.forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      loadModule(moduleName);
      sidebarWrapper.classList.remove("open"); // close on mobile
    });
  });
});
