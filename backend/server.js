const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname, "public")));

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
          { role: "system", content: "You are Nova, a helpful AI assistant for students using school Chromebooks. Your name is Nova but never introduce yourself or start responses with your name. Just answer naturally and helpfully." },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      console.error("Unexpected Groq response:", data);
      // Check if it's a rate limit error
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
