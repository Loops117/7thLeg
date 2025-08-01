document.addEventListener("DOMContentLoaded", async () => {
  const { data: { user } } = await window.supabase.auth.getUser();
  const navUser = document.getElementById("nav-user");

  if (user) {
    navUser.innerHTML = `
      <li class="nav-item dropdown">
        <a class="nav-link dropdown-toggle" href="#" id="userMenu" role="button"
          data-bs-toggle="dropdown" aria-expanded="false">
          ${user.user_metadata.full_name || user.email}
        </a>
        <ul class="dropdown-menu dropdown-menu-end" aria-labelledby="userMenu">
          <li><a class="dropdown-item" href="dashboard.html">Dashboard</a></li>
          <li><button class="dropdown-item" onclick="logout()">Logout</button></li>
        </ul>
      </li>
    `;
  } else {
    navUser.innerHTML = `
      <li class="nav-item">
        <a class="nav-link" href="login.html">Login</a>
      </li>
    `;
  }
});

async function logout() {
  await window.supabase.auth.signOut();
  window.location.href = "index.html";
}