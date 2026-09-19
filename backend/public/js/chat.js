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

  // Image upload
  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (e) => {
    const file = fileInput.files[0];
    if (!file) return;
    
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      showToast("Please upload a valid image file (JPG, PNG, WebP, or GIF)");
      fileInput.value = "";
      return;
    }
    
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
    fileInput.value = "";
    showToast("Image ready!");
  });
  
  removeImgBtn.addEventListener("click", clearImage);
  function clearImage() { pendingImageBase64 = null; pendingImageType = null; previewArea.style.display = "none"; previewImg.src = ""; fileInput.value = ""; }

  // Voice input
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

  // File Download Helper
  function downloadTextFile(content, filename) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("File downloaded successfully!");
  }

  // Add message supporting genuine persistent interactive charts (Bar, Line, Pie, Radar/Spider)
  function addMsg(role, text, imgSrc = null) {
    const wrap = document.createElement("div");
    wrap.className = `msg-wrap ${role === "user" ? "user" : "ai"}`;
    
    const div = document.createElement("div"); 
    div.className = role === "user" ? "msg" : "ai-text-content";
    
    if (imgSrc) { 
      const img = document.createElement("img"); 
      img.src = imgSrc; 
      div.appendChild(img); 
    }
    
    const contentSpan = document.createElement("div");
    contentSpan.className = "msg-content-body";

    let chartData = null;
    try {
      let rawText = typeof text === "string" ? text.trim() : "";
      if (rawText.startsWith("```")) {
        rawText = rawText.replace(/^
