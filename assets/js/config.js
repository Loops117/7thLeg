// File: /assets/js/config.js

// Replace the placeholders with your actual Supabase project URL and anon key
const SUPABASE_URL = "https://ugdszfbhvpqomozthuoy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVnZHN6ZmJodnBxb21venRodW95Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQwNzE2NTIsImV4cCI6MjA2OTY0NzY1Mn0.sYa5qHyYNma0FpwexJkaEUI7W9eb3YvFNYeQxBp44mk";

// Initialize Supabase client and make it globally available
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
