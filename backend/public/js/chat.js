document.addEventListener("DOMContentLoaded", () => {
  // addGreeting(), addMsg() and the image-request parser live in render.js

  // ------------------------------------------------------------------
  //  Attachment limits (change these if you like)
  // ------------------------------------------------------------------
  const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // photos are shrunk before sending
  const MAX_IMAGES = 3;                     // matches the backend's vision-model limit (VISION_MODEL supports 3/request)
  const MAX_FILE_BYTES = 300 * 1024;        // biggest raw code/text file you can attach
  const MAX_PDF_BYTES = 20 * 1024 * 1024;   // biggest PDF you can attach
  const MAX_ZIP_BYTES = 25 * 1024 * 1024;   // biggest zip you can attach
  const MAX_ZIP_ENTRY_BYTES = 5 * 1024 * 1024; // skip individual zip entries bigger than this (uncompressed)
  const MAX_PDF_PAGES = 40;                 // pages of text to read out of one PDF
  const MAX_FILE_CHARS = 40000;             // characters of one file sent to the AI (~10k tokens)
  const MAX_TOTAL_CHARS = 80000;            // characters across all files in one message
  const MAX_FILES = 8;                      // total text/code entries per message (zip contents count toward this)

  // Code / text files the AI can read
  const TEXT_EXTS = new Set((
    "txt md markdown rst tex log csv tsv json json5 jsonl ipynb yaml yml toml ini cfg conf env properties " +
    "py pyw js mjs cjs jsx ts tsx vue svelte astro html htm css scss sass less styl xml svg " +
    "java kt kts scala groovy gradle c h cpp cc cxx hpp hh cs go rs rb php php7 swift m mm dart lua pl pm r jl hs ex exs erl clj cljs edn " +
    "sh bash zsh fish ps1 psm1 bat cmd sql graphql gql proto thrift avdl asm s vb fs fsx nim zig coffee " +
    "gitignore gitattributes gitmodules dockerignore npmrc babelrc eslintrc prettierrc editorconfig " +
    "dockerfile makefile cmake toml lock srt vtt tex bib rst adoc"
  ).split(" "));
  const TEXT_NAMES = new Set([
    "dockerfile", "makefile", "cmakelists.txt", "readme", "license", "changelog",
    ".gitignore", ".gitattributes", ".gitmodules", ".dockerignore", ".env", ".env.example",
    ".babelrc", ".eslintrc", ".prettierrc", ".editorconfig", ".npmrc"
  ]);

  function fileExt(name) {
    const base = String(name).split("/").pop();
    const i = base.lastIndexOf(".");
    return i === -1 ? "" : base.slice(i + 1).toLowerCase();
  }
  function isTextFileName(name) {
    return TEXT_EXTS.has(fileExt(name)) || TEXT_NAMES.has(String(name).split("/").pop().toLowerCase());
  }
  function isTextFile(file) {
    if (isTextFileName(file.name)) return true;
    return /^text\//.test(file.type) || /^application\/(json|javascript|xml|x-sh|x-yaml|toml)/.test(file.type);
  }
  const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
  function isHeic(file) {
    return HEIC_TYPES.has(file.type) || /\.hei[cf]$/i.test(file.name);
  }
  function isPdf(file) {
    return file.type === "application/pdf" || fileExt(file.name) === "pdf";
  }
  function isZip(file) {
    return ["application/zip", "application/x-zip-compressed", "application/x-zip"].includes(file.type) || fileExt(file.name) === "zip";
  }

  const toast = msg => { if (typeof showToast === "function") showToast(msg); };

  // Loads a <script> once (used to lazy-load heic2any / pdf.js / JSZip only when actually needed)
  const loadedScripts = new Map();
  function loadScript(src) {
    if (loadedScripts.has(src)) return loadedScripts.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
    loadedScripts.set(src, p);
    return p;
  }
  async function ensureHeic2Any() {
    if (!window.heic2any) await loadScript("https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js");
    return window.heic2any;
  }
  async function ensurePdfJs() {
    if (!window.pdfjsLib) {
      await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js");
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    }
    return window.pdfjsLib;
  }
  async function ensureJsZip() {
    if (!window.JSZip) await loadScript("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
    return window.JSZip;
  }

  // --- Image compression (shrinks photos so uploads stay small and fast) ---
  function compressImage(file) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxSize = 1024;
          let w = img.width, h = img.height;
          if (w > maxSize || h > maxSize) { if (w > h) { h = (h/w)*maxSize; w = maxSize; } else { w = (w/h)*maxSize; h = maxSize; } }
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";           // transparent PNGs would otherwise turn black
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => { toast("Failed to load image"); resolve(null); };
        img.src = e.target.result;
      };
      reader.onerror = () => { toast("Failed to read file"); resolve(null); };
      reader.readAsDataURL(file);
    });
  }

  // ------------------------------------------------------------------
  //  Attachments (one image + up to MAX_FILES code/text files)
  // ------------------------------------------------------------------
  const uploadBtn = document.getElementById("upload-btn");
  const fileInput = document.getElementById("file-input");
  const previewArea = document.getElementById("preview-area");
  const attachList = document.getElementById("attach-list");

  let pendingImages = []; // { base64, type }
  let pendingFiles = [];  // { name, text, truncated }

  if (fileInput) {
    fileInput.multiple = true;
    fileInput.accept = "image/*,.heic,.heif,.pdf,.zip,text/*," + [...TEXT_EXTS].map(e => "." + e).join(",");
  }

  function renderAttachments() {
    if (!attachList || !previewArea) return;
    attachList.innerHTML = "";

    pendingImages.forEach((im, i) => {
      const chip = document.createElement("div");
      chip.className = "attach-chip attach-image";
      const img = document.createElement("img");
      img.src = `data:${im.type};base64,${im.base64}`;
      img.alt = "Attached image";
      const x = document.createElement("button");
      x.type = "button"; x.className = "attach-x"; x.title = "Remove image"; x.textContent = "✕";
      x.addEventListener("click", () => { pendingImages.splice(i, 1); renderAttachments(); });
      chip.append(img, x);
      attachList.appendChild(chip);
    });

    pendingFiles.forEach((f, i) => {
      const chip = document.createElement("div");
      chip.className = "attach-chip";
      chip.innerHTML = `<i class="fa-solid ${NovaRender.fileChipIcon ? NovaRender.fileChipIcon(f.name) : "fa-file-code"}"></i>`;
      const name = document.createElement("span");
      name.className = "attach-name"; name.textContent = f.name;
      const meta = document.createElement("span");
      meta.className = "attach-meta";
      meta.textContent = f.truncated ? "truncated" : `${f.text.length.toLocaleString()} chars`;
      const x = document.createElement("button");
      x.type = "button"; x.className = "attach-x"; x.title = "Remove file"; x.textContent = "✕";
      x.addEventListener("click", () => { pendingFiles.splice(i, 1); renderAttachments(); });
      chip.append(name, meta, x);
      attachList.appendChild(chip);
    });

    previewArea.style.display = (pendingImages.length || pendingFiles.length) ? "flex" : "none";
  }

  function clearAttachments() {
    pendingImages = []; pendingFiles = [];
    if (fileInput) fileInput.value = "";
    renderAttachments();
  }

  // Adds one extracted block of text (from a plain file, a PDF, or a zip entry) as a
  // pending "file" attachment, enforcing the size caps. Returns true if it was added.
  function addExtractedText(name, text, opts) {
    opts = opts || {};
    if (pendingFiles.length >= MAX_FILES) { if (!opts.silent) toast(`You can attach up to ${MAX_FILES} files at once`); return false; }
    if (text.includes("\u0000")) { if (!opts.silent) toast(`"${name}" looks like a binary file, so I can't read it`); return false; }
    if (!text.trim()) { if (!opts.silent) toast(`"${name}" is empty`); return false; }

    const used = pendingFiles.reduce((n, f) => n + f.text.length, 0);
    let truncated = false;
    if (text.length > MAX_FILE_CHARS) { text = text.slice(0, MAX_FILE_CHARS); truncated = true; }
    if (used + text.length > MAX_TOTAL_CHARS) { if (!opts.silent) toast("Those files are too big to send together. Try fewer or smaller files"); return false; }
    pendingFiles.push({ name, text, truncated });
    if (truncated && !opts.silent) toast(`"${name}" is long, so only the first ${MAX_FILE_CHARS.toLocaleString()} characters will be sent`);
    return true;
  }

  async function addImage(file) {
    if (pendingImages.length >= MAX_IMAGES) { toast(`You can attach up to ${MAX_IMAGES} images at once`); return; }

    let workingFile = file;
    if (isHeic(file)) {
      toast(`Converting "${file.name}"...`);
      try {
        const heic2any = await ensureHeic2Any();
        const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.85 });
        const blob = Array.isArray(converted) ? converted[0] : converted;
        workingFile = new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
      } catch (err) {
        console.error(err);
        toast(`Couldn't convert "${file.name}" from HEIC. Try exporting it as JPG first`);
        return;
      }
    } else if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast(`"${file.name}" isn't a supported image (use JPG, PNG, WEBP, GIF or HEIC)`); return;
    }

    if (workingFile.size > MAX_IMAGE_BYTES) { toast(`"${file.name}" is too large. Max image size is 10MB`); return; }
    const compressed = await compressImage(workingFile);
    if (!compressed) return;
    pendingImages.push({ base64: compressed.split(",")[1], type: "image/jpeg" });
  }

  async function addTextFile(file) {
    if (pendingFiles.length >= MAX_FILES) { toast(`You can attach up to ${MAX_FILES} files at once`); return; }
    if (file.size > MAX_FILE_BYTES) { toast(`"${file.name}" is too large (max ${Math.round(MAX_FILE_BYTES / 1024)} KB)`); return; }
    let text;
    try { text = await file.text(); } catch { toast(`Couldn't read "${file.name}"`); return; }
    addExtractedText(file.name, text);
  }

  // PDFs: extract selectable text page by page. If a PDF turns out to have
  // basically no selectable text (a scan), render its first page(s) as images
  // instead so the vision model can look at them directly.
  async function addPdfFile(file) {
    if (pendingFiles.length >= MAX_FILES) { toast(`You can attach up to ${MAX_FILES} files at once`); return; }
    if (file.size > MAX_PDF_BYTES) { toast(`"${file.name}" is too large (max ${MAX_PDF_BYTES / (1024 * 1024)}MB)`); return; }

    let pdfjsLib;
    try { pdfjsLib = await ensurePdfJs(); } catch (err) { console.error(err); toast("Couldn't load the PDF reader. Check your connection and try again"); return; }

    try {
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const pageCount = pdf.numPages;
      const pagesToRead = Math.min(pageCount, MAX_PDF_PAGES);

      let text = "";
      for (let i = 1; i <= pagesToRead; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(it => it.str).join(" ").replace(/\s+/g, " ").trim();
        if (pageText) text += `--- Page ${i} ---\n${pageText}\n\n`;
      }
      if (pageCount > pagesToRead) text += `[...${pageCount - pagesToRead} more page(s) not read...]\n`;

      // Basically no extractable text => this is almost certainly a scanned/image-only PDF
      if (text.trim().length < 40) {
        const room = MAX_IMAGES - pendingImages.length;
        if (room <= 0) {
          toast(`"${file.name}" looks like a scanned PDF with no selectable text, and you're out of image slots to show it visually`);
          return;
        }
        const pagesToRender = Math.min(pageCount, room);
        for (let i = 1; i <= pagesToRender; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width; canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          pendingImages.push({ base64: canvas.toDataURL("image/jpeg", 0.85).split(",")[1], type: "image/jpeg" });
        }
        toast(`"${file.name}" looks scanned, so ${pagesToRender} page${pagesToRender === 1 ? "" : "s"} of it were attached as image${pagesToRender === 1 ? "" : "s"} instead of text`);
        return;
      }

      addExtractedText(file.name, text.trim());
    } catch (err) {
      console.error(err);
      toast(`Couldn't read "${file.name}" as a PDF`);
    }
  }

  // Zips: extract every readable text/code file inside (skipping images, binaries,
  // and anything oversized), each added as its own attachment named "zip/path/to/file".
  async function addZipFile(file) {
    if (pendingFiles.length >= MAX_FILES) { toast(`You can attach up to ${MAX_FILES} files at once`); return; }
    if (file.size > MAX_ZIP_BYTES) { toast(`"${file.name}" is too large (max ${MAX_ZIP_BYTES / (1024 * 1024)}MB)`); return; }

    let JSZip;
    try { JSZip = await ensureJsZip(); } catch (err) { console.error(err); toast("Couldn't load the zip reader. Check your connection and try again"); return; }

    try {
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(f => !f.dir).slice(0, 500);
      let extracted = 0, skipped = 0;

      for (const entry of entries) {
        if (pendingFiles.length >= MAX_FILES) { skipped += entries.length - extracted - skipped; break; }
        const size = entry._data && entry._data.uncompressedSize;
        if (!isTextFileName(entry.name) || (typeof size === "number" && size > MAX_ZIP_ENTRY_BYTES)) { skipped++; continue; }
        let text;
        try { text = await entry.async("text"); } catch { skipped++; continue; }
        const added = addExtractedText(`${file.name}/${entry.name}`, text, { silent: true });
        if (added) extracted++; else skipped++;
      }

      if (extracted === 0) toast(`No readable text/code files found inside "${file.name}"`);
      else toast(`Extracted ${extracted} file${extracted === 1 ? "" : "s"} from "${file.name}"${skipped ? ` (${skipped} skipped)` : ""}`);
    } catch (err) {
      console.error(err);
      toast(`Couldn't read "${file.name}" as a zip`);
    }
  }

  if (uploadBtn && fileInput) {
    uploadBtn.title = "Attach images, code/text files, a PDF, or a zip";
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const files = [...fileInput.files];
      fileInput.value = "";
      if (!files.length) return;
      for (const file of files) {
        if (file.type.startsWith("image/") || isHeic(file)) await addImage(file);
        else if (isPdf(file)) await addPdfFile(file);
        else if (isZip(file)) await addZipFile(file);
        else if (isTextFile(file)) await addTextFile(file);
        else toast(`"${file.name}" isn't a supported file type yet`);
      }
      renderAttachments();
    });
  }

  // --- Voice input setup ---
  let recognition = null;
  let isRecording = false;
  const micBtn = document.getElementById("mic-btn");

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
  let sending = false;

  // "Thinking..." placeholder (same look as an AI reply, no bubble)
  function addThinking(label) {
    const wrap = document.createElement("div");
    wrap.className = "msg-wrap ai";
    const t = document.createElement("div");
    t.className = "ai-text thinking";
    t.textContent = label;
    wrap.appendChild(t);
    chatEl.appendChild(wrap);
    chatEl.scrollTop = chatEl.scrollHeight;
    return { wrap, text: t };
  }

  // History as the server should see it. Generated images are just a URL in our
  // history, so the AI is told about them in words instead.
  const GENERATED_IMG = /^!\[([^\]]*)\]\(https:\/\/image\.pollinations\.ai\/[^)]*\)$/;
  function messagesForServer() {
    return history.map(m => {
      if (m.role === "assistant" && typeof m.content === "string") {
        const g = m.content.match(GENERATED_IMG);
        if (g) return { role: "assistant", content: `[Nova generated an image for the prompt: "${g[1]}"]` };
      }
      return m;
    });
  }

  async function generateImage(typed, prompt) {
    addMsg("user", typed);
    history.push({ role: "user", content: typed });
    input.value = "";

    if (!prompt) {
      const tip = "What should the image show? Describe it and I'll create it, for example: **/image a red sports car on a beach at sunset**";
      addMsg("ai", tip);
      history.push({ role: "assistant", content: tip });
      if (typeof saveCurrentChat === "function") saveCurrentChat();
      return;
    }

    const thinking = addThinking("Creating your image...");
    try {
      const res = await fetch(`${BACKEND_URL}/generate-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      thinking.wrap.remove();
      if (!data.imageUrl) { addMsg("ai", data.error || "Image generation failed. Please try again."); return; }
      const alt = prompt.replace(/[\[\]\r\n]+/g, " ").slice(0, 200);
      const url = data.imageUrl.replace(/\(/g, "%28").replace(/\)/g, "%29");
      const md = `![${alt}](${url})`;
      addMsg("ai", md);
      history.push({ role: "assistant", content: md });
      if (typeof saveCurrentChat === "function") saveCurrentChat();
    } catch {
      thinking.text.classList.remove("thinking");
      thinking.text.textContent = "Error reaching the server. Is your backend running?";
    }
  }

  async function sendMessage() {
    if (sending) return;
    const typed = input.value.trim();
    const images = pendingImages.slice();
    const hasImage = images.length > 0;
    const files = pendingFiles.slice();
    if (!typed && !hasImage && !files.length) return;

    sending = true;
    btn.disabled = true;
    try {
      // 1) Is the user asking for an image to be created?
      if (!hasImage && !files.length) {
        const req = NovaRender.parseImageRequest(typed);
        if (req) { await generateImage(typed, req.prompt); return; }
      }

      // 2) Normal chat, possibly with image(s) and/or code/PDF/zip files attached
      let modelText = typed;
      if (files.length) {
        const blocks = files.map(f =>
          `<attached_file name="${f.name.replace(/"/g, "'")}">\n${f.text.replace(/<\/attached_file>/g, "<\\/attached_file>")}${f.truncated ? "\n[...file truncated...]" : ""}\n</attached_file>`
        ).join("\n\n");
        const ask = typed || (hasImage ? "" : "Analyze the attached file(s): explain what they contain and point out anything notable (bugs, structure, improvements, etc).");
        modelText = blocks + (ask ? "\n\n" + ask : "");
      } else if (!typed && hasImage) {
        modelText = images.length > 1 ? "Describe these images." : "Describe this image.";
      }

      const imgSrcs = images.map(im => `data:${im.type};base64,${im.base64}`);
      addMsg("user", modelText, imgSrcs);

      const userContent = [];
      imgSrcs.forEach(url => userContent.push({ type: "image_url", image_url: { url } }));
      userContent.push({ type: "text", text: modelText });
      history.push({ role: "user", content: hasImage ? userContent : modelText });

      input.value = "";
      clearAttachments();
      const thinking = addThinking(hasImage ? "Looking at your image" + (imgSrcs.length > 1 ? "s..." : "...") : "Thinking...");

      try {
        const res = await fetch(`${BACKEND_URL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: messagesForServer() }),
        });
        const data = await res.json();
        const reply = data.reply || data.error || "Something went wrong.";

        thinking.wrap.remove();
        addMsg("ai", reply);

        if (data.reply) history.push({ role: "assistant", content: reply });
        if (typeof saveCurrentChat === "function") saveCurrentChat();
      } catch {
        thinking.text.classList.remove("thinking");
        thinking.text.textContent = "Error reaching the server. Is your backend running?";
      }
    } finally {
      sending = false;
      btn.disabled = false;
    }
  }

  if (btn && input) {
    btn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});
