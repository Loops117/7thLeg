async function renderNavUser() {
  const navUser = document.getElementById("nav-user");
  if (!navUser) {
    console.warn("⏳ nav-user not found yet, retrying...");
    setTimeout(renderNavUser, 200); // retry after 200ms
    return;
  }

  try {
    const { data: { user } } = await window.supabase.auth.getUser();

    if (user) {
      navUser.innerHTML = `
        <li class="nav-item dropdown">
          <a class="nav-link dropdown-toggle" href="#" id="userMenu" role="button"
            data-bs-toggle="dropdown" aria-expanded="false">
            ${user.user_metadata.full_name || user.email}
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

async function logout() {
  await window.supabase.auth.signOut();
  window.location.href = "index.html";
}
