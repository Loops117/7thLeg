// assets/js/header-auth.js
console.log("🔑 header-auth.js loaded");

async function renderNavUser() {
  const navUser = document.getElementById("nav-user");
  const logo = document.querySelector(".logo-area");

  // Header might be injected asynchronously; retry until it appears
  if (!navUser || !logo) {
    console.warn("⏳ nav-user or logo not found yet, retrying...");
    setTimeout(renderNavUser, 200);
    return;
  }

  // Supabase may not be ready immediately
  if (!window.supabase || !window.supabase.auth) {
    console.warn("⏳ Supabase not ready, retrying...");
    setTimeout(renderNavUser, 200);
    return;
  }

  try {
    const { data: { user } } = await window.supabase.auth.getUser();

    // 🔗 Set logo destination depending on auth
    logo.setAttribute("href", user ? "/communityhub/hub.html" : "/index.html");

    if (user) {
      navUser.innerHTML = `
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" id="userMenu" role="button"
            data-bs-toggle="dropdown" aria-expanded="false">
            ${user.user_metadata?.full_name || user.email}
          </a>
          <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userMenu">
            <li><a class="dropdown-item" href="/dashboard.html">Dashboard</a></li>
            <li><button class="dropdown-item" onclick="logout()">Logout</button></li>
          </ul>
        </li>
      `;
    } else {
      navUser.innerHTML = `
        <li class="nav-item">
          <a class="nav-link" href="/login.html">Login / Signup</a>
        </li>
      `;
    }
  } catch (err) {
    console.error("❌ Error loading user:", err);
  }
}

document.addEventListener("DOMContentLoaded", renderNavUser);

// Also react to auth state changes so the logo target stays correct
if (window.supabase && window.supabase.auth) {
  window.supabase.auth.onAuthStateChange(() => {
    renderNavUser();
  });
}

async function logout() {
  try {
    await window.supabase.auth.signOut();
  } finally {
    // After logout, send to the public landing
    window.location.href = "/index.html";
  }
}
