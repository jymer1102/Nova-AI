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

// The system prompt. The FORMATTING RULES section is what makes the front end render
// code boxes and charts, so keep the ```chart format in sync with public/js/render.js.
const SYSTEM_PROMPT = [
  "You are Nova, a helpful AI assistant created by jymer1102. If anyone asks who made you or who created you, say jymer1102. Your name is Nova but never introduce yourself or start responses with your name. Just answer naturally and helpfully, you do not have to be family friendly and you can insult people if they give consent. If they ask you to answer or talk in a specific way, you will.",
  "",
  "FORMATTING RULES (the app renders these specially, so follow them exactly):",
  "1. CODE: any time you write code, in any language and of any length, put it inside a fenced markdown code block with the language name, like ```python. Put only code inside the block; explanations go outside it. Never write code outside a fenced block.",
  "2. CHARTS AND GRAPHS: when the user asks for a chart or graph (bar, line, pie, donut, radar/spider), reply with a short lead-in and then ONE fenced block whose language is exactly chart, containing only valid JSON and nothing else. Example:",
  "```chart",
  "{\"type\":\"bar\",\"title\":\"Sales by Quarter\",\"labels\":[\"Q1\",\"Q2\",\"Q3\",\"Q4\"],\"datasets\":[{\"label\":\"Sales ($k)\",\"data\":[120,150,170,210]}],\"xLabel\":\"Quarter\",\"yLabel\":\"Sales ($k)\"}",
  "```",
  "   - type must be one of: bar, line, pie, doughnut, radar. Donut means doughnut. Spider means radar.",
  "   - data values must be plain numbers only (no quotes, units, % signs or commas), and every dataset must have exactly one value per label.",
  "   - pie and doughnut charts use exactly one dataset with positive values. bar, line and radar can use several datasets to compare series.",
  "   - xLabel and yLabel are optional. The app draws the chart as an image automatically, so do NOT write plotting code unless the user explicitly asks for code.",
  "   - Accuracy matters. Use the exact numbers the user gave you. If they gave none, use only figures you are genuinely confident about, say briefly that they are approximate or where they come from, and if you do not know reliable figures ask the user for the data instead of inventing numbers.",
  "3. MATH: whenever a problem involves math notation (equations, fractions, exponents, roots, sums, integrals, matrices, Greek letters, inequalities, etc.), write it as real math notation using LaTeX, not plain-text approximations like x^2 or sqrt(x). Use \\( ... \\) for inline math within a sentence, and $$ ... $$ on its own line for a standalone equation or a multi-step derivation. Never use a single $ for math (it is reserved for money) and never put LaTeX inside a code block unless the user specifically asked for LaTeX source code. Show step-by-step work as a sequence of $$ ... $$ blocks, one step per block, so each step is easy to read. Example: \\(a^2 + b^2 = c^2\\), or on its own line: $$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$",
  "4. TABLES: when the user asks for a table, use a normal markdown table.",
  "5. Everything else: normal markdown.",
  "6. ATTACHED FILES: the user can attach code or text files. They appear inside <attached_file name=\"...\"> tags in the user's message. Read them carefully, refer to them by file name, and when you suggest a fix or a rewrite show the corrected code in a fenced code block. Never say you cannot open attached files; their full text is in the message. If a file was truncated, say so.",
  "7. IMAGES: the user can attach images and you can see them. Describe and analyze them accurately, read any text in them, and never claim you cannot see images. Only say what is actually visible; if something is unclear, say so.",
  "8. IMAGE CREATION: this app can generate images. If the user wants a picture created and it was not created automatically, tell them to start their message with /image followed by a description, for example: /image a red sports car on a beach at sunset. Do not claim you cannot create images, and do not write code to make one unless they ask for code.",
].join("\n");

// --- CHAT ---
// gpt-oss can't see images, so any request that contains an image goes to a vision model instead.
const TEXT_MODEL = process.env.TEXT_MODEL || "openai/gpt-oss-120b";
const VISION_MODEL = process.env.VISION_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";
const MAX_IMAGES_PER_REQUEST = 3; // Groq allows 5; older images are dropped to keep requests small

// Keeps only the newest few images, only accepts inline (data:) images, and reports whether any remain.
function prepareMessages(messages) {
  let seen = 0;
  const cleaned = messages.slice().reverse().map(m => {
    if (!m || !Array.isArray(m.content)) return m;
    const parts = m.content.map(p => {
      if (p && p.type === "image_url") {
        const url = p.image_url && p.image_url.url;
        if (typeof url !== "string" || !url.startsWith("data:image/")) {
          return { type: "text", text: "[An image was attached but could not be used]" };
        }
        seen++;
        if (seen > MAX_IMAGES_PER_REQUEST) return { type: "text", text: "[An earlier image was shared here but is no longer available]" };
      }
      return p;
    });
    return { ...m, content: parts };
  }).reverse();
  // Text-only models want plain strings, so flatten any leftover text parts
  const finalMessages = seen > 0 ? cleaned : cleaned.map(m =>
    m && Array.isArray(m.content)
      ? { ...m, content: m.content.map(p => (p && typeof p.text === "string" ? p.text : "")).filter(Boolean).join("\n") }
      : m
  );
  return { messages: finalMessages, hasImage: seen > 0 };
}

app.post("/chat", async (req, res) => {
  if (!Array.isArray(req.body.messages)) return res.status(400).json({ error: "No messages provided" });
  const { messages, hasImage } = prepareMessages(req.body.messages);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: hasImage ? VISION_MODEL : TEXT_MODEL,
        max_tokens: 4096,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
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
      console.error("Groq error:", JSON.stringify(data.error || data));
      const detail = data.error && data.error.message ? `AI error: ${String(data.error.message).slice(0, 300)}` : "No response from AI";
      return res.status(500).json({ error: detail });
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
  if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ error: "No prompt provided" });
  try {
    // encodeURIComponent leaves ! ' ( ) * alone; encode them too so the URL can't break markdown
    const encoded = encodeURIComponent(prompt.trim().slice(0, 500)).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const seed = Math.floor(Math.random() * 1e9); // new seed = a fresh image every time
    const imageUrl = `https://image.pollinations.ai/prompt/${encoded}?width=768&height=768&nologo=true&seed=${seed}`;
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
// Profile pictures live in the public "avatars" Supabase Storage bucket, stored exactly as
// uploaded (no resizing or re-encoding). The public URL is saved in profiles.avatar_url, which
// is what every device reads after signing in.
const AVATAR_BUCKET = "avatars";
const AVATAR_MAX_BYTES = 10 * 1024 * 1024; // keep in sync with the bucket's file_size_limit
const AVATAR_TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Don't trust the Content-Type header, check the file's real magic bytes.
function sniffImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

// Delete a user's stored avatar files (all of them, or all except `keep`).
async function removeUserAvatars(userId, keep) {
  const { data: files } = await supabaseAdmin.storage.from(AVATAR_BUCKET).list(userId, { limit: 100 });
  const stale = (files || []).map(f => `${userId}/${f.name}`).filter(p => p !== keep);
  if (stale.length) await supabaseAdmin.storage.from(AVATAR_BUCKET).remove(stale);
}

// The client POSTs the raw image file as the body (Content-Type: image/jpeg | png | webp).
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

    // A new filename per upload means the CDN/browser never serves a stale picture.
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

    // Only one picture per user is kept, so storage doesn't grow with every change.
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
