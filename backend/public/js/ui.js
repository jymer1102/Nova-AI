// Logout
  logoutBtn.addEventListener("click", () => { if (!confirm("Log out?")) return; showAuth(); });

 // Theme Toggle
  themeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    
    isLight = !isLight;
    document.body.classList.toggle("light", isLight);
    document.documentElement.classList.toggle("light", isLight);
    themeBtn.innerHTML = isLight ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    
    localStorage.setItem("theme", isLight ? "light" : "dark");
    
    applyEaster();
  });

  // New chat (keeps the old behavior: saves the current chat, then starts fresh)
  newChatBtn.addEventListener("click", () => { saveCurrentChat(); history = []; chatEl.innerHTML = ""; currentChatId = Date.now().toString(); addGreeting(); });

  // Trash-can button: permanently deletes the CURRENT chat (not just clears the view)
  clearBtn.addEventListener("click", async () => {
    if (!confirm("Delete this chat? This can't be undone.")) return;
    if (userToken && currentChatId) {
      try {
        await fetch(`${BACKEND_URL}/chats/${currentChatId}`, { method: "DELETE", headers: { "Authorization": `Bearer ${userToken}` } });
      } catch { console.error("Failed to delete chat"); }
    }
    history = []; chatEl.innerHTML = ""; currentChatId = Date.now().toString(); addGreeting();
    if (sidebar.classList.contains("open")) await loadChats();
  });

  // Clear all chats
  clearAllBtn.addEventListener("click", async () => {
    if (!confirm("Delete all chat history? This can't be undone.")) return;
    await fetch(`${BACKEND_URL}/chats`, { method: "DELETE", headers: { "Authorization": `Bearer ${userToken}` } });
    history = []; chatEl.innerHTML = ""; currentChatId = Date.now().toString(); addGreeting();
    renderSidebar([]);
  });

  // Sidebar
  historyBtn.addEventListener("click", async () => { await saveCurrentChat(); await loadChats(); sidebar.classList.add("open"); overlay.classList.add("show"); });
  closeSidebarBtn.addEventListener("click", closeSidebarFn);
  overlay.addEventListener("click", closeSidebarFn);
  function closeSidebarFn() { sidebar.classList.remove("open"); overlay.classList.remove("show"); }

  async function saveCurrentChat() {
    if (history.length < 1 || !userToken) return;
    const firstUserMsg = history.find(m => m.role === "user");
    if (!firstUserMsg) return;
    const title = NovaRender.historyTitle(firstUserMsg);
    await fetch(`${BACKEND_URL}/chats`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
      body: JSON.stringify({ id: currentChatId, title, history }),
    });
  }

  async function loadChats() {
    try {
      const res = await fetch(`${BACKEND_URL}/chats`, { headers: { "Authorization": `Bearer ${userToken}` } });
      const data = await res.json();
      renderSidebar(data.chats || []);
    } catch { console.error("Failed to load chats"); }
  }

  function renderSidebar(chats) {
    sidebarList.innerHTML = chats.length === 0
      ? `<p style="padding:1rem;color:var(--text-muted);font-size:0.9rem">No saved chats yet</p>`
      : chats.map(c => `<div class="history-item" data-id="${NovaRender.escapeHtml(c.id)}"><span class="history-item-title">${NovaRender.escapeHtml(c.title)}</span><button class="delete-chat-btn" data-id="${NovaRender.escapeHtml(c.id)}" title="Delete chat"><i class="fa-solid fa-xmark"></i></button></div>`).join("");
    sidebarList.querySelectorAll(".history-item-title").forEach(el => {
      el.addEventListener("click", () => {
        const c = chats.find(x => x.id === el.closest(".history-item").dataset.id);
        if (!c) return;
        history = c.history; currentChatId = c.id; chatEl.innerHTML = "";
        history.forEach(m => addHistoryMsg(m));
        closeSidebarFn();
      });
    });
    sidebarList.querySelectorAll(".delete-chat-btn").forEach(el => {
      el.addEventListener("click", async e => {
        e.stopPropagation();
        const c = chats.find(x => x.id === el.dataset.id);
        if (!confirm(`Delete "${c ? c.title : "this chat"}"? This can't be undone.`)) return;
        await fetch(`${BACKEND_URL}/chats/${el.dataset.id}`, { method: "DELETE", headers: { "Authorization": `Bearer ${userToken}` } });
        if (el.dataset.id === currentChatId) {
          history = []; chatEl.innerHTML = ""; currentChatId = Date.now().toString(); addGreeting();
        }
        await loadChats();
      });
    });
  }
