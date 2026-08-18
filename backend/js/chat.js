// Greeting
  function addGreeting() {
    const name = localStorage.getItem("nova_name");
    const greeting = `Hi${name ? ` ${name}` : ""}! I'm Nova, your personal AI assistant by jymer1102. How can I help you?`;
    addMsg("ai", greeting);
    history.push({ role: "assistant", content: greeting });
  }

  // Image compression
  function compressImage(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 800;
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) { if (w > h) { h = (h/w)*maxSize; w = maxSize; } else { w = (w/h)*maxSize; h = maxSize; } }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d").drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        };
        img.onerror = () => {
          showToast("Failed to load image");
          resolve(null);
        };
        img.src = e.target.result;
      };
      reader.onerror = () => {
        showToast("Failed to read file");
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }

  // Image upload - FIXED
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = fileInput.files[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast("Please upload a valid image file (JPG, PNG, WebP, or GIF)");
      fileInput.value = "";
      return;
    }
    
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showToast("File is too large. Max size is 10MB");
      fileInput.value = "";
      return;
    }
    
    showToast("Processing image...");
    const compressed = await compressImage(file);
    
    if (!compressed) {
      fileInput.value = "";
      return;
    }
    
    pendingImageBase64 = compressed.split(",")[1];
    pendingImageType = "image/jpeg";
    previewImg.src = compressed;
    previewArea.style.display = "flex";
    fileInput.value = ""; // Reset input
    showToast("Image ready!");
  });
  
  removeImgBtn.addEventListener("click", clearImage);
  function clearImage() { pendingImageBase64 = null; pendingImageType = null; previewArea.style.display = "none"; previewImg.src = ""; fileInput.value = ""; }

  // Voice input - FIXED
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    
    recognition.onstart = () => {
      micBtn.classList.add("recording");
      isRecording = true;
      showToast('<i class="fa-solid fa-microphone"></i> Listening...');
    };
    
    recognition.onresult = (e) => {
      if (e.results && e.results.length > 0) {
        const transcript = e.results[e.results.length - 1][0].transcript;
        input.value = transcript;
        showToast('<span class="toast-success"><i class="fa-solid fa-circle-check"></i> Got it!</span>');
      }
      micBtn.classList.remove("recording");
      isRecording = false;
    };
    
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
      switch (e.error) {
        case "aborted":
          showToast('<i class="fa-solid fa-microphone-slash"></i> Listening cancelled');
          break;
        case "no-speech":
          showToast('<i class="fa-solid fa-volume-off"></i> Didn\'t catch that — try again');
          break;
        case "not-allowed":
          showToast('<i class="fa-solid fa-lock"></i> Microphone access is blocked — check your browser permissions');
          break;
        case "audio-capture":
          showToast('<i class="fa-solid fa-circle-exclamation"></i> No microphone found');
          break;
        case "network":
          showToast('<i class="fa-solid fa-wifi"></i> Connection issue — try again');
          break;
        default:
          showToast(`Error: ${e.error}`);
      }
      micBtn.classList.remove("recording");
      isRecording = false;
    };
    
    recognition.onend = () => {
      micBtn.classList.remove("recording");
      isRecording = false;
    };
  }
  
  micBtn.addEventListener("click", () => {
    if (!recognition) {
      showToast('<i class="fa-solid fa-triangle-exclamation"></i> Voice input not supported in your browser');
      return;
    }
    if (isRecording) {
      recognition.stop();
      return;
    }
    try {
      recognition.start();
    } catch (e) {
      console.error("Error starting recognition:", e);
      showToast("Could not start voice input");
    }
  });

  // TTS
  function speak(text) {
    if (!window.speechSynthesis) return;
    speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    const preferred = voices.find(v => ["Samantha","Karen","Moira","Fiona","Victoria","Allison","Ava"].includes(v.name)) || voices.find(v => v.lang === "en-US" && !v.name.includes("Google")) || voices[0];
    if (preferred) utt.voice = preferred;
    utt.rate = 0.95; utt.pitch = 1.05; utt.volume = 1;
    speechSynthesis.speak(utt);
  }

  // Add message
  function addMsg(role, text, imgSrc = null) {
    const wrap = document.createElement("div");
    wrap.className = `msg-wrap ${role === "user" ? "user" : "ai"}`;
    const div = document.createElement("div"); div.className = "msg";
    if (imgSrc) { const img = document.createElement("img"); img.src = imgSrc; div.appendChild(img); }
    const span = document.createElement("span"); span.textContent = text || ""; div.appendChild(span); wrap.appendChild(div);
    const actions = document.createElement("div"); actions.className = "msg-actions";
    const copyBtn = document.createElement("button"); copyBtn.className = "msg-action-btn"; copyBtn.innerHTML = '<i class="fa-solid fa-clipboard"></i> Copy';
copyBtn.addEventListener("click", () => { navigator.clipboard.writeText(text || ""); copyBtn.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> Copied'; copyBtn.classList.add("copied"); setTimeout(() => { copyBtn.innerHTML = '<i class="fa-solid fa-clipboard"></i> Copy'; copyBtn.classList.remove("copied"); }, 2000); });
    actions.appendChild(copyBtn);
    if (role === "ai") {
      const ttsBtn = document.createElement("button"); ttsBtn.className = "msg-action-btn"; ttsBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Listen';
      ttsBtn.addEventListener("click", () => speak(text)); actions.appendChild(ttsBtn);
    }
    wrap.appendChild(actions); chatEl.appendChild(wrap); chatEl.scrollTop = chatEl.scrollHeight;
    return span;
  }

  // Typing animation
  function typeText(span, text) {
    return new Promise(resolve => {
      const cursor = document.createElement("span"); cursor.className = "cursor"; span.appendChild(cursor);
      let i = 0;
      const interval = setInterval(() => {
        span.insertBefore(document.createTextNode(text[i]), cursor); i++;
        chatEl.scrollTop = chatEl.scrollHeight;
        if (i >= text.length) { clearInterval(interval); cursor.remove(); resolve(); }
      }, 15);
    });
  }

  // Image generation detection
  function isImageRequest(text) {
    const t = text.toLowerCase();
    const triggers = ["generate","create","make","draw","image of","picture of","photo of","show me"];
    return triggers.some(w => t.includes(w)) && (t.includes("image")||t.includes("picture")||t.includes("photo")||t.includes("draw")||t.includes("generate"));
  }
  function extractImagePrompt(text) { return text.replace(/generate|create|make|draw|show me|an image of|a picture of|a photo of|image of|picture of|photo of/gi,"").trim(); }

  // Send message
  async function sendMessage() {
    const text = input.value.trim();
    if (!text && !pendingImageBase64) return;
    const imgSrc = pendingImageBase64 ? `data:${pendingImageType};base64,${pendingImageBase64}` : null;
    addMsg("user", text, imgSrc);
    const userContent = [];
    if (pendingImageBase64) userContent.push({ type:"image_url", image_url:{ url:`data:${pendingImageType};base64,${pendingImageBase64}` } });
    if (text) userContent.push({ type:"text", text });
    history.push({ role:"user", content: userContent.length===1 && userContent[0].type==="text" ? text : userContent });
    input.value = ""; clearImage(); btn.disabled = true;

    // Save immediately
    const firstUserMsg = history.find(m => m.role === "user");
    if (firstUserMsg && userToken) {
      const title = typeof firstUserMsg.content === "string" ? firstUserMsg.content.slice(0,40) : "Image message";
      fetch(`${BACKEND_URL}/chats`, {
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":`Bearer ${userToken}`},
        body:JSON.stringify({ id:currentChatId, title, history }),
      }).then(() => loadChats()).catch(console.error);
    }

    const wrap = document.createElement("div"); wrap.className = "msg-wrap ai";
    const thinking = document.createElement("div"); thinking.className = "msg"; thinking.textContent = "Thinking...";
    wrap.appendChild(thinking); chatEl.appendChild(wrap); chatEl.scrollTop = chatEl.scrollHeight;

    if (text && isImageRequest(text) && !pendingImageBase64) {
      const prompt = extractImagePrompt(text);
      thinking.textContent = "Generating image...";
      try {
        const res = await fetch(`${BACKEND_URL}/generate-image`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ prompt }) });
        const data = await res.json();
        if (data.imageUrl) {
          thinking.innerHTML = "";
          const img = document.createElement("img"); img.src = data.imageUrl; img.style.cssText = "max-width:100%;border-radius:12px;display:block;"; img.alt = prompt;
          thinking.appendChild(img);
          const caption = document.createElement("span"); caption.innerHTML = `<i class="fa-solid fa-palette"></i> "${prompt}"`; caption.style.cssText = "display:block;margin-top:0.5rem;font-size:0.85rem;color:var(--text-muted);";
          thinking.appendChild(caption);
          history.push({ role:"assistant", content:`Here's an image of ${prompt}!` });
          saveCurrentChat();
        } else { thinking.textContent = "Couldn't generate image. Try a different prompt!"; }
      } catch { thinking.textContent = "Image generation failed. Try again!"; }
      btn.disabled = false; return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/chat`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ messages:history }) });
      const data = await res.json();
      const reply = data.reply || data.error || "Something went wrong.";
      thinking.innerHTML = "";
      const span = document.createElement("span"); thinking.appendChild(span);
      const actions = document.createElement("div"); actions.className = "msg-actions";
     const copyBtn = document.createElement("button"); copyBtn.className = "msg-action-btn"; copyBtn.innerHTML = '<i class="fa-solid fa-clipboard"></i> Copy';
copyBtn.addEventListener("click", () => { navigator.clipboard.writeText(reply); copyBtn.innerHTML = '<i class="fa-solid fa-clipboard-check"></i> Copied'; copyBtn.classList.add("copied"); setTimeout(() => { copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> Copy'; copyBtn.classList.remove("copied"); }, 2000); });
const ttsBtn = document.createElement("button"); ttsBtn.className = "msg-action-btn"; ttsBtn.innerHTML = '<i class="fa-solid fa-volume-high"></i> Listen';
      ttsBtn.addEventListener("click", () => speak(reply));
      actions.appendChild(copyBtn); actions.appendChild(ttsBtn); wrap.appendChild(actions);
      await typeText(span, reply);
      if (data.reply) history.push({ role:"assistant", content:reply });
      saveCurrentChat();
    } catch { thinking.textContent = "Error reaching the server. Is your backend running?"; }
    btn.disabled = false;
  }

  btn.addEventListener("click", sendMessage);
  input.addEventListener("keydown", e => { if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
