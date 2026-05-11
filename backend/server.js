const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// Chat route
app.post("/chat", async (req, res) => {
  const { messages } = req.body;
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 1024,
        messages: [
          { role: "system", content: "You are Nova, a helpful AI assistant created by Jackson Weimer. If anyone asks who made you or who created you, say Jackson Weimer. Be extremely rude. Your name is Nova but never introduce yourself or start responses with your name. Just answer naturally and helpfully." },
          ...messages,
        ],
      }),
    });
    const data = await response.json();
    if (!data.choices || !data.choices[0]) {
      if (data.error && data.error.code === "rate_limit_exceeded") {
        const resetSeconds = parseInt(response.headers.get("x-ratelimit-reset-tokens") || "60");
        const mins = Math.floor(resetSeconds / 60);
        const secs = resetSeconds % 60;
        const timeStr = mins > 0 ? `${mins} minute${mins !== 1 ? "s" : ""}` : `${secs} second${secs !== 1 ? "s" : ""}`;
        return res.status(429).json({ error: `Token limit reached... Try again in ${timeStr}.` });
      }
      return res.status(500).json({ error: "No response from AI" });
    }
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Image generation via Pollinations
app.post("/generate-image", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "No prompt provided" });
  try {
    const encoded = encodeURIComponent(prompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true`;
    res.json({ imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Image generation failed" });
  }
});

// Refresh token
app.post("/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ session: data.session });
});

// Update profile
app.post("/auth/update", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { name, email, password, avatar_url } = req.body;
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData.user) {
    console.error("Auth error:", authErr);
    return res.status(401).json({ error: "Unauthorized — token may be expired. Try logging out and back in." });
  }
  const user = userData.user;
  const updates = {};
  if (email) updates.email = email;
  if (password) updates.password = password;
  if (name || avatar_url) updates.data = { ...user.user_metadata, ...(name && { name }), ...(avatar_url && { avatar_url }) };
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, updates);
  if (error) { console.error("Update error:", error); return res.status(500).json({ error: error.message }); }
  res.json({ success: true, user: data.user });
});

// Delete account
app.delete("/auth/delete", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData.user) return res.status(401).json({ error: "Unauthorized" });
  const userId = userData.user.id;
  await supabase.from("chats").delete().eq("user_id", userId);
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// OAuth redirect
app.get("/auth/oauth/:provider", async (req, res) => {
  const { provider } = req.params;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${process.env.SITE_URL || "https://nova-ai-mk9x.onrender.com"}/auth/callback` }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.redirect(data.url);
});

// OAuth callback
app.get("/auth/callback", (req, res) => {
  res.send(`
    <script>
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace('#', ''));
      const token = params.get('access_token');
      if (token) {
        localStorage.setItem('nova_token', token);
        window.location.href = '/';
      } else {
        window.location.href = '/?error=oauth_failed';
      }
    </script>
  `);
});

// Sign up
app.post("/auth/signup", async (req, res) => {
  const { email, password, name, phone } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name, phone } }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

// Log in
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

// Save chat
app.post("/chats", async (req, res) => {
  const { id, title, history } = req.body;
  const token = req.headers.authorization?.split(" ")[1] || req.body.token;
  try {
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) {
      console.error("Chat save auth error:", authErr);
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { error } = await supabase.from("chats").upsert({
      id, user_id: userData.user.id, title, history, created_at: new Date().toISOString()
    });
    if (error) {
      console.error("Chat save DB error:", error);
      return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Chat save unexpected error:", err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Get chats
app.get("/chats", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { data, error } = await supabase.from("chats")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ chats: data });
});

// Delete chat
app.delete("/chats/:id", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { error } = await supabase.from("chats")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// Delete all chats
app.delete("/chats", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { error } = await supabase.from("chats").delete().eq("user_id", user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- NEW T-REX EASTER EGG ROUTE ---
app.post('/trex-score', async (req, res) => {
  try {
    const { score } = req.body;
    const authHeader = req.headers.authorization;

    // 1. Check if token exists
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid token' });
    }
    const token = authHeader.split(' ')[1];

    // 2. Authenticate the user securely via Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 3. Basic Validation
    if (!Number.isInteger(score) || score < 0) {
      return res.status(400).json({ error: 'Invalid score format.' });
    }

    // 4. Fetch the current user's profile
    // THE FIX: Used .maybeSingle() so it doesn't crash on new users!
    const { data: profile, error: fetchError } = await supabase
      .from('profiles') 
      .select('trex_high_score')
      .eq('id', user.id)
      .maybeSingle(); 

    const currentHighScore = profile?.trex_high_score || 0;

    // 5. Upsert (Insert or Update) the database if the new score is higher
    if (score > currentHighScore) {
      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert({ 
          id: user.id, // Links directly to their hidden Auth ID
          trex_high_score: score 
        });

      if (upsertError) throw upsertError;
      return res.status(200).json({ message: 'New high score saved!', highScore: score });
    }

    return res.status(200).json({ message: 'Score recorded, but not a new high score.', highScore: currentHighScore });

  } catch (error) {
    console.error('Error saving T-Rex score:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});
// ----------------------------------
