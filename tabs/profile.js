async function loadProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('profile-content').innerHTML =
      "<p class='text-danger'>Not logged in.</p>";
    return;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, role, created_at")
    .eq("id", user.id)
    .single();

  if (error) {
    document.getElementById('profile-content').innerHTML =
      "<p class='text-danger'>Failed to load profile.</p>";
    return;
  }

  // Render profile info
  document.getElementById('profile-content').innerHTML = `
    <p><strong>Name:</strong> ${profile.full_name || "N/A"}</p>
    <p><strong>Role:</strong> ${profile.role}</p>
    <p><strong>Joined:</strong> ${new Date(profile.created_at).toLocaleDateString()}</p>
  `;

  // Attach public profile buttons
  const btn = document.getElementById("public-profile-btn");
  const copyBtn = document.getElementById("copy-profile-link");

  if (btn && copyBtn && profile?.full_name) {
    const url = `${window.location.origin}/profiles/index.html?id=${user.id}`;

    btn.addEventListener("click", () => {
      window.location.href = url;
    });

    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(url);
      alert("✅ Profile link copied to clipboard!");
    });
  }
}
loadProfile();
