async function loadProfile() {
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    document.getElementById('profile-content').innerHTML =
      "<p class='text-danger'>Not logged in.</p>";
    return;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, about_me, role, created_at")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Profile query error:", error);
    document.getElementById('profile-content').innerHTML =
      "<p class='text-danger'>Failed to load profile.</p>";
    return;
  }

  // Pre-fill values
  document.getElementById("full_name").value = profile.full_name || "";
  document.getElementById("about_me").value = profile.about_me || "";

  // Show read-only role & joined date
  const messageBox = document.getElementById("profile-message");
  messageBox.innerHTML = `
    <p><strong>Role:</strong> ${profile.role || "User"}</p>
    <p><strong>Joined:</strong> ${new Date(profile.created_at).toLocaleDateString()}</p>
  `;

  // Handle save
  document.getElementById("profile-form").addEventListener("submit", async (e) => {
    e.preventDefault();

    const updates = {
      full_name: document.getElementById("full_name").value.trim(),
      about_me: document.getElementById("about_me").value.trim()
    };

    const { error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    if (updateError) {
      messageBox.innerHTML += `<p class="text-danger">❌ Failed to update: ${updateError.message}</p>`;
    } else {
      messageBox.innerHTML += `<p class="text-success">✅ Profile updated successfully!</p>`;
    }
  });
}

loadProfile();
