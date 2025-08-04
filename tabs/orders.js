async function loadOrders() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('orders-container').innerHTML = "<p class='text-danger'>Not logged in.</p>";
    return;
  }
  const { data, error } = await supabase.from("orders").select("*").eq("user_id", user.id);
  if (error) {
    document.getElementById('orders-container').innerHTML = "<p class='text-danger'>Failed to load orders.</p>";
    return;
  }
  document.getElementById('orders-container').innerHTML = data.length ? JSON.stringify(data) : "<p>No orders found.</p>";
}
loadOrders();