import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://lvqtbbsswgcwfwydqmhf.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2cXRiYnNzd2djd2Z3eWRxbWhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNzM0NTAsImV4cCI6MjA5Nzg0OTQ1MH0.b1q8_YMcUW4dAbP45ksJJxHt13-aaB0DJcxTSqRgtTQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
