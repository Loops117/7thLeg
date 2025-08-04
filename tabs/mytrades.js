async function loadTrades() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('trades-container').innerHTML = "<p class='text-danger'>Not logged in.</p>";
    return;
  }
  const { data, error } = await supabase.from("trades").select("*").eq("user_id", user.id);
  if (error) {
    document.getElementById('trades-container').innerHTML = "<p class='text-danger'>Failed to load trades.</p>";
    return;
  }
  document.getElementById('trades-container').innerHTML = data.length ? JSON.stringify(data) : "<p>No trades found.</p>";
}
loadTrades();