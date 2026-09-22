// ============================================================
//  Message rendering
//  - user messages: gray bubble + copy button
//  - AI messages: no bubble, markdown, code boxes, charts,
//    and read-aloud / copy / download buttons
// ============================================================
(function () {
  "use strict";

  /* ---------------------------------------------------------- */
  /*  Small helpers                                              */
  /* ---------------------------------------------------------- */
  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(msg) { if (typeof showToast === "function") showToast(msg); }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Fallback for non-secure contexts / older browsers
      try {
        const ta = el("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok;
      } catch (_) { return false; }
    }
  }

  function downloadFile(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = el("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function setBtn(btn, icon, label) {
    btn.innerHTML = `<i class="fa-solid ${icon}"></i>` + (label ? ` <span>${label}</span>` : "");
  }

  function makeBtn(cls, icon, label, title) {
    const b = el("button", cls);
    b.type = "button";
    b.title = title || label || "";
    b.setAttribute("aria-label", title || label || "");
    setBtn(b, icon, label);
    return b;
  }

  // Briefly swap a button to a green "done" state
  function flash(btn, icon, label, doneLabel) {
    btn.classList.add("copied");
    setBtn(btn, "fa-check", doneLabel);
    clearTimeout(btn._flashTimer);
    btn._flashTimer = setTimeout(() => {
      btn.classList.remove("copied");
      setBtn(btn, icon, label);
    }, 1600);
  }

  function timestamp() {
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  const fmt = v => {
    if (!Number.isFinite(v)) return String(v);
    return (Math.round(v * 100) / 100).toLocaleString();
  };

  /* ---------------------------------------------------------- */
  /*  Attached files                                             */
  /*  Code/text files are stored inside the message text as      */
  /*  <attached_file name="..."> blocks so they persist in saved */
  /*  chats. The chat shows them as small chips, not raw text.   */
  /* ---------------------------------------------------------- */
  const FILE_RE = /<attached_file name="([^"]*)">\n([\s\S]*?)\n<\/attached_file>\n*/g;

  function parseAttachedFiles(text) {
    const files = [];
    const rest = String(text).replace(FILE_RE, (_, name, body) => {
      files.push({ name, lines: body.replace(/\n+$/, "").split("\n").length });
      return "";
    });
    return { files, rest: rest.trim() };
  }

  /* ---------------------------------------------------------- */
  /*  "Generate an image" detection                              */
  /*  Returns null (not an image request) or { prompt }          */
  /*  (prompt is "" when the user didn't say what to draw).      */
  /* ---------------------------------------------------------- */
  const IMG_NOUN = "(?:images?|pictures?|pics?|photos?|photographs?|drawings?|illustrations?|paintings?|artworks?|art|logos?|wallpapers?|posters?|portraits?|icons?|sketch(?:es)?|renders?|avatars?|memes?)";
  const NOT_AN_IMAGE = /\b(code|script|function|program|python|javascript|typescript|html|css|java|sql|regex|chart|graph|table|diagram|api|app|website|classifier|classification|pytorch|tensorflow|keras|opencv|dataset|algorithm|library|framework|sdk|database|component|node\.?js|react|django|flask)\b/i;
  // Questions and how-to requests are never "please draw this"
  const QUESTION_START = /^\s*(?:how|what|whats|what's|why|when|where|which|who|is|are|was|were|does|do|did|should|explain|tell me|describe|write|help|teach|show me how|can you explain|could you explain)\b/i;
  // "an image classifier", "a picture viewer"... the noun is part of a bigger thing, not a picture request
  const COMPOUND_AFTER = /^\s*(?:classifier|classification|generator|resizer|viewer|editor|gallery|carousel|slider|upload|uploader|processing|recognition|detection|segmentation|captioning|dataset|format|file|library|sensor|compression|converter|tool|pipeline)\b/i;

  function tidyPrompt(s) {
    return String(s || "").replace(/^[\s:,\-–]+/, "").replace(/^(of|showing|depicting|featuring)\s+/i, "").replace(/[\s.!?]+$/, "").trim();
  }

  function parseImageRequest(raw) {
    const t = String(raw || "").trim();
    if (!t) return null;

    // Explicit command: /image a red car on a beach
    let m = t.match(/^\/(?:image|imagine|img|draw)\b\s*([\s\S]*)$/i);
    if (m) return { prompt: tidyPrompt(m[1]) };

    if (NOT_AN_IMAGE.test(t) || QUESTION_START.test(t)) return null;

    // "generate / create / make / design ... an image of ..."
    m = t.match(new RegExp("\\b(?:generate|create|make|produce|render|design|draw|paint)\\b(?:\\s+me|\\s+us)?(?:\\s+(?:an?|some|another|one))?((?:\\s+[\\w-]+){0,3}?)\\s+" + IMG_NOUN + "\\b\\s*(?:of|showing|depicting|featuring|with|about|for|that|where|:|-)?\\s*([\\s\\S]*)$", "i"));
    if (m && COMPOUND_AFTER.test(m[2])) return null;
    if (m) {
      const subject = tidyPrompt(m[2]);
      const style = m[1].trim();
      return { prompt: subject ? (style ? subject + ", " + style : subject) : "" };
    }

    // "show me / give me a picture of ..."
    m = t.match(new RegExp("\\b(?:show|give)\\s+me\\s+(?:an?\\s+)?(?:[\\w-]+\\s+){0,2}" + IMG_NOUN + "\\s+of\\s+([\\s\\S]+)$", "i"));
    if (m) return { prompt: tidyPrompt(m[1]) };

    // "draw / paint / sketch / illustrate me a dragon"
    m = t.match(/^(?:please\s+|pls\s+|can you\s+|could you\s+|can u\s+)*(?:draw|paint|sketch|illustrate)\b(?:\s+me|\s+us)?\s+([\s\S]+)$/i);
    if (m) return { prompt: tidyPrompt(m[1]) };

    return null;
  }

  // A short, single-line title for the sidebar
  function historyTitle(msg) {
    let text = "";
    if (typeof msg.content === "string") text = msg.content;
    else if (Array.isArray(msg.content)) text = msg.content.filter(p => p && p.type === "text").map(p => p.text).join(" ");
    const parsed = parseAttachedFiles(text);
    const title = parsed.rest || (parsed.files[0] ? "File: " + parsed.files[0].name : "Image message");
    return title.replace(/\s+/g, " ").slice(0, 40);
  }

  /* ---------------------------------------------------------- */
  /*  Code boxes (copy / download just the code)                 */
  /* ---------------------------------------------------------- */
  const FILE_EXT = {
    javascript: "js", js: "js", jsx: "jsx", typescript: "ts", ts: "ts", tsx: "tsx", node: "js",
    python: "py", py: "py", html: "html", css: "css", scss: "scss", json: "json",
    java: "java", c: "c", cpp: "cpp", "c++": "cpp", csharp: "cs", "c#": "cs", cs: "cs",
    go: "go", rust: "rs", rs: "rs", ruby: "rb", rb: "rb", php: "php", swift: "swift",
    kotlin: "kt", kt: "kt", bash: "sh", sh: "sh", shell: "sh", zsh: "sh",
    powershell: "ps1", ps1: "ps1", sql: "sql", yaml: "yml", yml: "yml", xml: "xml",
    markdown: "md", md: "md", r: "r", lua: "lua", dart: "dart", perl: "pl", scala: "scala",
    haskell: "hs", matlab: "m", bat: "bat", batch: "bat", toml: "toml", ini: "ini", csv: "csv",
    text: "txt", plaintext: "txt", txt: "txt",
  };

  function buildCodeBlock(text, lang) {
    const cleanLang = /^[\w+#.-]{1,20}$/.test(lang || "") ? lang.toLowerCase() : "";
    const shown = String(text).replace(/\n$/, "");

    const box = el("div", "code-block");
    const head = el("div", "code-header");
    const label = el("span", "code-lang");
    label.textContent = cleanLang || "code";

    const actions = el("div", "code-actions");
    const copyBtn = makeBtn("code-btn", "fa-copy", "Copy", "Copy code");
    const dlBtn = makeBtn("code-btn", "fa-download", "Download", "Download code");

    copyBtn.addEventListener("click", async () => {
      if (await copyText(shown)) flash(copyBtn, "fa-copy", "Copy", "Copied");
      else toast("Couldn't copy — your browser blocked it");
    });
    dlBtn.addEventListener("click", () => {
      const ext = FILE_EXT[cleanLang] || "txt";
      downloadFile(`nova-code.${ext}`, shown + "\n");
      flash(dlBtn, "fa-download", "Download", "Saved");
    });

    actions.append(copyBtn, dlBtn);
    head.append(label, actions);

    const pre = el("pre");
    const code = el("code");
    if (cleanLang) code.className = "language-" + cleanLang;
    code.textContent = shown;
    pre.appendChild(code);

    box.append(head, pre);
    return box;
  }

  /* ---------------------------------------------------------- */
  /*  Charts                                                     */
  /* ---------------------------------------------------------- */
  const CHART_LANGS = ["chart", "chartjs", "chart.js", "chart-json"];
  const TYPE_MAP = {
    bar: "bar", column: "bar", line: "line",
    pie: "pie", doughnut: "doughnut", donut: "doughnut",
    radar: "radar", spider: "radar", web: "radar",
  };
  const TYPE_LABEL = { bar: "Bar chart", line: "Line chart", pie: "Pie chart", doughnut: "Donut chart", radar: "Radar chart" };
  const PALETTE = ["#4f8cff", "#ff7a59", "#2ecc71", "#f5c542", "#a06cd5", "#1fc7c7", "#ff5d8f", "#8fb339", "#e08a1e", "#7a8cff"];

  const toNumber = v => {
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v.replace(/[,$%\s]/g, ""));
    return NaN;
  };

  // Validates the chart the AI sent. Throws a readable Error if anything is off,
  // so we never draw a chart with wrong or misaligned numbers.
  function normalizeChartSpec(raw) {
    if (!raw || typeof raw !== "object") throw new Error("the chart data isn't an object.");

    // Accept Chart.js-style { type, data: { labels, datasets } } as well
    if (raw.data && !Array.isArray(raw.data) && Array.isArray(raw.data.labels)) {
      raw = { ...raw, labels: raw.data.labels, datasets: raw.data.datasets, title: raw.title || raw.options?.plugins?.title?.text };
    }
    // Accept the shorthand { labels, data: [...] }
    if (!Array.isArray(raw.datasets) && Array.isArray(raw.data)) {
      raw = { ...raw, datasets: [{ label: raw.label || raw.yLabel || "", data: raw.data }] };
    }

    const typeKey = String(raw.type || "").toLowerCase().replace(/[^a-z]/g, "").replace(/(chart|graph)$/, "");
    const type = TYPE_MAP[typeKey];
    if (!type) throw new Error(`unsupported chart type "${raw.type}". Use bar, line, pie, doughnut or radar.`);

    if (!Array.isArray(raw.labels) || raw.labels.length === 0) throw new Error("there are no labels.");
    if (!Array.isArray(raw.datasets) || raw.datasets.length === 0) throw new Error("there is no data.");
    if (raw.labels.length > 60) throw new Error("too many labels (max 60).");

    const labels = raw.labels.map(String);
    const circular = type === "pie" || type === "doughnut";
    const source = circular ? raw.datasets.slice(0, 1) : raw.datasets.slice(0, 10);

    const datasets = source.map((d, i) => {
      const values = Array.isArray(d) ? d : d && d.data;
      if (!Array.isArray(values)) throw new Error(`dataset ${i + 1} has no data array.`);
      if (values.length !== labels.length) {
        throw new Error(`dataset ${i + 1} has ${values.length} values but there are ${labels.length} labels.`);
      }
      const nums = values.map(toNumber);
      const bad = nums.findIndex(n => !Number.isFinite(n));
      if (bad !== -1) throw new Error(`"${values[bad]}" (${labels[bad]}) isn't a number.`);
      if (circular && nums.some(n => n < 0)) throw new Error("pie and donut charts can't have negative values.");
      let label = d && !Array.isArray(d) && d.label ? String(d.label) : "";
      if (!label) label = source.length > 1 ? `Series ${i + 1}` : String(raw.yLabel || "Value");
      return { label, data: nums };
    });

    if (circular && datasets[0].data.reduce((a, b) => a + b, 0) <= 0) {
      throw new Error("all the values are zero, so there's nothing to draw.");
    }

    return {
      type,
      title: raw.title ? String(raw.title) : "",
      labels,
      datasets,
      xLabel: raw.xLabel ? String(raw.xLabel) : "",
      yLabel: raw.yLabel ? String(raw.yLabel) : "",
    };
  }

  function hexToRgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function themeColors() {
    const light = document.body.classList.contains("light");
    return light
      ? { light, text: "#1f1f1f", muted: "#666666", grid: "rgba(0,0,0,0.10)", edge: "#ffffff", bg: "#ffffff" }
      : { light, text: "#ececec", muted: "#a3a3a3", grid: "rgba(255,255,255,0.12)", edge: "#171717", bg: "#171717" };
  }

  // Draws the actual numbers on bars and the percentages on pie / donut slices
  const valueLabelPlugin = {
    id: "novaValueLabels",
    afterDatasetsDraw(chart) {
      const type = chart.config.type;
      if (type !== "bar" && type !== "pie" && type !== "doughnut") return;
      const ctx = chart.ctx;
      const t = themeColors();
      ctx.save();
      ctx.font = "600 12px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";

      if (type === "bar") {
        if (chart.data.labels.length * chart.data.datasets.length <= 30) {
          ctx.fillStyle = t.text;
          chart.data.datasets.forEach((ds, di) => {
            const meta = chart.getDatasetMeta(di);
            if (meta.hidden) return;
            meta.data.forEach((bar, i) => {
              const v = ds.data[i];
              if (!Number.isFinite(v)) return;
              ctx.textBaseline = v < 0 ? "top" : "bottom";
              ctx.fillText(fmt(v), bar.x, v < 0 ? bar.y + 4 : bar.y - 4);
            });
          });
        }
      } else {
        const ds = chart.data.datasets[0];
        const meta = chart.getDatasetMeta(0);
        const total = ds.data.reduce((a, b) => a + b, 0);
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.shadowBlur = 4;
        meta.data.forEach((arc, i) => {
          if (!chart.getDataVisibility(i) || !total) return;
          const pct = ds.data[i] / total;
          if (pct < 0.04) return; // too thin to fit a label
          const a = (arc.startAngle + arc.endAngle) / 2;
          const r = (arc.innerRadius + arc.outerRadius) / 2;
          ctx.fillText((pct * 100).toFixed(1) + "%", arc.x + Math.cos(a) * r, arc.y + Math.sin(a) * r);
        });
      }
      ctx.restore();
    },
  };

  function chartConfig(spec, animate) {
    const t = themeColors();
    const circular = spec.type === "pie" || spec.type === "doughnut";

    const datasets = spec.datasets.map((d, i) => {
      const c = PALETTE[i % PALETTE.length];
      if (circular) {
        return { label: d.label, data: d.data, backgroundColor: spec.labels.map((_, j) => PALETTE[j % PALETTE.length]), borderColor: t.edge, borderWidth: 2, hoverOffset: 8 };
      }
      if (spec.type === "bar") {
        return { label: d.label, data: d.data, backgroundColor: hexToRgba(c, 0.85), borderColor: c, borderWidth: 1, borderRadius: 6, maxBarThickness: 64 };
      }
      if (spec.type === "line") {
        return { label: d.label, data: d.data, borderColor: c, backgroundColor: c, borderWidth: 2.5, tension: 0.3, pointRadius: 4, pointHoverRadius: 6, fill: false };
      }
      return { label: d.label, data: d.data, borderColor: c, backgroundColor: hexToRgba(c, 0.2), pointBackgroundColor: c, pointBorderColor: c, borderWidth: 2, pointRadius: 3 };
    });

    const circTotal = circular ? spec.datasets[0].data.reduce((a, b) => a + b, 0) : 0;
    const pctOf = v => (circTotal ? ((v / circTotal) * 100).toFixed(1) : "0.0") + "%";

    const legendLabels = { color: t.text, usePointStyle: true, boxWidth: 9, boxHeight: 9, padding: 14, font: { size: 12 } };
    if (circular) {
      legendLabels.generateLabels = chart => {
        const gen = (Chart.overrides.doughnut && Chart.overrides.doughnut.plugins.legend.labels.generateLabels)
          || Chart.defaults.plugins.legend.labels.generateLabels;
        const items = gen(chart);
        items.forEach(it => {
          const v = chart.data.datasets[0].data[it.index];
          it.text = `${it.text}: ${fmt(v)} (${pctOf(v)})`;
          it.fontColor = t.text;
        });
        return items;
      };
    }

    const options = {
      responsive: true,
      maintainAspectRatio: false,
      animation: animate ? { duration: 700 } : false,
      layout: { padding: { top: spec.type === "bar" ? 18 : 4, right: 6 } },
      plugins: {
        title: { display: !!spec.title, text: spec.title, color: t.text, font: { size: 16, weight: "600" }, padding: { bottom: 12 } },
        legend: { display: true, position: circular ? "bottom" : "top", labels: legendLabels },
        tooltip: circular
          ? { callbacks: { label: c => ` ${c.label}: ${fmt(c.parsed)} (${pctOf(c.parsed)})` } }
          : {},
      },
    };

    if (spec.type === "bar" || spec.type === "line") {
      options.scales = {
        x: {
          ticks: { color: t.muted, maxRotation: 45 },
          grid: { color: t.grid },
          title: { display: !!spec.xLabel, text: spec.xLabel, color: t.muted },
        },
        y: {
          beginAtZero: spec.type === "bar",
          grace: "8%",
          ticks: { color: t.muted },
          grid: { color: t.grid },
          title: { display: !!spec.yLabel, text: spec.yLabel, color: t.muted },
        },
      };
    } else if (spec.type === "radar") {
      options.scales = {
        r: {
          beginAtZero: true,
          angleLines: { color: t.grid },
          grid: { color: t.grid },
          pointLabels: { color: t.text, font: { size: 12 } },
          ticks: { color: t.muted, backdropColor: "transparent", maxTicksLimit: 6 },
        },
      };
    }

    return { type: spec.type, data: { labels: spec.labels, datasets }, options, plugins: [valueLabelPlugin] };
  }

  const liveCharts = new Set();

  function drawChart(entry, animate) {
    if (entry.chart) entry.chart.destroy();
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    entry.chart = new Chart(entry.canvas, chartConfig(entry.spec, animate));
  }

  // Re-draw charts when the light/dark theme is toggled so text stays readable
  let lastLight = document.body.classList.contains("light");
  new MutationObserver(() => {
    const light = document.body.classList.contains("light");
    if (light === lastLight) return;
    lastLight = light;
    liveCharts.forEach(entry => {
      if (!entry.canvas.isConnected) { if (entry.chart) entry.chart.destroy(); liveCharts.delete(entry); return; }
      drawChart(entry, false);
    });
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

  function downloadChartPng(entry) {
    const src = entry.chart.canvas;
    const out = el("canvas");
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext("2d");
    ctx.fillStyle = themeColors().bg;
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(src, 0, 0);
    const slug = (entry.spec.title || "chart").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "chart";
    out.toBlob(blob => { if (blob) downloadFile(`nova-${slug}.png`, blob); }, "image/png");
  }

  function chartError(rawText, message) {
    const box = el("div", "chart-error");
    box.innerHTML = `<div class="chart-error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Couldn't draw this chart: ${escapeHtml(message)}</div>`;
    box.appendChild(buildCodeBlock(rawText, "json"));
    return box;
  }

  function buildChartBlock(rawText) {
    let spec;
    try {
      spec = normalizeChartSpec(JSON.parse(rawText));
    } catch (e) {
      return chartError(rawText, e instanceof SyntaxError ? "the chart data wasn't valid JSON." : e.message);
    }
    if (typeof Chart === "undefined") {
      return chartError(rawText, "the chart library didn't load. Check your connection and refresh.");
    }

    const block = el("div", "chart-block");
    const bar = el("div", "chart-toolbar");
    const kind = el("span", "chart-kind");
    kind.textContent = TYPE_LABEL[spec.type];
    const dl = makeBtn("code-btn", "fa-image", "Save PNG", "Download chart as an image");
    bar.append(kind, dl);

    const wrap = el("div", "chart-canvas-wrap");
    const canvas = el("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${TYPE_LABEL[spec.type]}${spec.title ? ": " + spec.title : ""}`);
    wrap.appendChild(canvas);
    block.append(bar, wrap);

    const entry = { canvas, spec, chart: null };
    liveCharts.add(entry);
    dl.addEventListener("click", () => { if (entry.chart) { downloadChartPng(entry); flash(dl, "fa-image", "Save PNG", "Saved"); } });

    // Chart.js needs the canvas to be in the page before it can measure it,
    // so the actual drawing happens after the message is attached (see renderInto)
    block._entry = entry;
    return block;
  }

  /* ---------------------------------------------------------- */
  /*  Generated images                                           */
  /* ---------------------------------------------------------- */
  const GEN_IMAGE_HOST = "image.pollinations.ai";

  function isGeneratedImageUrl(src) {
    try {
      const u = new URL(src, location.href);
      return u.protocol === "https:" && u.hostname === GEN_IMAGE_HOST;
    } catch (_) { return false; }
  }

  function scrollChat() {
    const chat = document.getElementById("chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  function buildImageCard(src, alt) {
    const card = el("figure", "image-card");
    const frame = el("div", "image-frame loading");
    const status = el("div", "image-status");
    const im = el("img");
    im.alt = alt;
    im.decoding = "async";
    frame.append(status, im);

    const caption = el("figcaption");
    caption.textContent = alt;

    const actions = el("div", "image-actions");
    const dl = makeBtn("code-btn", "fa-download", "Download", "Download image");
    actions.appendChild(dl);
    card.append(frame, caption, actions);

    let attempt = 0;
    function load() {
      frame.classList.remove("failed");
      frame.classList.add("loading");
      status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> <span>Generating your image… this can take a few seconds</span>';
      im.src = attempt ? src + (src.includes("?") ? "&" : "?") + "retry=" + Date.now() : src;
    }
    im.addEventListener("load", () => { frame.classList.remove("loading", "failed"); card.classList.add("ready"); scrollChat(); });
    im.addEventListener("error", () => {
      frame.classList.remove("loading");
      frame.classList.add("failed");
      status.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>Couldn\'t load the image. The free image service allows roughly one image every 15 seconds, so wait a moment and try again.</span>';
      const retry = makeBtn("code-btn", "fa-rotate-right", "Try again", "Try again");
      retry.addEventListener("click", () => { attempt++; load(); });
      status.appendChild(retry);
    });

    dl.addEventListener("click", async () => {
      try {
        const r = await fetch(im.currentSrc || im.src, { cache: "force-cache" });
        if (!r.ok) throw new Error("bad response");
        const blob = await r.blob();
        const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[blob.type] || "jpg";
        downloadFile(`nova-image-${timestamp()}.${ext}`, blob);
        flash(dl, "fa-download", "Download", "Saved");
      } catch (_) {
        window.open(im.currentSrc || im.src, "_blank", "noopener");
        toast("Opened the image in a new tab. Right-click or long-press it to save.");
      }
    });

    load();
    return card;
  }

  /* ---------------------------------------------------------- */
  /*  Math (KaTeX)                                               */
  /*  Delimiters: \( ... \) inline, $$ ... $$ or \[ ... \] block. */
  /*  Plain single $ is never treated as math, so prices like     */
  /*  "$5 to $10" are never misread as a formula.                 */
  /* ---------------------------------------------------------- */
  const MATH_OPEN = "\uE010", MATH_CLOSE = "\uE011"; // private-use markers; markdown/DOMPurify treat them as plain text

  // Swaps fenced code blocks / inline code for placeholders so math delimiters
  // inside code (e.g. a LaTeX example in a code sample) are never touched.
  function protectCode(text) {
    const saved = [];
    const put = s => { saved.push(s); return MATH_OPEN + "CODE" + (saved.length - 1) + MATH_CLOSE; };
    let out = text.replace(/```[\s\S]*?```/g, put).replace(/`[^`\n]+`/g, put);
    return { out, restore: s => s.replace(/\uE010CODE(\d+)\uE011/g, (_, i) => saved[+i]) };
  }

  // Pulls $$...$$, \[...\] and \(...\) out of markdown text and replaces each with a
  // placeholder token, so marked/DOMPurify pass them through untouched as plain text.
  function extractMath(markdown) {
    const { out: codeProtected, restore } = protectCode(markdown);
    const found = [];
    const stash = (display, tex) => { found.push({ display, tex }); return MATH_OPEN + "MATH" + (found.length - 1) + MATH_CLOSE; };
    let out = codeProtected
      .replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => stash(true, tex))
      .replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => stash(true, tex))
      .replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => stash(false, tex));
    return { text: restore(out), math: found };
  }

  // Renders one TeX string to a sanitized <span>. Never throws: bad TeX becomes
  // a small inline error rather than breaking the whole message.
  function renderMathSpan(tex, display) {
    const span = el("span", display ? "math-display" : "math-inline");
    if (typeof katex === "undefined") { span.textContent = display ? `$$${tex}$$` : `\\(${tex}\\)`; return span; }
    try {
      const html = katex.renderToString(tex, { throwOnError: true, displayMode: display, output: "html", strict: "ignore", maxSize: 500, maxExpand: 1000 });
      span.innerHTML = (typeof DOMPurify !== "undefined") ? DOMPurify.sanitize(html) : html;
    } catch (e) {
      span.className += " math-error";
      span.title = e && e.message ? e.message : "Couldn't parse this formula";
      span.textContent = display ? `$$${tex}$$` : `(${tex})`;
    }
    return span;
  }

  // Walks the rendered DOM and swaps each placeholder for its KaTeX span.
  // Skips text inside <code>/<pre> as a second line of defense.
  function renderMathIn(root, mathList) {
    if (!mathList.length) return;
    const re = /\uE010MATH(\d+)\uE011/;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => n.parentElement && n.parentElement.closest("code, pre") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const hits = [];
    let node;
    while ((node = walker.nextNode())) { if (re.test(node.nodeValue)) hits.push(node); }

    hits.forEach(node => {
      const frag = document.createDocumentFragment();
      const parts = node.nodeValue.split(/\uE010MATH(\d+)\uE011/);
      parts.forEach((part, i) => {
        if (i % 2 === 0) { if (part) frag.appendChild(document.createTextNode(part)); return; }
        const m = mathList[+part];
        if (!m) { frag.appendChild(document.createTextNode(part)); return; }
        frag.appendChild(renderMathSpan(m.tex, m.display));
      });
      node.parentNode.replaceChild(frag, node);
    });
  }

    /* ---------------------------------------------------------- */
  /*  Markdown -> DOM                                            */
  /* ---------------------------------------------------------- */
  function enhance(root) {
    const pending = [];

    // Images: only our own generated images are loaded. Anything else an AI reply
    // points to becomes a plain link (auto-loading arbitrary URLs can leak data).
    root.querySelectorAll("img").forEach(img => {
      const src = img.getAttribute("src") || "";
      if (isGeneratedImageUrl(src)) {
        const card = buildImageCard(src, img.getAttribute("alt") || "Generated image");
        const parent = img.parentElement;
        if (parent && parent.tagName === "P" && parent.childNodes.length === 1) parent.replaceWith(card);
        else img.replaceWith(card);
      } else if (/^https?:/i.test(src)) {
        const a = el("a");
        a.href = src;
        a.textContent = img.getAttribute("alt") || src;
        img.replaceWith(a);
      } else {
        img.remove();
      }
    });

    root.querySelectorAll("pre").forEach(pre => {
      const codeEl = pre.querySelector("code");
      const text = (codeEl || pre).textContent;
      const m = codeEl && /(?:^|\s)language-(\S+)/.exec(codeEl.className);
      const lang = m ? m[1] : "";

      if (CHART_LANGS.includes(lang.toLowerCase())) {
        const block = buildChartBlock(text);
        if (block._entry) pending.push(block._entry);
        pre.replaceWith(block);
      } else {
        pre.replaceWith(buildCodeBlock(text, lang));
      }
    });

    root.querySelectorAll("table").forEach(table => {
      const wrap = el("div", "table-wrap");
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });

    root.querySelectorAll("a[href]").forEach(a => {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    });

    return pending;
  }

  function renderInto(target, markdown) {
    const md = String(markdown == null ? "" : markdown);
    if (typeof marked === "undefined" || typeof DOMPurify === "undefined") {
      // Libraries didn't load: show plain, safely-escaped text rather than raw HTML
      target.style.whiteSpace = "pre-wrap";
      target.textContent = md;
      return;
    }
    // Pull out $$...$$, \[...\] and \(...\) before markdown parsing, so marked
    // doesn't mangle backslashes and DOMPurify never has to touch KaTeX's HTML.
    const { text: mdForMarked, math } = extractMath(md);

    let html;
    try { html = marked.parse(mdForMarked, { gfm: true, breaks: true }); }
    catch (_) { html = escapeHtml(md).replace(/\n/g, "<br>"); }

    target.innerHTML = DOMPurify.sanitize(html);
    renderMathIn(target, math);
    const charts = enhance(target);
    // The message is already in the page here, so charts can size themselves
    charts.forEach(entry => drawChart(entry, true));
  }

  /* ---------------------------------------------------------- */
  /*  Plain-text version of a response (for copy / download)     */
  /* ---------------------------------------------------------- */
  function chartToMarkdownTable(spec) {
    const head = ["Category", ...spec.datasets.map(d => d.label)];
    const rows = spec.labels.map((l, i) => [l, ...spec.datasets.map(d => d.data[i])]);
    const line = cells => "| " + cells.map(c => String(c).replace(/\|/g, "\\|")).join(" | ") + " |";
    return [line(head), line(head.map(() => "---")), ...rows.map(line)].join("\n");
  }

  // Chart blocks are JSON; in copied / downloaded text they become a readable table instead
  function responseToText(md) {
    return String(md).replace(/```(?:chart|chartjs|chart\.js|chart-json)[^\n]*\n([\s\S]*?)```/gi, (whole, body) => {
      try {
        const spec = normalizeChartSpec(JSON.parse(body));
        return `**${spec.title || TYPE_LABEL[spec.type]}** (${TYPE_LABEL[spec.type].toLowerCase()})\n\n${chartToMarkdownTable(spec)}\n`;
      } catch (_) { return whole; }
    });
  }

  /* ---------------------------------------------------------- */
  /*  Text-to-speech                                             */
  /* ---------------------------------------------------------- */
  let ttsSession = 0;
  let ttsBtn = null;

  function speakableText(bodyEl) {
    const clone = bodyEl.cloneNode(true);
    clone.querySelectorAll(".code-block, .chart-block, .chart-error").forEach(n => n.remove());
    clone.querySelectorAll("td, th").forEach(n => n.append(", "));
    clone.querySelectorAll("li, h1, h2, h3, h4, h5, h6").forEach(n => n.append(". "));
    clone.querySelectorAll("p, br").forEach(n => n.append(" "));
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }

  // Chrome silently stops long utterances, so read in sentence-sized pieces
  function chunkText(text, max = 220) {
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    const chunks = [];
    let cur = "";
    const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ""; };
    for (let s of sentences) {
      while (s.length > max * 1.5) {
        let cut = s.lastIndexOf(" ", max);
        if (cut < max / 2) cut = max;
        if (cur) push();
        chunks.push(s.slice(0, cut).trim());
        s = s.slice(cut);
      }
      if (cur && (cur + s).length > max) push();
      cur += s;
    }
    push();
    return chunks;
  }

  function stopTTS() {
    ttsSession++;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (ttsBtn) { setBtn(ttsBtn, "fa-volume-high"); ttsBtn.classList.remove("speaking"); ttsBtn.title = "Read aloud"; ttsBtn = null; }
  }

  function toggleTTS(btn, text) {
    if (!("speechSynthesis" in window)) { toast("Read aloud isn't supported in this browser"); return; }
    const sameButton = ttsBtn === btn;
    stopTTS();
    if (sameButton) return;

    const chunks = chunkText(text);
    if (!chunks.length) { toast("Nothing to read aloud in this reply"); return; }

    const session = ++ttsSession;
    ttsBtn = btn;
    setBtn(btn, "fa-stop");
    btn.classList.add("speaking");
    btn.title = "Stop reading";

    chunks.forEach((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      const done = () => {
        if (session !== ttsSession || i !== chunks.length - 1) return;
        setBtn(btn, "fa-volume-high");
        btn.classList.remove("speaking");
        btn.title = "Read aloud";
        ttsBtn = null;
      };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
    });
  }

  /* ---------------------------------------------------------- */
  /*  Public API                                                 */
  /* ---------------------------------------------------------- */
  window.addMsg = function addMsg(role, text, imgSrc) {
    const chat = document.getElementById("chat");
    const isUser = role === "user";
    const content = String(text == null ? "" : text);
    const wrap = el("div", "msg-wrap " + (isUser ? "user" : "ai"));
    chat.appendChild(wrap);

    if (isUser) {
      const parsed = parseAttachedFiles(content);
      const shown = parsed.rest;
      const bubble = el("div", "msg");
      if (parsed.files.length) {
        const chips = el("div", "msg-files");
        parsed.files.forEach(f => {
          const chip = el("span", "msg-file");
          chip.innerHTML = '<i class="fa-solid fa-file-code"></i> ';
          const name = el("span", "msg-file-name");
          name.textContent = f.name;
          const meta = el("span", "msg-file-meta");
          meta.textContent = ` · ${f.lines} line${f.lines === 1 ? "" : "s"}`;
          chip.append(name, meta);
          chips.appendChild(chip);
        });
        bubble.appendChild(chips);
      }
      if (shown) {
        const p = el("div", "msg-text");
        p.textContent = shown;
        bubble.appendChild(p);
      }
      if (imgSrc) {
        const img = el("img");
        img.src = imgSrc;
        img.alt = "Uploaded image";
        bubble.appendChild(img);
      }
      wrap.appendChild(bubble);

      if (shown) {
        const actions = el("div", "msg-actions");
        const copyBtn = makeBtn("msg-action-btn", "fa-copy", "", "Copy message");
        copyBtn.addEventListener("click", async () => {
          if (await copyText(shown)) flash(copyBtn, "fa-copy", "", "");
          else toast("Couldn't copy — your browser blocked it");
        });
        actions.appendChild(copyBtn);
        wrap.appendChild(actions);
      }
    } else {
      const body = el("div", "ai-text msg-content-body");
      wrap.appendChild(body);
      renderInto(body, content);

      const actions = el("div", "msg-actions");
      const ttsButton = makeBtn("msg-action-btn", "fa-volume-high", "", "Read aloud");
      const copyBtn = makeBtn("msg-action-btn", "fa-copy", "", "Copy response");
      const dlBtn = makeBtn("msg-action-btn", "fa-download", "", "Download response");

      ttsButton.addEventListener("click", () => toggleTTS(ttsButton, speakableText(body)));
      copyBtn.addEventListener("click", async () => {
        if (await copyText(responseToText(content))) flash(copyBtn, "fa-copy", "", "");
        else toast("Couldn't copy — your browser blocked it");
      });
      dlBtn.addEventListener("click", () => {
        downloadFile(`nova-response-${timestamp()}.md`, responseToText(content) + "\n", "text/markdown;charset=utf-8");
        flash(dlBtn, "fa-download", "", "");
      });

      actions.append(ttsButton, copyBtn, dlBtn);
      wrap.appendChild(actions);
    }

    scrollChat();
    setTimeout(scrollChat, 60);
    return wrap;
  };

  // Re-draws one saved history entry (text, image + text, attached files, generated images)
  window.addHistoryMsg = function addHistoryMsg(m) {
    if (!m || m.role === "system") return null;
    if (typeof m.content === "string") return window.addMsg(m.role, m.content);
    if (Array.isArray(m.content)) {
      const img = m.content.find(p => p && p.type === "image_url");
      const url = img && img.image_url && img.image_url.url;
      const text = m.content.filter(p => p && p.type === "text").map(p => p.text).join("\n");
      return window.addMsg(m.role, text, typeof url === "string" && url.startsWith("data:image/") ? url : null);
    }
    return null;
  };

  window.addGreeting = function addGreeting() {
    const name = localStorage.getItem("nova_name");
    const greeting = `Hi${name ? ` ${name}` : ""}! I'm Nova, your personal AI assistant by jymer1102. How can I help you?`;
    window.addMsg("ai", greeting);
    if (typeof history !== "undefined" && Array.isArray(history)) {
      history.push({ role: "assistant", content: greeting });
    }
  };

  // Exposed for testing / other scripts
  window.NovaRender = { normalizeChartSpec, responseToText, chunkText, parseImageRequest, parseAttachedFiles, historyTitle, escapeHtml };
})();
