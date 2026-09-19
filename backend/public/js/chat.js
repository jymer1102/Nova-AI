document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("send");
  const inputEl = document.getElementById("input");
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  const micBtn = document.getElementById("mic-btn");

  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", async () => {
      const text = inputEl.value.trim();
      if (!text) return;
      
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
          // data.reply can be a string (markdown text) or an object (chart/table)
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
    uploadBtn.addEventListener("click", () => fileInput.click());
  }

  if (micBtn) {
    micBtn.addEventListener("click", () => alert("Voice input is initializing..."));
  }
});

function addMsg(role, content) {
  const chatEl = document.getElementById("chat");
  if (!chatEl) return;
  
  const div = document.createElement("div");
  div.className = `msg ${role}`;

  // 1. Handle Structured Data (Charts or Tables)
  if (typeof content === "object" && content !== null) {
    if (content.type === "table") {
      div.appendChild(createTable(content.data));
    } else if (["bar", "line", "pie", "doughnut", "radar"].includes(content.type)) {
      const canvas = document.createElement("canvas");
      div.appendChild(canvas);
      chatEl.appendChild(div);
      chatEl.scrollTop = chatEl.scrollHeight;

      new Chart(canvas, {
        type: content.type,
        data: content.data,
        options: content.options || { responsive: true, maintainAspectRatio: false }
      });
      return; 
    }
  } 
  // 2. Handle Standard Text (Rendered via Marked.js for Markdown support)
  else {
    div.innerHTML = marked.parse(content);
  }

  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}

// Helper to build HTML tables
function createTable(tableInfo) {
  const table = document.createElement("table");
  table.className = "chat-table";
  
  const trHead = document.createElement("tr");
  tableInfo.headers.forEach(headerText => {
    const th = document.createElement("th");
    th.textContent = headerText;
    trHead.appendChild(th);
  });
  table.appendChild(trHead);

  tableInfo.rows.forEach(rowData => {
    const tr = document.createElement("tr");
    rowData.forEach(cellText => {
      const td = document.createElement("td");
      td.textContent = cellText;
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });

  return table;
}
