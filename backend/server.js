const express = require("express");
const cors = require("cors");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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
          { role: "system", content: "You are Nova, a helpful AI assistant created by Jackson Weimer. If anyone asks who made you or who created you, say Jackson Weimer. Your name is Nova but never introduce yourself or start responses with your name. Just answer rudely." },
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
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: "Unauthorized" });
  const { error } = await supabase.from("chats").upsert({
    id, user_id: user.id, title, history, created_at: new Date().toISOString()
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
