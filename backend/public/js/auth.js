// Token refresh
  async function refreshToken() {
    const storedRefresh = localStorage.getItem("nova_refresh_token");
    if (!storedRefresh) return;
    try {
      const res = await fetch(`${BACKEND_URL}/auth/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: storedRefresh }),
      });
      const data = await res.json();
      if (data.session) {
        userToken = data.session.access_token;
        localStorage.setItem("nova_token", userToken);
        localStorage.setItem("nova_refresh_token", data.session.refresh_token);
      } else { showAuth(); }
    } catch { console.error("Token refresh failed"); }
  }
  setInterval(refreshToken, 10 * 60 * 1000);

  // Auth
  document.getElementById("discord-btn").addEventListener("click", () => { window.location.href = `${BACKEND_URL}/auth/oauth/discord`; });
  document.getElementById("github-btn").addEventListener("click", () => { window.location.href = `${BACKEND_URL}/auth/oauth/github`; });

  authToggle.addEventListener("click", () => {
    isSignUp = !isSignUp;
    authName.style.display = isSignUp ? "block" : "none";
    authPhone.style.display = isSignUp ? "block" : "none";
    authSubtitle.textContent = isSignUp ? "Create an account" : "Sign in to your account";
    authSubmit.textContent = isSignUp ? "Sign Up" : "Sign In";
    authToggle.textContent = isSignUp ? "Already have an account? Sign in" : "Don't have an account? Sign up";
    authError.textContent = "";
  });

  authSubmit.addEventListener("click", async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    const name = authName.value.trim();
    const phone = authPhone.value.trim();
    if (!email || !password || (isSignUp && !name)) { authError.textContent = "Please fill in all fields."; return; }
    authSubmit.disabled = true; authSubmit.textContent = "Loading...";
    try {
      const res = await fetch(`${BACKEND_URL}${isSignUp ? "/auth/signup" : "/auth/login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, phone }),
      });
      const data = await res.json();
      if (data.error) { authError.textContent = data.error; authSubmit.disabled = false; authSubmit.textContent = isSignUp ? "Sign Up" : "Sign In"; return; }
      userToken = data.session.access_token;
      localStorage.setItem("nova_token", userToken);
      localStorage.setItem("nova_refresh_token", data.session.refresh_token);
      localStorage.setItem("nova_name", data.user?.user_metadata?.name || name || "");
      showApp();
    } catch { authError.textContent = "Something went wrong. Try again."; authSubmit.disabled = false; authSubmit.textContent = isSignUp ? "Sign Up" : "Sign In"; }
  });

  async function showApp() {
    authScreen.style.display = "none";
    appEl.style.display = "flex";
    await refreshToken();
    if (history.length === 0) addGreeting();
    loadChats();
  }

  function showAuth() {
    appEl.style.display = "none";
    authScreen.style.display = "flex";
    userToken = null;
    localStorage.removeItem("nova_token");
    localStorage.removeItem("nova_refresh_token");
  }

  if (userToken) showApp();
