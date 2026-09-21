document.addEventListener("DOMContentLoaded", () => {
  // addGreeting(), addMsg() and the image-request parser live in render.js

  // ------------------------------------------------------------------
  //  Attachment limits (change these if you like)
  // ------------------------------------------------------------------
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // photos are shrunk before sending
  const MAX_FILE_BYTES = 300 * 1024;        // biggest code/text file you can attach
  const MAX_FILE_CHARS = 40000;             // characters of one file sent to the AI (~10k tokens)
  const MAX_TOTAL_CHARS = 80000;            // characters across all files in one message
  const MAX_FILES = 5;

  // Code / text files the AI can read
  const TEXT_EXTS = new Set((
    "txt md markdown rst tex log csv tsv json jsonl ipynb yaml yml toml ini cfg conf env properties " +
    "py pyw js mjs cjs jsx ts tsx vue svelte html htm css scss sass less xml svg " +
    "java kt kts scala groovy gradle c h cpp cc cxx hpp cs go rs rb php swift m mm dart lua pl r jl hs ex exs erl clj " +
    "sh bash zsh fish ps1 bat cmd sql graphql proto gitignore dockerfile makefile cmake"
  ).split(" "));
  const TEXT_NAMES = new Set(["dockerfile", "makefile", "cmakelists.txt", ".gitignore", ".env", ".env.example"]);

  function fileExt(name) {
    const i = name.lastIndexOf(".");
    return i === -1 ? "" : name.slice(i + 1).toLowerCase();
  }
  function isTextFile(file) {
    if (TEXT_EXTS.has(fileExt(file.name)) || TEXT_NAMES.has(file.name.toLowerCase())) return true;
    return /^text\//.test(file.type) || /^application\/(json|javascript|xml|x-sh|x-yaml|toml)/.test(file.type);
  }

  const toast = msg => { if (typeof showToast === "function") showToast(msg); };

  // --- Image compression (shrinks photos so uploads stay small and fast) ---
  function compressImage(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 1024;
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) { if (w > h) { h = (h/w)*maxSize; w = maxSize; } else { w = (w/h)*maxSize; h = maxSize; } }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";           // transparent PNGs would otherwise turn black
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => { toast("Failed to load image"); resolve(null); };
        img.src = e.target.result;
      };
      reader.onerror = () => { toast("Failed to read file"); resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  // ------------------------------------------------------------------
  //  Attachments (one image + up to MAX_FILES code/text files)
  // ------------------------------------------------------------------
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  const previewArea = document.getElementById("preview-area");
  const attachList = document.getElementById("attach-list");

  let pendingImageBase64 = null;
  let pendingImageType = null;
  let pendingFiles = []; // { name, text, truncated }

  if (fileInput) {
    fileInput.multiple = true;
    fileInput.accept = "image/*,text/*," + [...TEXT_EXTS].map(e => "." + e).join(",");
  }

  function renderAttachments() {
    if (!attachList || !previewArea) return;
    attachList.innerHTML = "";

    if (pendingImageBase64) {
      const chip = document.createElement("div");
      chip.className = "attach-chip attach-image";
      const img = document.createElement("img");
      img.src = `data:${pendingImageType};base64,${pendingImageBase64}`;
      img.alt = "Attached image";
      const x = document.createElement("button");
      x.type = "button"; x.className = "attach-x"; x.title = "Remove image"; x.textContent = "✕";
      x.addEventListener("click", () => { pendingImageBase64 = null; pendingImageType = null; renderAttachments(); });
      chip.append(img, x);
      attachList.appendChild(chip);
    }

    pendingFiles.forEach((f, i) => {
      const chip = document.createElement("div");
      chip.className = "attach-chip";
      chip.innerHTML = '<i class="fa-solid fa-file-code"></i>';
      const name = document.createElement("span");
      name.className = "attach-name"; name.textContent = f.name;
      const meta = document.createElement("span");
      meta.className = "attach-meta";
      meta.textContent = f.truncated ? "truncated" : `${f.text.length.toLocaleString()} chars`;
      const x = document.createElement("button");
      x.type = "button"; x.className = "attach-x"; x.title = "Remove file"; x.textContent = "✕";
      x.addEventListener("click", () => { pendingFiles.splice(i, 1); renderAttachments(); });
      chip.append(name, meta, x);
      attachList.appendChild(chip);
    });

    previewArea.style.display = (pendingImageBase64 || pendingFiles.length) ? "flex" : "none";
  }

  function clearAttachments() {
    pendingImageBase64 = null; pendingImageType = null; pendingFiles = [];
    if (fileInput) fileInput.value = "";
    renderAttachments();
  }

  async function addImage(file) {
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast(`"${file.name}" isn't a supported image (use JPG, PNG, WEBP or GIF)`); return;
    }
    if (file.size > MAX_IMAGE_BYTES) { toast(`"${file.name}" is too large. Max image size is 10MB`); return; }
    const compressed = await compressImage(file);
    if (!compressed) return;
    pendingImageBase64 = compressed.split(",")[1];
    pendingImageType = "image/jpeg";
  }

  async function addTextFile(file) {
    if (pendingFiles.length >= MAX_FILES) { toast(`You can attach up to ${MAX_FILES} files at once`); return; }
    if (file.size > MAX_FILE_BYTES) { toast(`"${file.name}" is too large (max ${Math.round(MAX_FILE_BYTES / 1024)} KB)`); return; }
    let text;
    try { text = await file.text(); } catch { toast(`Couldn't read "${file.name}"`); return; }
    if (text.includes("\u0000")) { toast(`"${file.name}" looks like a binary file, so I can't read it`); return; }
    if (!text.trim()) { toast(`"${file.name}" is empty`); return; }

    const used = pendingFiles.reduce((n, f) => n + f.text.length, 0);
    let truncated = false;
    if (text.length > MAX_FILE_CHARS) { text = text.slice(0, MAX_FILE_CHARS); truncated = true; }
    if (used + text.length > MAX_TOTAL_CHARS) { toast("Those files are too big to send together. Try fewer or smaller files"); return; }
    pendingFiles.push({ name: file.name, text, truncated });
    if (truncated) toast(`"${file.name}" is long, so only the first ${MAX_FILE_CHARS.toLocaleString()} characters will be sent`);
  }

  if (uploadBtn && fileInput) {
    uploadBtn.title = "Attach an image or code file";
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const files = [...fileInput.files];
      fileInput.value = "";
      if (!files.length) return;
      for (const file of files) {
        if (file.type.startsWith("image/")) await addImage(file);
        else if (isTextFile(file)) await addTextFile(file);
        else toast(`"${file.name}" isn't supported. Attach an image or a code/text file`);
      }
      renderAttachments();
    });
  }

  // --- Voice input setup ---
  let recognition = null;
  let isRecording = false;
  const micBtn = document.getElementById("mic-btn");

  if (micBtn && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    
    recognition.onstart = () => {
      micBtn.classList.add("recording");
      isRecording = true;
      if (typeof showToast === 'function') showToast('<i class="fa-solid fa-microphone"></i> Listening...');
    };
    
    recognition.onresult = (e) => {
      const inputEl = document.getElementById("input");
      if (e.results && e.results.length > 0 && inputEl) {
        const transcript = e.results[e.results.length - 1][0].transcript;
        inputEl.value = transcript;
        if (typeof showToast === 'function') showToast('<span class="toast-success"><i class="fa-solid fa-circle-check"></i> Got it!</span>');
      }
      micBtn.classList.remove("recording");
      isRecording = false;
    };
    
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
      if (typeof showToast === 'function') {
        switch (e.error) {
          case "aborted": showToast('Listening cancelled'); break;
          case "no-speech": showToast('Didn\'t catch that — try again'); break;
          case "not-allowed": showToast('Microphone access is blocked'); break;
          default: showToast(`Error: ${e.error}`);
        }
      }
      micBtn.classList.remove("recording");
      isRecording = false;
    };
    
    recognition.onend = () => {
      micBtn.classList.remove("recording");
      isRecording = false;
    };

    micBtn.addEventListener("click", () => {
      if (!recognition) return;
      if (isRecording) {
        recognition.stop();
        return;
      }
      try {
        recognition.start();
      } catch (e) {
        console.error("Error starting recognition:", e);
      }
    });
  }

  // --- Send Message & Core Logic ---
  const btn = document.getElementById("send");
  const input = document.getElementById("input");
  const chatEl = document.getElementById("chat");
  let sending = false;

  // "Thinking..." placeholder (same look as an AI reply, no bubble)
  function addThinking(label) {
    const wrap = document.createElement("div");
    wrap.className = "msg-wrap ai";
    const t = document.createElement("div");
    t.className = "ai-text thinking";
    t.textContent = label;
    wrap.appendChild(t);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    return { wrap, text: t };
  }

  // History as the server should see it. Generated images are just a URL in our
  // history, so the AI is told about them in words instead.
  const GENERATED_IMG = /^!\[([^\]]*)\]\(https:\/\/image\.pollinations\.ai\/[^)]*\)$/;
  function messagesForServer() {
    return history.map(m => {
      if (m.role === "assistant" && typeof m.content === "string") {
        const g = m.content.match(GENERATED_IMG);
        if (g) return { role: "assistant", content: `[Nova generated an image for the prompt: "${g[1]}"]` };
      }
      return m;
    });
  }

  async function generateImage(typed, prompt) {
    addMsg("user", typed);
    history.push({ role: "user", content: typed });
    input.value = "";

    if (!prompt) {
      const tip = "What should the image show? Describe it and I'll create it, for example: **/image a red sports car on a beach at sunset**";
      addMsg("ai", tip);
      history.push({ role: "assistant", content: tip });
      if (typeof saveCurrentChat === "function") saveCurrentChat();
      return;
    }

    const thinking = addThinking("Creating your image...");
    try {
      const res = await fetch(`${BACKEND_URL}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      thinking.wrap.remove();
      if (!data.imageUrl) { addMsg("ai", data.error || "Image generation failed. Please try again."); return; }
      const alt = prompt.replace(/[\[\]\r\n]+/g, " ").slice(0, 200);
      const url = data.imageUrl.replace(/\(/g, "%28").replace(/\)/g, "%29");
      const md = `![${alt}](${url})`;
      addMsg("ai", md);
      history.push({ role: "assistant", content: md });
      if (typeof saveCurrentChat === "function") saveCurrentChat();
    } catch {
      thinking.text.classList.remove("thinking");
      thinking.text.textContent = "Error reaching the server. Is your backend running?";
    }
  }

  async function sendMessage() {
    if (sending) return;
    const typed = input.value.trim();
    const hasImage = !!pendingImageBase64;
    const files = pendingFiles.slice();
    if (!typed && !hasImage && !files.length) return;

    sending = true;
    btn.disabled = true;
    try {
      // 1) Is the user asking for an image to be created?
      if (!hasImage && !files.length) {
        const req = NovaRender.parseImageRequest(typed);
        if (req) { await generateImage(typed, req.prompt); return; }
      }

      // 2) Normal chat, possibly with an image and/or code files attached
      let modelText = typed;
      if (files.length) {
        const blocks = files.map(f =>
          `<attached_file name="${f.name.replace(/"/g, "'")}">\n${f.text.replace(/<\/attached_file>/g, "<\\/attached_file>")}${f.truncated ? "\n[...file truncated...]" : ""}\n</attached_file>`
        ).join("\n\n");
        const ask = typed || (hasImage ? "" : "Analyze the attached file(s): explain what the code does and point out any bugs or improvements.");
        modelText = blocks + (ask ? "\n\n" + ask : "");
      } else if (!typed && hasImage) {
        modelText = "Describe this image.";
      }

      const imgSrc = hasImage ? `data:${pendingImageType};base64,${pendingImageBase64}` : null;
      addMsg("user", modelText, imgSrc);

      const userContent = [];
      if (imgSrc) userContent.push({ type: "image_url", image_url: { url: imgSrc } });
      userContent.push({ type: "text", text: modelText });
      history.push({ role: "user", content: imgSrc ? userContent : modelText });

      input.value = "";
      clearAttachments();
      const thinking = addThinking(imgSrc ? "Looking at your image..." : "Thinking...");

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messagesForServer() }),
        });
        const data = await res.json();
        const reply = data.reply || data.error || "Something went wrong.";

        thinking.wrap.remove();
        addMsg("ai", reply);

        if (data.reply) history.push({ role: "assistant", content: reply });
        if (typeof saveCurrentChat === "function") saveCurrentChat();
      } catch {
        thinking.text.classList.remove("thinking");
        thinking.text.textContent = "Error reaching the server. Is your backend running?";
      }
    } finally {
      sending = false;
      btn.disabled = false;
    }
  }

  if (btn && input) {
    btn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});
