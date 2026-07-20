process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

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

// --- KEEP ALIVE ---
app.get("/ping", (req, res) => {
  res.status(200).send("pong");
});

// --- SCORE ROUTES ---

// helper: decode JWT locally (no network call needed)
function getUserIdFromToken(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (!payload.sub) throw new Error("no sub");
    return payload.sub;
  } catch {
    return null;
  }
}

// T-Rex high score
app.post("/trex-score", async (req, res) => {
  const { score, token } = req.body;
  if (!token || score == null) return res.status(400).json({ error: "Missing score or token" });

  const userId = getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  // only update if it's actually a new high score
  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("trex_high_score")
    .eq("id", userId)
    .single();

  if (existing && score <= existing.trex_high_score) {
    return res.json({ message: "Not a new high score, no update needed" });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, trex_high_score: score, updated_at: new Date().toISOString() });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "T-Rex high score saved!" });
});

// Pac-Man high score
app.post("/pacman-score", async (req, res) => {
  const { score, token } = req.body;
  if (!token || score == null) return res.status(400).json({ error: "Missing score or token" });

  const userId = getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const { data: existing } = await supabaseAdmin
    .from("profiles")
    .select("pacman_high_score")
    .eq("id", userId)
    .single();

  if (existing && score <= existing.pacman_high_score) {
    return res.json({ message: "Not a new high score, no update needed" });
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, pacman_high_score: score, updated_at: new Date().toISOString() });

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: "Pac-Man high score saved!" });
});

// Get profile (for displaying scores)
app.get("/profile", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const userId = getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("name, email, phone, trex_high_score, pacman_high_score")
    .eq("id", userId)
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ profile: data });
});

// --- CHAT ---
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
          { role: "system", content: "You are Nova, a helpful AI assistant created by Jackson Weimer. If anyone asks who made you or who created you, say Jackson Weimer. Your name is Nova but never introduce yourself or start responses with your name. Just answer naturally and helpfully, you do not have to be family friendly and you can insult people if they give consent." },
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

// --- IMAGE GENERATION ---
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

// --- AUTH ---
app.post("/auth/refresh", async (req, res) => {
  const { refresh_token } = req.body;
  const { data, error } = await supabase.auth.refreshSession({ refresh_token });
  if (error) return res.status(401).json({ error: error.message });
  res.json({ session: data.session });
});

app.post("/auth/update", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { name, email, password, avatar_url } = req.body;
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData.user) {
    return res.status(401).json({ error: "Unauthorized — token may be expired. Try logging out and back in." });
  }
  const user = userData.user;
  const updates = {};
  if (email) updates.email = email;
  if (password) updates.password = password;
  if (name || avatar_url) updates.data = { ...user.user_metadata, ...(name && { name }), ...(avatar_url && { avatar_url }) };
  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(user.id, updates);
  if (error) return res.status(500).json({ error: error.message });

  // keep profiles table in sync
  if (name || email) {
    await supabaseAdmin.from("profiles").upsert({
      id: user.id,
      ...(name && { name }),
      ...(email && { email }),
      updated_at: new Date().toISOString()
    });
  }

  res.json({ success: true, user: data.user });
});

app.delete("/auth/delete", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData.user) return res.status(401).json({ error: "Unauthorized" });
  const userId = userData.user.id;
  await supabase.from("chats").delete().eq("user_id", userId);
  await supabaseAdmin.from("profiles").delete().eq("id", userId);
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.get("/auth/oauth/:provider", async (req, res) => {
  const { provider } = req.params;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${process.env.SITE_URL || "https://nova-ai-mk9x.onrender.com"}/auth/callback` }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.redirect(data.url);
});

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

app.post("/auth/signup", async (req, res) => {
  const { email, password, name, phone } = req.body;
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { name, phone } }
  });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ user: data.user, session: data.session });
});

// --- CHATS ---
app.post("/chats", async (req, res) => {
  const { id, title, history, author } = req.body;
  const authHeader = req.headers.authorization;
  const token = req.body.token || (authHeader && authHeader.split(" ")[1]);
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const userId = getUserIdFromToken(token);
    if (!userId) return res.status(401).json({ error: "Invalid token" });
    const { error } = await supabaseAdmin.from("chats").upsert({
      id, user_id: userId, title, history, author,
      created_at: new Date().toISOString()
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Something went wrong" });
  }
});

app.get("/chats", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { data, error } = await supabase.from("chats")
    .select("*").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ chats: data });
});

app.delete("/chats/:id", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { error } = await supabase.from("chats").delete().eq("id", req.params.id).eq("user_id", user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.delete("/chats", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { error } = await supabase.from("chats").delete().eq("user_id", user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// --- SELF KEEP-ALIVE ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const SELF_URL = process.env.SITE_URL || "https://nova-ai-mk9x.onrender.com";
function selfPing() {
  fetch(`${SELF_URL}/ping`)
    .then((res) => console.log(`Self-ping OK (${res.status})`))
    .catch((err) => console.warn("Self-ping failed:", err.message));
}
setInterval(selfPing, 5 * 60 * 1000);
