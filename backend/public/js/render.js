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
  /*  Markdown -> DOM                                            */
  /* ---------------------------------------------------------- */
  function enhance(root) {
    const pending = [];

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
    let html;
    try { html = marked.parse(md, { gfm: true, breaks: true }); }
    catch (_) { html = escapeHtml(md).replace(/\n/g, "<br>"); }

    target.innerHTML = DOMPurify.sanitize(html);
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
  function scrollChat() {
    const chat = document.getElementById("chat");
    if (chat) chat.scrollTop = chat.scrollHeight;
  }

  window.addMsg = function addMsg(role, text, imgSrc) {
    const chat = document.getElementById("chat");
    const isUser = role === "user";
    const content = String(text == null ? "" : text);
    const wrap = el("div", "msg-wrap " + (isUser ? "user" : "ai"));
    chat.appendChild(wrap);

    if (isUser) {
      const bubble = el("div", "msg");
      if (content) {
        const p = el("div", "msg-text");
        p.textContent = content;
        bubble.appendChild(p);
      }
      if (imgSrc) {
        const img = el("img");
        img.src = imgSrc;
        img.alt = "Uploaded image";
        bubble.appendChild(img);
      }
      wrap.appendChild(bubble);

      if (content) {
        const actions = el("div", "msg-actions");
        const copyBtn = makeBtn("msg-action-btn", "fa-copy", "", "Copy message");
        copyBtn.addEventListener("click", async () => {
          if (await copyText(content)) flash(copyBtn, "fa-copy", "", "");
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

  window.addGreeting = function addGreeting() {
    const name = localStorage.getItem("nova_name");
    const greeting = `Hi${name ? ` ${name}` : ""}! I'm Nova, your personal AI assistant by jymer1102. How can I help you?`;
    window.addMsg("ai", greeting);
    if (typeof history !== "undefined" && Array.isArray(history)) {
      history.push({ role: "assistant", content: greeting });
    }
  };

  // Exposed for testing / other scripts
  window.NovaRender = { normalizeChartSpec, responseToText, chunkText };
})();
