document.addEventListener("DOMContentLoaded", () => {
  // --- Greeting ---
  function addGreeting() {
    const name = localStorage.getItem("nova_name");
    const greeting = `Hi${name ? ` ${name}` : ""}! I'm Nova, your personal AI assistant by jymer1102. How can I help you?`;
    addMsg("ai", greeting);
    if (typeof history !== 'undefined') {
      history.push({ role: "assistant", content: greeting });
    }
  }

  // --- Image compression ---
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
          if (typeof showToast === 'function') showToast("Failed to load image");
          resolve(null);
        };
        img.src = e.target.result;
      };
      reader.onerror = () => {
        if (typeof showToast === 'function') showToast("Failed to read file");
        resolve(null);
      };
      reader.readAsDataURL(file);
    });
  }

  // --- Image upload setup ---
  const uploadBtn = document.getElementById("uploadBtn");
  const fileInput = document.getElementById("fileInput");
  const previewArea = document.getElementById("previewArea");
  const previewImg = document.getElementById("previewImg");
  const removeImgBtn = document.getElementById("removeImgBtn");

  let pendingImageBase64 = null;
  let pendingImageType = null;

  function clearImage() { 
    pendingImageBase64 = null; 
    pendingImageType = null; 
    if (previewArea) previewArea.style.display = "none"; 
    if (previewImg) previewImg.src = ""; 
    if (fileInput) fileInput.value = ""; 
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = fileInput.files[0];
      if (!file) return;
      
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!validTypes.includes(file.type)) {
        if (typeof showToast === 'function') showToast("Please upload a valid image file");
        fileInput.value = "";
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast("File is too large. Max size is 10MB");
        fileInput.value = "";
        return;
      }
      
      if (typeof showToast === 'function') showToast("Processing image...");
      const compressed = await compressImage(file);
      
      if (!compressed) {
        fileInput.value = "";
        return;
      }
      
      pendingImageBase64 = compressed.split(",")[1];
      pendingImageType = "image/jpeg";
      if (previewImg) previewImg.src = compressed;
      if (previewArea) previewArea.style.display = "flex";
      fileInput.value = "";
      if (typeof showToast === 'function') showToast("Image ready!");
    });
  }

  if (removeImgBtn) {
    removeImgBtn.addEventListener("click", clearImage);
  }

  // --- Voice input setup ---
  let recognition = null;
  let isRecording = false;
  const micBtn = document.getElementById("micBtn");

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

  if (btn && input) {
    async function sendMessage() {
      const text = input.value.trim();
      if (!text && !pendingImageBase64) return;
      
      const imgSrc = pendingImageBase64 ? `data:${pendingImageType};base64,${pendingImageBase64}` : null;
      addMsg("user", text, imgSrc);
      
      const userContent = [];
      if (pendingImageBase64) userContent.push({ type:"image_url", image_url:{ url:`data:${pendingImageType};base64,${pendingImageBase64}` } });
      if (text) userContent.push({ type:"text", text });
      
      if (typeof history !== 'undefined') {
        history.push({ role:"user", content: userContent.length===1 && userContent[0].type==="text" ? text : userContent });
      }
      
      input.value = ""; 
      clearImage(); 
      btn.disabled = true;

      const wrap = document.createElement("div"); 
      wrap.className = "msg-wrap ai";
      const thinking = document.createElement("div"); 
      thinking.className = "ai-text-content-transparent"; 
      thinking.style.background = "transparent";
      thinking.textContent = "Thinking...";
      wrap.appendChild(thinking); 
      if (chatEl) {
        chatEl.appendChild(wrap); 
        chatEl.scrollTop = chatEl.scrollHeight;
      }

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, { 
          method:"POST", 
          headers:{"Content-Type":"application/json"}, 
          body:JSON.stringify({ messages: typeof history !== 'undefined' ? history : [{ role: "user", content: text }] }) 
        });
        const data = await res.json();
        const reply = data.reply || data.error || "Something went wrong.";
        
        wrap.remove();
        addMsg("ai", reply);
        
        if (data.reply && typeof history !== 'undefined') history.push({ role:"assistant", content:reply });
        if (typeof saveCurrentChat === 'function') saveCurrentChat();
      } catch { 
        thinking.textContent = "Error reaching the server. Is your backend running?"; 
      }
      btn.disabled = false;
    }

    btn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", e => { 
      if (e.key === "Enter" && !e.shiftKey) { 
        e.preventDefault(); 
        sendMessage(); 
      } 
    });
  }
});
