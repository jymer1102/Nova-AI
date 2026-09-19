document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("send");
  const inputEl = document.getElementById("input");
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-btn");
  const chatEl = document.getElementById("chat");

  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", async () => {
      const text = inputEl.value.trim();
      if (!text) return;
      
      // Append user message to chat UI
      addMsg("user", text);
      inputEl.value = "";

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`
          },
          body: JSON.stringify({ messages: [{ role: "user", content: text }] })
        });
        const data = await res.json();
        if (data.reply) {
          addMsg("assistant", data.reply);
        } else if (data.error) {
          addMsg("assistant", "Error: " + data.error);
        }
      } catch (err) {
        console.error(err);
        addMsg("assistant", "Something went wrong.");
      }
    });
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => {
      fileInput.click();
    });
  }

  if (micBtn) {
    micBtn.addEventListener("click", () => {
      alert("Voice input is initializing...");
    });
  }
});

function addMsg(role, content) {
  const chatEl = document.getElementById("chat");
  if (!chatEl) return;
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = content;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}
