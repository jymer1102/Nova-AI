// Profile
  function updateProfileIcon(src) {
    const icon = document.getElementById("profile-icon");
    const fallback = document.getElementById("profile-icon-fallback");
    if (src) { icon.src = src; icon.style.display = "block"; fallback.style.display = "none"; }
    else { icon.style.display = "none"; fallback.style.display = "block"; }
  }
  const savedAvatar = localStorage.getItem("nova_avatar");
  if (savedAvatar) updateProfileIcon(savedAvatar);

  profileBtn.addEventListener("click", () => {
    document.getElementById("profile-name").value = localStorage.getItem("nova_name") || "";
    document.getElementById("profile-email").value = "";
    document.getElementById("profile-password").value = "";
    profileMsg.textContent = "";
    profileModal.classList.add("open");
  });
  profileClose.addEventListener("click", () => { profileModal.classList.remove("open"); });
  profileModal.addEventListener("click", (e) => { if (e.target === profileModal) profileModal.classList.remove("open"); });

  profileSave.addEventListener("click", async () => {
    const name = document.getElementById("profile-name").value.trim();
    const email = document.getElementById("profile-email").value.trim();
    const password = document.getElementById("profile-password").value.trim();
    profileSave.disabled = true; profileSave.textContent = "Saving...";
    try {
      const res = await fetch(`${BACKEND_URL}/auth/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
        body: JSON.stringify({ name: name || undefined, email: email || undefined, password: password || undefined, avatar_url: pendingAvatarBase64 || undefined }),
      });
      const data = await res.json();
      if (data.error) { profileMsg.style.color = "#e74c3c"; profileMsg.textContent = data.error; }
      else {
        if (name) localStorage.setItem("nova_name", name);
        if (pendingAvatarBase64) { localStorage.setItem("nova_avatar", pendingAvatarBase64); updateProfileIcon(pendingAvatarBase64); }
        profileMsg.style.color = "#2ecc71"; profileMsg.textContent = "Saved!";
        setTimeout(() => { profileModal.classList.remove("open"); profileMsg.textContent = ""; }, 1500);
      }
    } catch { profileMsg.style.color = "#e74c3c"; profileMsg.textContent = "Something went wrong."; }
    profileSave.disabled = false; profileSave.textContent = "Save";
  });

  profileDelete.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to delete your account? This can't be undone!")) return;
    if (!confirm("Last chance — all your chats will be permanently deleted too. Continue?")) return;
    try {
      const res = await fetch(`${BACKEND_URL}/auth/delete`, { method: "DELETE", headers: { "Authorization": `Bearer ${userToken}` } });
      const data = await res.json();
      if (data.error) { alert("Error: " + data.error); return; }
      localStorage.clear(); showAuth();
    } catch { alert("Something went wrong. Try again."); }
  });

  // --- PROFILE PICTURE UPLOAD LOGIC ---
  document.addEventListener("DOMContentLoaded", () => {
    const avatarUploadInput = document.getElementById('avatar-upload');
    const profilePreview = document.getElementById('profile-preview');

    const saved = localStorage.getItem("nova_avatar");
    if (saved && profilePreview) profilePreview.src = saved;

    if (avatarUploadInput) {
      avatarUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowedTypes.includes(file.type)) { showToast("Only JPG, PNG, and WEBP images are allowed!"); e.target.value = ''; return; }
        if (file.size > MAX_FILE_SIZE_BYTES) { showToast("File too big! Max 2MB."); e.target.value = ''; return; }
        showToast("Uploading profile picture...");
        try {
          const compressed = await compressImage(file);
          if (!compressed) {
            e.target.value = '';
            return;
          }
          localStorage.setItem("nova_avatar", compressed);
          if (profilePreview) profilePreview.src = compressed;
          updateProfileIcon(compressed);
          const res = await fetch(`${BACKEND_URL}/auth/update`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${userToken}` },
            body: JSON.stringify({ avatar_url: compressed }),
          });
          const data = await res.json();
          if (data.error) { showToast("Failed to save avatar."); }
          else { showToast('<span class="toast-success">Profile picture updated! <i class="fa-solid fa-circle-check"></i></span>'); }
        } catch { showToast("Upload failed. Try again."); }
        e.target.value = '';
      });
    }
  });
