async function loadWishlist() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    document.getElementById('wishlist-container').innerHTML = "<p class='text-danger'>Not logged in.</p>";
    return;
  }
  const { data, error } = await supabase.from("wishlist").select("id, product_id, created_at").eq("user_id", user.id);
  if (error) {
    document.getElementById('wishlist-container').innerHTML = "<p class='text-danger'>Failed to load wishlist.</p>";
    return;
  }
  if (!data || data.length === 0) {
    document.getElementById('wishlist-container').innerHTML = "<p>No items in wishlist.</p>";
    return;
  }
  document.getElementById('wishlist-container').innerHTML = JSON.stringify(data);
}
loadWishlist();