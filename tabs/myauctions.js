async function loadAuctions() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('auctions-container').innerHTML = "<p class='text-danger'>Not logged in.</p>";
    return;
  }
  const { data, error } = await supabase.from("auctions").select("*").eq("user_id", user.id);
  if (error) {
    document.getElementById('auctions-container').innerHTML = "<p class='text-danger'>Failed to load auctions.</p>";
    return;
  }
  document.getElementById('auctions-container').innerHTML = data.length ? JSON.stringify(data) : "<p>No auctions found.</p>";
}
loadAuctions();