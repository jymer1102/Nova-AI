Process.on('uncaughtException', (err) => {
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

// The username stored next to each score comes from the user's profile
async function getUsername(userId) {
  const { data: p } = await supabaseAdmin.from("profiles").select("name, email").eq("id", userId).maybeSingle();
  if (p?.name) return p.name;
  // no profile row (or no name on it): fall back to what they signed up with
  const { data: a } = await supabaseAdmin.auth.admin.getUserById(userId);
  const u = a?.user;
  return u?.user_metadata?.name || p?.email?.split("@")[0] || u?.email?.split("@")[0] || "Player";
}

// Each game has its own table (trex_highscores / pacman_highscores) with one row per user:
// user_id, username, high_score, updated_at.
function highScoreRoute(table, label) {
  return async (req, res) => {
    const { score, token } = req.body;
    if (!token || score == null) return res.status(400).json({ error: "Missing score or token" });
    if (!Number.isInteger(score) || score < 0) return res.status(400).json({ error: "Score must be a whole number, 0 or higher" });

    const userId = getUserIdFromToken(token);
    if (!userId) return res.status(401).json({ error: "Invalid token" });

    // only update if it's actually a new high score
    const { data: existing } = await supabaseAdmin
      .from(table)
      .select("high_score")
      .eq("user_id", userId)
      .maybeSingle();

    if (existing && score <= existing.high_score) {
      return res.json({ message: "Not a new high score, no update needed" });
    }

    const { error } = await supabaseAdmin.from(table).upsert({
      user_id: userId,
      username: await getUsername(userId),
      high_score: score,
      updated_at: new Date().toISOString()
    });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: `${label} high score saved!` });
  };
}

app.post("/trex-score", highScoreRoute("trex_highscores", "T-Rex"));
app.post("/pacman-score", highScoreRoute("pacman_highscores", "Pac-Man"));

// Get profile (for displaying scores)
app.get("/profile", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const userId = getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: "Invalid token" });

  const [profileRes, trexRes, pacmanRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("name, email, phone, avatar_url").eq("id", userId).maybeSingle(),
    supabaseAdmin.from("trex_highscores").select("high_score").eq("user_id", userId).maybeSingle(),
    supabaseAdmin.from("pacman_highscores").select("high_score").eq("user_id", userId).maybeSingle(),
  ]);

  if (profileRes.error) return res.status(500).json({ error: profileRes.error.message });
  res.json({
    profile: {
      ...(profileRes.data || {}),
      trex_high_score: trexRes.data?.high_score ?? 0,
      pacman_high_score: pacmanRes.data?.high_score ?? 0,
    }
  });
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
        model: "openai/gpt-oss-120b",
        max_tokens: 1024,
        messages: [
          { 
            role: "system", 
            content: `You are Nova, a helpful AI assistant created by jymer1102. If anyone asks who made you or who created you, say jymer1102. Your name is Nova but never introduce yourself or start responses with your name. Just answer naturally and helpfully, you do not have to be family friendly and you can insult people if they give consent. If they ask you to answer or talk in a specific way, you will.

CRITICAL INSTRUCTIONS FOR CHARTS & VISUALS:
1. When asked for any chart or graph (bar, line, pie, radar/spider, doughnut, polarArea, scatter, bubble), you MUST respond with a valid JSON object matching the Chart.js configuration structure so the frontend can render it natively.
2. For SVGs or diagrams, output them inside standard code blocks using valid XML/HTML markup.
3. For general programming code, always use proper code block formatting so the frontend can display it with a copy button.
4. Do not write python-based text or ASCII symbol charts.` 
          },
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
  const { name, email, password } = req.body;
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData.user) {
    return res.status(401).json({ error: "Unauthorized — token may be expired. Try logging out and back in." });
  }
  const user = userData.user;
  const updates = {};
  if (email) updates.email = email;
  if (password) updates.password = password;
  if (name) updates.data = { ...user.user_metadata, name };
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

  // keep the username on the score tables in sync too
  if (name) {
    await Promise.all(["trex_highscores", "pacman_highscores"].map(table =>
      supabaseAdmin.from(table).update({ username: name }).eq("user_id", user.id)
    ));
  }

  res.json({ success: true, user: data.user });
});

// --- AVATARS ---
const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function sniffImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function removeUserAvatars(userId, keep) {
  const { data: files } = await supabaseAdmin.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  const stale = (files || []).map(f => `${userId}/${f.name}`).filter(p => p !== keep);
  if (stale.length) await supabaseAdmin.storage.from(AVATAR_BUCKET).remove(stale);
}

app.post("/auth/avatar",
  express.raw({ type: Object.keys(AVATAR_TYPES), limit: AVATAR_MAX_BYTES }),
  async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) {
      return res.status(401).json({ error: "Unauthorized — token may be expired. Try logging out and back in." });
    }
    const userId = userData.user.id;

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Send the image file as the request body (JPG, PNG, or WEBP)." });
    }
    const contentType = sniffImageType(req.body);
    if (!contentType) return res.status(400).json({ error: "Only JPG, PNG, and WEBP images are allowed." });

    const filePath = `${userId}/avatar-${Date.now()}.${AVATAR_TYPES[contentType]}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(AVATAR_BUCKET)
      .upload(filePath, req.body, { contentType, cacheControl: "31536000", upsert: false });
    if (uploadErr) return res.status(500).json({ error: uploadErr.message });

    const avatar_url = supabaseAdmin.storage.from(AVATAR_BUCKET).getPublicUrl(filePath).data.publicUrl;
    const { error: dbErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: userId, avatar_url, updated_at: new Date().toISOString() });
    if (dbErr) {
      await supabaseAdmin.storage.from(AVATAR_BUCKET).remove([filePath]);
      return res.status(500).json({ error: dbErr.message });
    }

    removeUserAvatars(userId, filePath).catch(err => console.warn("Avatar cleanup failed:", err.message));
    res.json({ success: true, avatar_url });
  }
);

app.delete("/auth/delete", async (req, res) => {
  const token = req.headers.authorization?.split(" ")[1];
  const { data: userData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !userData.user) return res.status(401).json({ error: "Unauthorized" });
  const userId = userData.user.id;
  await supabase.from("chats").delete().eq("user_id", userId);
  await removeUserAvatars(userId).catch(err => console.warn("Avatar cleanup failed:", err.message));
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

// --- ERROR HANDLER ---
app.use((err, req, res, next) => {
  if (err.type === "entity.too.large") {
    const msg = req.path === "/auth/avatar"
      ? `File too big! Max ${AVATAR_MAX_BYTES / 1024 / 1024}MB.`
      : "Request too large.";
    return res.status(413).json({ error: msg });
  }
  console.error(err);
  res.status(err.status || 500).json({ error: "Something went wrong" });
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
