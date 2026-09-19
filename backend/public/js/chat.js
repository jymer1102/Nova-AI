  // Handle Microphone / Voice Input
  if (micBtn && inputEl) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      micBtn.addEventListener("click", () => {
        try {
          recognition.start();
          micBtn.style.color = "var(--accent)"; // Turns accent color while listening
        } catch (e) {
          console.error("Speech recognition error:", e);
        }
      });

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        inputEl.value += (inputEl.value ? " " : "") + transcript;
        micBtn.style.color = "";
      };

      recognition.onerror = () => {
        micBtn.style.color = "";
      };

      recognition.onend = () => {
        micBtn.style.color = "";
      };
    } else {
      micBtn.addEventListener("click", () => {
        alert("Voice input is not supported on this browser.");
      });
    }
  }
