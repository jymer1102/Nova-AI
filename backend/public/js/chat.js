document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("send");
  const inputEl = document.getElementById("input");
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-btn");
  const chatEl = document.getElementById("chat");
  const previewArea = document.getElementById("preview-area");
  const previewImg = document.getElementById("preview-img");
  const removeImgBtn = document.getElementById("remove-img");

  let selectedImageBase64 = null;

  // Handle Image Upload Selection
  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        selectedImageBase64 = uploadEvent.target.result;
        if (previewImg && previewArea) {
          previewImg.src = selectedImageBase64;
          previewArea.style.display = "flex";
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (removeImgBtn && previewArea) {
    removeImgBtn.addEventListener("click", () => {
      selectedImageBase64 = null;
      previewImg.src = "";
      previewArea.style.display = "none";
      fileInput.value = "";
    });
  }

  // Handle Send Button & Enter Key
  if (sendBtn && inputEl) {
    const handleSend = async () => {
      const text = inputEl.value.trim();
      if (!text && !selectedImageBase64) return;

      // Format user message correctly
      let userDisplayContent = text;
      if (selectedImageBase64) {
        userDisplayContent = `<img src="${selectedImageBase64}" style="max-width:200px;border-radius:8px;display:block;margin-bottom:5px;" />${text}`;
      }

      appendMessageToChat("user", userDisplayContent);
      
      // Store in global history array if it exists in your app context
      if (typeof history !== "undefined") {
        history.push({ role: "user", content: text || "[Image]" });
      }

      // Reset input fields
      inputEl.value = "";
      const currentImage = selectedImageBase64;
      selectedImageBase64 = null;
      if (previewArea) previewArea.style.display = "none";
      if (fileInput) fileInput.value = "";

      try {
        const token = localStorage.getItem("nova_token") || "";
        const res = await fetch(`${window.BACKEND_URL || ""}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ 
            messages: typeof history !== "undefined" ? history : [{ role: "user", content: text }] 
          })
        });

        const data = await res.json();
        if (data.reply) {
          appendMessageToChat("assistant", data.reply);
          if (typeof history !== "undefined") {
            history.push({ role: "assistant", content: data.reply });
          }
        } else if (data.error) {
          appendMessageToChat("assistant", "Error: " + data.error);
        }
      } catch (err) {
        console.error(err);
        appendMessageToChat("assistant", "Something went wrong connecting to the server.");
      }
    };

    sendBtn.addEventListener("click", handleSend);
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });
  }

  // Mic placeholder behavior
  if (micBtn) {
    micBtn.addEventListener("click", () => {
      alert("Voice input is ready to configure.");
    });
  }
});

// Helper to render messages using standard UI classes
function appendMessageToChat(role, content) {
  const chatEl = document.getElementById("chat");
  if (!chatEl) return;

  const msgDiv = document.createElement("div");
  // Assigns correct distinct classes for left/right alignment via CSS
  msgDiv.className = role === "user" ? "message user-message" : "message assistant-message";

  const contentDiv = document.createElement("div");
  contentDiv.className = "message-body";

  if (role === "assistant" && window.marked) {
    contentDiv.innerHTML = marked.parse(content);
  } else if (role === "user" && content.includes("<img")) {
    contentDiv.innerHTML = content;
  } else {
    contentDiv.textContent = content;
  }

  msgDiv.appendChild(contentDiv);
  chatEl.appendChild(msgDiv);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Global helper fallback if other scripts call addMsg
function addMsg(role, content) {
  appendMessageToChat(role, content);
}
