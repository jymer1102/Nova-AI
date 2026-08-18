// Toast
  function showToast(msg) {
  const toast = document.createElement("div");
  toast.style.cssText = "position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#2f6feb;color:white;padding:0.6rem 1.2rem;border-radius:12px;font-size:0.9rem;z-index:9999;animation:fadeout 0.3s ease 2.7s forwards";
  
  toast.innerHTML = msg; 
  
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
