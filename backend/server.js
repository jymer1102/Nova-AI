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
          { role: "system", content: "You are Nova, a helpful AI assistant made by Jackson Weimer. Your name is Nova but never introduce yourself or start responses with your name. Just answer naturally and helpfully." },
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    if (!data.choices || !data.choices[0]) {
      console.error("Unexpected Groq response:", data);
      return res.status(500).json({ error: "No response from AI" });
    }

    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// TTS route using Google Cloud TTS
app.post("/tts", async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "No text provided" });

  try {
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: "en-US",
            name: "en-US-Journey-F", // smooth, natural female voice
          },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error("Google TTS error:", err);
      return res.status(500).json({ error: "TTS failed" });
    }

    const data = await response.json();
    const audioBuffer = Buffer.from(data.audioContent, "base64");
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
