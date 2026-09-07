// RecallAI Chrome Side Panel Logic

document.addEventListener('DOMContentLoaded', async () => {
  let currentLevel = 'overview';
  let currentLang  = 'english';
  let isHandwritten = false;
  let cachedNotes = { overview: {}, summary: {}, detailed: {} };

  const l1Btn   = document.getElementById('sp-l1');
  const l2Btn   = document.getElementById('sp-l2');
  const l3Btn   = document.getElementById('sp-l3');
  const enBtn   = document.getElementById('sp-en');
  const hiBtn   = document.getElementById('sp-hi');
  const hingBtn = document.getElementById('sp-hing');
  const hwBtn   = document.getElementById('sp-toggle-handwritten');
  const liveBtn = document.getElementById('sp-toggle-live');
  const genBtn  = document.getElementById('sp-generate-btn');
  const body    = document.getElementById('sp-body');
  const copyBtn = document.getElementById('sp-copy-btn');
  const dlBtn   = document.getElementById('sp-dl-btn');
  const pdfBtn  = document.getElementById('sp-pdf-btn');

  // ── Level selector ──────────────────────────────────────────
  function setLevel(lvl, btn) {
    currentLevel = lvl;
    [l1Btn, l2Btn, l3Btn].forEach(b => { b.className = 'sp-tab-btn'; });
    const cls = { overview: 'active-l1', summary: 'active-l2', detailed: 'active-l3' };
    btn.classList.add(cls[lvl]);
    if (cachedNotes[currentLevel]?.[currentLang]) {
      renderContent(cachedNotes[currentLevel][currentLang]);
    } else {
      body.innerHTML = `
        <div class="sp-empty">
          <div class="sp-empty-icon">📝</div>
          <div style="font-weight:600;color:#fff;">${lvl.toUpperCase()} Notes Not Generated Yet</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px;max-width:260px;">
            Click below to run the pipeline and generate ${lvl.toUpperCase()} notes for this video.
          </div>
          <button id="sp-quick-gen-btn" class="sp-action-btn" style="margin-top:14px;max-width:240px;">
            ✨ Generate ${lvl.toUpperCase()} Notes
          </button>
        </div>
      `;
      document.getElementById('sp-quick-gen-btn')?.addEventListener('click', () => {
        genBtn.click();
      });
    }
  }
  l1Btn.addEventListener('click', () => setLevel('overview', l1Btn));
  l2Btn.addEventListener('click', () => setLevel('summary',  l2Btn));
  l3Btn.addEventListener('click', () => setLevel('detailed', l3Btn));

  // ── Language selector ────────────────────────────────────────
  function setLang(lang, btn) {
    currentLang = lang;
    [enBtn, hiBtn, hingBtn].forEach(b => b.classList.remove('active-lang'));
    btn.classList.add('active-lang');
    if (cachedNotes[currentLevel]?.[currentLang]) {
      renderContent(cachedNotes[currentLevel][currentLang]);
    } else {
      body.innerHTML = `
        <div class="sp-empty">
          <div class="sp-empty-icon">🌐</div>
          <div style="font-weight:600;color:#fff;">${currentLevel.toUpperCase()} in ${lang.toUpperCase()} Not Generated</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px;max-width:260px;">
            Click below to generate this note in ${lang.toUpperCase()}.
          </div>
          <button id="sp-quick-gen-btn" class="sp-action-btn" style="margin-top:14px;max-width:240px;">
            ✨ Generate in ${lang.toUpperCase()}
          </button>
        </div>
      `;
      document.getElementById('sp-quick-gen-btn')?.addEventListener('click', () => {
        genBtn.click();
      });
    }
  }
  enBtn.addEventListener('click',   () => setLang('english',  enBtn));
  hiBtn.addEventListener('click',   () => setLang('hindi',    hiBtn));
  hingBtn.addEventListener('click', () => setLang('hinglish', hingBtn));

  // ── Handwritten toggle ───────────────────────────────────────
  hwBtn.addEventListener('click', () => {
    isHandwritten = !isHandwritten;
    hwBtn.classList.toggle('active', isHandwritten);
    body.classList.toggle('handwritten', isHandwritten);
  });

  // ── API Key button — opens an inline modal ──────────────────
  const keyBtn = document.getElementById('sp-key-btn');
  if (keyBtn) {
    keyBtn.addEventListener('click', () => showApiKeyModal());
  }

  function showApiKeyModal() {
    // Remove old modal if it exists
    document.getElementById('sp-key-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'sp-key-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(8,12,20,0.85);backdrop-filter:blur(6px);
      z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#0f1520;border:1px solid #263550;border-radius:14px;
                  padding:20px;width:100%;max-width:320px;font-family:'Inter',sans-serif;
                  box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#fff;">🔑 Gemini API Key</div>
          <button id="sp-km-close" style="background:none;border:none;color:#7a8ba8;font-size:18px;cursor:pointer;padding:2px 6px;border-radius:4px;">✕</button>
        </div>

        <div style="background:linear-gradient(135deg,rgba(79,158,248,0.08),rgba(124,91,250,0.08));
                    border:1px solid rgba(79,158,248,0.15);border-radius:10px;padding:12px;margin-bottom:14px;font-size:11.5px;color:#7a8ba8;line-height:1.6;">
          Get your free key at <a href="https://aistudio.google.com/app/apikey" target="_blank"
          style="color:#4f9ef8;text-decoration:none;">Google AI Studio ↗</a> — takes 30 seconds!
          <br>Free: <strong style="color:#e8edf5;">1,500 req/day</strong> · No credit card needed.
        </div>

        <label style="font-size:10px;font-weight:600;color:#7a8ba8;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Your API Key</label>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input id="sp-km-input" type="password" placeholder="AIzaSy…" spellcheck="false"
            style="flex:1;background:#161e2e;border:1px solid #1e2d45;border-radius:8px;
                   padding:8px 10px;color:#fff;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;" />
          <button id="sp-km-show" style="background:#161e2e;border:1px solid #1e2d45;border-radius:8px;
            color:#7a8ba8;cursor:pointer;padding:0 10px;font-size:14px;">👁</button>
        </div>
        <div id="sp-km-status" style="font-size:11px;min-height:16px;margin-bottom:10px;"></div>

        <div style="display:flex;gap:8px;">
          <button id="sp-km-cancel" style="flex:1;background:#161e2e;border:1px solid #1e2d45;
            border-radius:8px;color:#7a8ba8;font-size:12px;font-weight:600;padding:8px;cursor:pointer;">Cancel</button>
          <button id="sp-km-save" style="flex:2;background:linear-gradient(135deg,#4f9ef8,#7c5bfa);
            border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:600;padding:8px;cursor:pointer;
            box-shadow:0 4px 12px rgba(79,158,248,0.3);">✅ Verify & Save</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Load current key
    chrome.storage.local.get(['gemini_api_key'], (res) => {
      const inp = document.getElementById('sp-km-input');
      if (inp && res.gemini_api_key) inp.value = res.gemini_api_key;
    });

    // Toggle visibility
    document.getElementById('sp-km-show').addEventListener('click', () => {
      const inp = document.getElementById('sp-km-input');
      const btn = document.getElementById('sp-km-show');
      inp.type = inp.type === 'password' ? 'text' : 'password';
      btn.textContent = inp.type === 'password' ? '👁' : '🙈';
    });

    // Close modal
    const closeModal = () => modal.remove();
    document.getElementById('sp-km-close').addEventListener('click', closeModal);
    document.getElementById('sp-km-cancel').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    // Save & verify
    document.getElementById('sp-km-save').addEventListener('click', async () => {
      const inp = document.getElementById('sp-km-input');
      const statusEl = document.getElementById('sp-km-status');
      const saveBtn = document.getElementById('sp-km-save');
      const key = inp?.value?.trim() || '';
      if (!key) {
        statusEl.textContent = '⚠️ Please enter your API key.';
        statusEl.style.color = '#f87171';
        return;
      }

      // Save immediately
      await chrome.storage.local.set({ gemini_api_key: key });

      const orig = saveBtn.innerHTML;
      saveBtn.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;"></span> Verifying…';
      saveBtn.disabled = true;
      statusEl.textContent = '🔍 Connecting…';
      statusEl.style.color = '#7a8ba8';

      chrome.runtime.sendMessage({ action: 'TEST_GEMINI_KEY', apiKey: key }, (res) => {
        saveBtn.innerHTML = orig;
        saveBtn.disabled = false;
        if (chrome.runtime.lastError || !res) {
          statusEl.textContent = '✅ Key saved! (offline verify)';
          statusEl.style.color = '#34d399';
          setTimeout(closeModal, 1200);
          return;
        }
        if (res.ok) {
          if (res.modelUsed) chrome.storage.local.set({ last_verified_model: res.modelUsed });
          statusEl.textContent = `✅ Key verified — ${res.modelUsed || 'Gemini Flash'}!`;
          statusEl.style.color = '#34d399';
          setTimeout(closeModal, 1000);
        } else {
          statusEl.textContent = `❌ ${res.error || 'Invalid key. Please check and try again.'}`;
          statusEl.style.color = '#f87171';
          chrome.storage.local.remove('gemini_api_key');
        }
      });
    });

    // Enter key support
    document.getElementById('sp-km-input')?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') document.getElementById('sp-km-save').click();
    });

    // Focus the input
    setTimeout(() => document.getElementById('sp-km-input')?.focus(), 100);
  }

  // ── Helper to check if tab is YouTube ────────────────────────
  function isYouTubeTab(tab) {
    if (!tab?.url) return false;
    return tab.url.includes('youtube.com/watch') ||
           tab.url.includes('youtube.com/live/') ||
           tab.url.includes('youtube.com/shorts/');
  }

  // ── Live mode toggle & sync ──────────────────────────────────
  liveBtn.addEventListener('click', async () => {
    liveBtn.classList.toggle('active-live');
    const isLive = liveBtn.classList.contains('active-live');
    const statusEl = document.getElementById('sp-status');
    if (statusEl) statusEl.textContent = isLive ? 'Live Sync Active' : 'Ready';

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && isYouTubeTab(tab)) {
      chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_LIVE_MODE', enable: isLive }).catch(() => {});
    }
  });

  // ── Periodic tracker update from active tab ──────────────────
  setInterval(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !isYouTubeTab(tab)) {
        const timeEl = document.getElementById('sp-time');
        const statusEl = document.getElementById('sp-status');
        if (timeEl) timeEl.textContent = '--:--';
        if (statusEl) statusEl.textContent = 'No Video';
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_STATE' }, response => {
        if (chrome.runtime.lastError || !response || !response.ok) return;

        const timeEl = document.getElementById('sp-time');
        const statusEl = document.getElementById('sp-status');
        const footerInfo = document.getElementById('sp-footer-info');

        if (timeEl) {
          const cur = formatTime(response.currentTime);
          const dur = response.isLive ? 'LIVE' : formatTime(response.duration);
          timeEl.textContent = `${cur} / ${dur}`;
        }

        if (statusEl) {
          if (response.isLive) {
            statusEl.textContent = '🔴 Live Stream';
            statusEl.style.color = 'var(--red)';
          } else if (response.transcriptCount > 0) {
            statusEl.textContent = `${response.transcriptCount} captions`;
            statusEl.style.color = 'var(--green)';
          } else {
            statusEl.textContent = 'Ready';
            statusEl.style.color = 'var(--text)';
          }
        }

        if (footerInfo) {
          if (response.isLive) {
            footerInfo.textContent = `Live video • ${response.transcriptCount || 0} live captions`;
          } else if (response.transcriptCount > 0) {
            footerInfo.textContent = `Captions ready (${response.transcriptCount} lines)`;
          } else {
            footerInfo.textContent = 'Metadata mode (topic-based)';
          }
        }
      });
    } catch (e) {}
  }, 1200);

  // ── Seek video helper ────────────────────────────────────────
  async function seekVideo(seconds) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'SEEK_VIDEO', seconds }).catch(() => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (sec) => {
            const v = document.querySelector('video');
            if (v) { v.currentTime = sec; v.play(); }
          },
          args: [seconds]
        });
      });
    }
  }

  // ── Complete LaTeX & Math To Readable Symbols Converter ─────
  function formatMathSymbols(str) {
    if (!str) return '';
    let s = str;

    // 1. LaTeX Environments
    s = s.replace(/\\begin\s*\{cases\}([\s\S]*?)\\end\s*\{cases\}/g, (m, inner) => {
      return inner.trim().split(/\\\\|\n/).map(line => {
        line = line.trim();
        if (!line) return '';
        return line.replace(/&/g, '  if  ');
      }).filter(Boolean).join('\n');
    });

    s = s.replace(/\\begin\s*\{(?:aligned|align\*?|equation\*?)\}([\s\S]*?)\\end\s*\{(?:aligned|align\*?|equation\*?)\}/g, (m, inner) => {
      return inner.replace(/&/g, ' ').replace(/\\\\/g, '\n');
    });

    s = s.replace(/\\begin\s*\{(?:[pb]?matrix|matrix)\}([\s\S]*?)\\end\s*\{(?:[pb]?matrix|matrix)\}/g, (m, inner) => {
      const rows = inner.trim().split(/\\\\/).map(r => '[' + r.replace(/&/g, ', ').trim() + ']');
      return '[' + rows.join(', ') + ']';
    });

    s = s.replace(/\\(?:begin|end)\s*\{[a-zA-Z0-9_\*]+\}/g, '');

    // 2. Formatting & Text Tags: \text{...}, \mathrm{...}, \mathbf{...}, \mathit{...}, etc.
    s = s.replace(/\\+(?:text|mathrm|mathbf|mathit|mathsf|operatorname|textbf|textit|emph|textrm|textnormal)\s*\{([^}]+)\}/g, '$1');

    // Blackboard Bold & Calligraphic
    const bbMap = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ', E: '𝔼', V: 'V', E: 'E', G: 'G', S: 'S', B: 'B' };
    s = s.replace(/\\+(?:mathcal|mathbb)\s*\{([A-Z])\}/g, (m, ch) => bbMap[ch] || ch);
    s = s.replace(/\\+(?:mathcal|mathbb)\s*\{([^}]+)\}/g, '$1');

    // Boxed & Over/Underline
    s = s.replace(/\\+boxed\s*\{([^}]+)\}/g, '[$1]');
    s = s.replace(/\\+(?:overline|underline)\s*\{([^}]+)\}/g, '$1');

    // Accents: \vec{x}, \hat{x}, \bar{x}, \tilde{x}, \dot{x}, \ddot{x}
    s = s.replace(/\\+vec\s*\{?([a-zA-Z])\}?/g, '$1⃗');
    s = s.replace(/\\+hat\s*\{?([a-zA-Z])\}?/g, '$1̂');
    s = s.replace(/\\+bar\s*\{?([a-zA-Z])\}?/g, '$1̄');
    s = s.replace(/\\+tilde\s*\{?([a-zA-Z])\}?/g, '$1̃');
    s = s.replace(/\\+dot\s*\{?([a-zA-Z])\}?/g, '$1̇');
    s = s.replace(/\\+ddot\s*\{?([a-zA-Z])\}?/g, '$1̈');

    // Modulo
    s = s.replace(/\\+pmod\s*\{([^}]+)\}/g, '(mod $1)');
    s = s.replace(/\\+(?:bmod|mod)(?![a-zA-Z])/g, ' mod ');

    // 3. Nested Fractions: loop up to 3 times to resolve \frac{1}{\frac{2}{3}}
    for (let f = 0; f < 3; f++) {
      if (!/\\+(?:d?frac|tfrac)\s*\{/.test(s)) break;
      s = s.replace(/\\+(?:d?frac|tfrac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1 / $2)');
    }
    s = s.replace(/\{([^{}]+)\s*\\over\s*([^{}]+)\}/g, '($1 / $2)');
    s = s.replace(/\\+binom\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '($1 choose $2)');

    // Roots
    s = s.replace(/\\+sqrt\s*\[([^\]]+)\]\s*\{([^}]+)\}/g, '$1√($2)');
    s = s.replace(/\\+sqrt\s*\{([^}]+)\}/g, '√($1)');
    s = s.replace(/\\+sqrt(?![a-zA-Z])/g, '√');

    // 4. Delimiters & Brackets
    s = s.replace(/\\+(?:left|right)\./g, '');
    s = s.replace(/\\+(?:left|right)\s*([\(\[\{])/g, '$1');
    s = s.replace(/\\+(?:left|right)\s*([\)\]\}])/g, '$1');
    s = s.replace(/\\+(?:left|right)\s*\|/g, '|');
    s = s.replace(/\\+\{/g, '{').replace(/\\+\}/g, '}');
    s = s.replace(/\\+vert(?![a-zA-Z])/g, '|');
    s = s.replace(/\\+Vert(?![a-zA-Z])/g, '‖');
    s = s.replace(/\\+langle(?![a-zA-Z])/g, '⟨').replace(/\\+rangle(?![a-zA-Z])/g, '⟩');
    s = s.replace(/\\+lceil(?![a-zA-Z])/g, '⌈').replace(/\\+rceil(?![a-zA-Z])/g, '⌉');
    s = s.replace(/\\+lfloor(?![a-zA-Z])/g, '⌊').replace(/\\+rfloor(?![a-zA-Z])/g, '⌋');
    s = s.replace(/\\+mid(?![a-zA-Z])/g, '|');
    s = s.replace(/\\+parallel(?![a-zA-Z])/g, '∥');

    // Spacing
    s = s.replace(/\\+[,;:!]/g, ' ');
    s = s.replace(/\\+(?:quad|qquad|enskip|enspace)/g, '  ');
    s = s.replace(/\\+(?:displaystyle|textstyle|limits|nolimits)/g, '');
    s = s.replace(/\\\\(?:\s*)/g, ' ');

    // 5. Greek Lowercase
    const greekLower = {
      alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
      zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
      lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', varpi: 'π',
      rho: 'ρ', varrho: 'ρ', sigma: 'σ', varsigma: 'σ', tau: 'τ', upsilon: 'υ',
      phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω'
    };
    for (const [k, v] of Object.entries(greekLower)) {
      s = s.replace(new RegExp(`\\\\+${k}(?![a-zA-Z])`, 'g'), v);
    }

    // Greek Uppercase
    const greekUpper = {
      Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ',
      Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω'
    };
    for (const [k, v] of Object.entries(greekUpper)) {
      s = s.replace(new RegExp(`\\\\+${k}(?![a-zA-Z])`, 'g'), v);
    }

    // 6. Calculus & Functions
    const calcOps = [
      [/\\+sum(?![a-zA-Z])/g, '∑'],
      [/\\+prod(?![a-zA-Z])/g, '∏'],
      [/\\+iint(?![a-zA-Z])/g, '∬'],
      [/\\+iiint(?![a-zA-Z])/g, '∭'],
      [/\\+oint(?![a-zA-Z])/g, '∮'],
      [/\\+int(?![a-zA-Z])/g, '∫'],
      [/\\+partial(?![a-zA-Z])/g, '∂'],
      [/\\+nabla(?![a-zA-Z])/g, '∇'],
      [/\\+infty(?![a-zA-Z])/g, '∞'],
      [/\\+ell(?![a-zA-Z])/g, 'ℓ']
    ];
    for (const [re, rep] of calcOps) s = s.replace(re, rep);

    // Standard Math Function names: \min, \max, \log, etc.
    s = s.replace(/\\+(min|max|log|ln|exp|lim|sup|inf|arg|det|dim|gcd|deg|sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan)(?![a-zA-Z])/g, '$1');

    // 7. Relations & Operators
    const ops = [
      [/\\+(?:leq|le)(?![a-zA-Z])/g, '≤'],
      [/\\+(?:geq|ge)(?![a-zA-Z])/g, '≥'],
      [/\\+(?:neq|ne)(?![a-zA-Z])/g, '≠'],
      [/\\+approx(?![a-zA-Z])/g, '≈'],
      [/\\+equiv(?![a-zA-Z])/g, '≡'],
      [/\\+simeq(?![a-zA-Z])/g, '≃'],
      [/\\+cong(?![a-zA-Z])/g, '≅'],
      [/\\+sim(?![a-zA-Z])/g, '∼'],
      [/\\+propto(?![a-zA-Z])/g, '∝'],
      [/\\+pm(?![a-zA-Z])/g, '±'],
      [/\\+mp(?![a-zA-Z])/g, '∓'],
      [/\\+times(?![a-zA-Z])/g, '×'],
      [/\\+(?:cdot|bullet)(?![a-zA-Z])/g, '·'],
      [/\\+circ(?![a-zA-Z])/g, '∘'],
      [/\\+star(?![a-zA-Z])/g, '⋆'],
      [/\\+ast(?![a-zA-Z])/g, '*'],
      [/\\+div(?![a-zA-Z])/g, '÷'],
      [/\\+oplus(?![a-zA-Z])/g, '⊕'],
      [/\\+otimes(?![a-zA-Z])/g, '⊗'],
      [/\\+odot(?![a-zA-Z])/g, '⊙'],
      [/\\+dagger(?![a-zA-Z])/g, '†'],
      [/\\+ddagger(?![a-zA-Z])/g, '‡']
    ];
    for (const [re, rep] of ops) s = s.replace(re, rep);

    // 8. Sets & Logic
    const sets = [
      [/\\+notin(?![a-zA-Z])/g, '∉'],
      [/\\+in(?![a-zA-Z])/g, '∈'],
      [/\\+ni(?![a-zA-Z])/g, '∋'],
      [/\\+subseteq(?![a-zA-Z])/g, '⊆'],
      [/\\+subset(?![a-zA-Z])/g, '⊂'],
      [/\\+supseteq(?![a-zA-Z])/g, '⊇'],
      [/\\+supset(?![a-zA-Z])/g, '⊃'],
      [/\\+subsetneq(?![a-zA-Z])/g, '⊊'],
      [/\\+cap(?![a-zA-Z])/g, '∩'],
      [/\\+cup(?![a-zA-Z])/g, '∪'],
      [/\\+setminus(?![a-zA-Z])/g, '\\'],
      [/\\+(?:emptyset|empty)(?![a-zA-Z])/g, '∅'],
      [/\\+forall(?![a-zA-Z])/g, '∀'],
      [/\\+nexists(?![a-zA-Z])/g, '∄'],
      [/\\+exists(?![a-zA-Z])/g, '∃'],
      [/\\+(?:neg|lnot)(?![a-zA-Z])/g, '¬'],
      [/\\+(?:land|wedge)(?![a-zA-Z])/g, '∧'],
      [/\\+(?:lor|vee)(?![a-zA-Z])/g, '∨'],
      [/\\+models(?![a-zA-Z])/g, '⊨'],
      [/\\+vdash(?![a-zA-Z])/g, '⊢'],
      [/\\+top(?![a-zA-Z])/g, '⊤'],
      [/\\+bot(?![a-zA-Z])/g, '⊥']
    ];
    for (const [re, rep] of sets) s = s.replace(re, rep);

    // 9. Arrows
    const arrows = [
      [/\\+(?:longrightarrow|rightarrow|to)(?![a-zA-Z])/g, '→'],
      [/\\+(?:longleftarrow|leftarrow|gets)(?![a-zA-Z])/g, '←'],
      [/\\+(?:longleftrightarrow|leftrightarrow)(?![a-zA-Z])/g, '↔'],
      [/\\+(?:Longrightarrow|implies|Rightarrow)(?![a-zA-Z])/g, '⇒'],
      [/\\+(?:Longleftarrow|Leftarrow)(?![a-zA-Z])/g, '⇐'],
      [/\\+(?:Longleftrightarrow|iff|Leftrightarrow)(?![a-zA-Z])/g, '⇔'],
      [/\\+mapsto(?![a-zA-Z])/g, '↦'],
      [/\\+uparrow(?![a-zA-Z])/g, '↑'],
      [/\\+downarrow(?![a-zA-Z])/g, '↓']
    ];
    for (const [re, rep] of arrows) s = s.replace(re, rep);

    // Ellipses
    s = s.replace(/\\+(?:ldots|cdots|dots)(?![a-zA-Z])/g, '…');
    s = s.replace(/\\+vdots(?![a-zA-Z])/g, '⋮');
    s = s.replace(/\\+ddots(?![a-zA-Z])/g, '⋱');

    // 10. Superscripts & Subscripts
    const supMap = {
      '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'n': 'ⁿ', 'i': 'ⁱ', 'x': 'ˣ', 'y': 'ʸ', 'k': 'ᵏ',
      'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'm': 'ᵐ', 'p': 'ᵖ', 't': 'ᵗ'
    };
    s = s.replace(/\^\{([^}]+)\}/g, (m, inner) => {
      let conv = '';
      for (const c of inner) conv += supMap[c] !== undefined ? supMap[c] : c;
      return conv.length === inner.length && !conv.includes('^') ? conv : `^(${inner})`;
    });
    s = s.replace(/\^([0-9nixyk\+\-])/g, (m, c) => supMap[c] || `^${c}`);

    const subMap = {
      '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
      '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ',
      'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ'
    };
    s = s.replace(/_\{([^}]+)\}/g, (m, inner) => {
      let conv = '';
      for (const c of inner) conv += subMap[c] !== undefined ? subMap[c] : c;
      return conv.length === inner.length && !conv.includes('_') ? conv : `_${inner}`;
    });
    // Only convert subscript when preceded by alphanumeric/bracket to avoid modifying placeholders
    s = s.replace(/([a-zA-Z0-9\)\}\]])_([0-9aehijklmnoprstuvxk\+\-])/g, (m, p, c) => `${p}${subMap[c] || `_${c}`}`);

    // 11. Final Cleanup: remove any remaining stray backslashes before plain letters
    s = s.replace(/\\+([a-zA-Z]+)/g, '$1');
    s = s.replace(/\\+/g, '');
    s = s.replace(/\$/g, '');

    return s.trim();
  }

  function convertLatexToReadable(text) {
    if (!text || typeof text !== 'string') return '';
    let res = text;

    // 1. Block math: $$...$$ or \[...\]
    res = res.replace(/\$\$([\s\S]*?)\$\$/g, (m, math) => {
      return `\n\n<div class="rc-math-block">${formatMathSymbols(math)}</div>\n\n`;
    });
    res = res.replace(/\\\[([\s\S]*?)\\\]/g, (m, math) => {
      return `\n\n<div class="rc-math-block">${formatMathSymbols(math)}</div>\n\n`;
    });

    // 2. Inline math: $...$ or \(...\)
    res = res.replace(/\$([^\$\n]+?)\$/g, (m, math) => {
      return `<span class="rc-math-inline">${formatMathSymbols(math)}</span>`;
    });
    res = res.replace(/\\\(([^\n]*?)\\\)/g, (m, math) => {
      return `<span class="rc-math-inline">${formatMathSymbols(math)}</span>`;
    });

    // 3. Fallback for stray symbols outside dollar signs
    res = formatMathSymbols(res);

    return res;
  }

  // ── Markdown renderer & interactive elements ───────────────
  let curVideoId = null;
  let curKeyframesMap = {};

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function buildCodeCard(cb) {
    const isDiagram = ['ascii', 'diagram', 'text', 'art', 'flow'].includes(cb.lang) ||
      cb.code.includes('──>') || cb.code.includes('-->') || cb.code.includes('┌') || cb.code.includes('+--');
    const escaped = escapeHtml(cb.code);

    if (isDiagram) {
      return `
        <div class="rc-diagram-box">
          <div class="rc-diagram-box-header">
            <span>📐 Flow &amp; Structure Diagram</span>
          </div>
          <pre class="rc-ascii-art"><code>${escaped}</code></pre>
        </div>
      `;
    }

    const langLabel = (cb.lang || 'CODE').toUpperCase();
    return `
      <div class="rc-code-container">
        <div class="rc-code-header">
          <span class="rc-code-lang">${langLabel}</span>
          <button class="rc-code-copy-btn" title="Copy code">📋 Copy</button>
        </div>
        <pre class="rc-code-pre"><code class="language-${cb.lang || 'text'}">${escaped}</code></pre>
      </div>
    `;
  }

  function buildSvgCard(svgHtml, label) {
    return `
      <div class="rc-graph-card">
        <div class="rc-graph-header">
          <span class="rc-graph-tag">${label || '📈 Concept Graph &amp; Diagram'}</span>
          <button class="rc-graph-expand-btn" title="Inspect &amp; Zoom in HD">🔍 Expand</button>
        </div>
        <div class="rc-graph-viewport">${svgHtml}</div>
      </div>
    `;
  }

  function buildSplitCard(splitId, codeCard, visualCard) {
    return `
      <div class="rc-code-visual-split" id="rc-split-${splitId}">
        <div class="rc-split-nav">
          <div class="rc-split-title">
            <span class="rc-split-badge">⚡ CODE &amp; SIDEWISE VISUALIZATION</span>
          </div>
          <div class="rc-split-tabs">
            <button class="rc-split-tab active" data-view="split" title="View side-by-side">◫ Side-by-Side</button>
            <button class="rc-split-tab" data-view="code" title="View code box only">💻 Code Box</button>
            <button class="rc-split-tab" data-view="visual" title="View visualization only">📈 Visualization</button>
          </div>
        </div>
        <div class="rc-split-panes view-split">
          <div class="rc-split-code-col">
            ${codeCard}
          </div>
          <div class="rc-split-visual-col">
            ${visualCard}
          </div>
        </div>
      </div>
    `;
  }

  function ensureLightboxModal() {
    let lb = document.getElementById('rc-lightbox-modal');
    if (!lb) {
      lb = document.createElement('div');
      lb.id = 'rc-lightbox-modal';
      lb.className = 'rc-lightbox-modal hidden';
      lb.innerHTML = `
        <div class="rc-lightbox-backdrop" id="rc-lb-backdrop"></div>
        <div class="rc-lightbox-dialog">
          <div class="rc-lightbox-header">
            <span class="rc-lightbox-title" id="rc-lb-title">🔍 Visual Inspection</span>
            <div class="rc-lightbox-controls">
              <button class="rc-lightbox-btn" id="rc-lb-zoom-out" title="Zoom Out">➖</button>
              <button class="rc-lightbox-btn" id="rc-lb-zoom-reset" title="Reset Zoom">↺ 100%</button>
              <button class="rc-lightbox-btn" id="rc-lb-zoom-in" title="Zoom In">➕</button>
              <button class="rc-lightbox-btn rc-lightbox-close" id="rc-lb-close" title="Close (Esc)">✕</button>
            </div>
          </div>
          <div class="rc-lightbox-viewport" id="rc-lb-viewport"></div>
          <div class="rc-lightbox-caption" id="rc-lb-caption"></div>
        </div>
      `;
      document.body.appendChild(lb);

      let currentZoom = 1;
      function setZoom(z) {
        currentZoom = Math.min(Math.max(z, 0.4), 3.0);
        const target = lb.querySelector('#rc-lb-viewport > *');
        const resetBtn = lb.querySelector('#rc-lb-zoom-reset');
        if (target) {
          target.style.transform = `scale(${currentZoom})`;
        }
        if (resetBtn) {
          resetBtn.textContent = `↺ ${Math.round(currentZoom * 100)}%`;
        }
      }

      lb.querySelector('#rc-lb-zoom-in')?.addEventListener('click', () => setZoom(currentZoom + 0.25));
      lb.querySelector('#rc-lb-zoom-out')?.addEventListener('click', () => setZoom(currentZoom - 0.25));
      lb.querySelector('#rc-lb-zoom-reset')?.addEventListener('click', () => setZoom(1));
      lb.querySelector('#rc-lb-close')?.addEventListener('click', () => lb.classList.add('hidden'));
      lb.querySelector('#rc-lb-backdrop')?.addEventListener('click', () => lb.classList.add('hidden'));

      window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !lb.classList.contains('hidden')) {
          lb.classList.add('hidden');
        }
      });
    }
    return lb;
  }

  function openLightbox(elementToInspect, titleText, captionText) {
    const lb = ensureLightboxModal();
    const vp = lb.querySelector('#rc-lb-viewport');
    const title = lb.querySelector('#rc-lb-title');
    const cap = lb.querySelector('#rc-lb-caption');

    vp.innerHTML = '';
    const clone = elementToInspect.cloneNode(true);
    clone.style.transform = 'scale(1)';
    vp.appendChild(clone);

    title.textContent = titleText || '🔍 Visual Inspection';
    if (captionText) {
      cap.textContent = captionText;
      cap.style.display = 'block';
    } else {
      cap.style.display = 'none';
    }

    lb.classList.remove('hidden');
    const resetBtn = lb.querySelector('#rc-lb-zoom-reset');
    if (resetBtn) resetBtn.textContent = '↺ 100%';
  }

  function bindSplitViewToggles(container) {
    container.querySelectorAll('.rc-code-visual-split').forEach(splitEl => {
      const panes = splitEl.querySelector('.rc-split-panes');
      const tabs = splitEl.querySelectorAll('.rc-split-tab');

      tabs.forEach(tab => {
        tab.addEventListener('click', e => {
          e.preventDefault();
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const viewMode = tab.getAttribute('data-view');
          if (panes) {
            panes.classList.remove('view-split', 'view-code', 'view-visual');
            panes.classList.add(`view-${viewMode}`);
          }
        });
      });
    });
  }

  function bindLightbox(container) {
    ensureLightboxModal();

    // Expand buttons on SVG graph cards
    container.querySelectorAll('.rc-graph-expand-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const card = btn.closest('.rc-graph-card');
        const svg = card?.querySelector('svg');
        const tag = card?.querySelector('.rc-graph-tag')?.innerText || '📈 Concept Graph & Diagram';
        if (svg) openLightbox(svg, tag, '');
      });
    });

    // Clicking viewport of SVG directly opens Lightbox
    container.querySelectorAll('.rc-graph-viewport').forEach(vp => {
      vp.addEventListener('dblclick', () => {
        const svg = vp.querySelector('svg');
        if (svg) openLightbox(svg, '📈 Concept Graph & Diagram', '');
      });
    });

    // Expand buttons on AI image figure cards
    container.querySelectorAll('.rc-expand-card-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const fig = btn.closest('.rc-figure-card');
        const img = fig?.querySelector('img');
        const cap = fig?.querySelector('.rc-figure-caption')?.innerText || '';
        if (img) openLightbox(img, '🤖 AI Concept Visual (HD)', cap);
      });
    });

    // Clicking the image directly opens Lightbox
    container.querySelectorAll('.rc-figure-img').forEach(img => {
      img.addEventListener('click', () => {
        const fig = img.closest('.rc-figure-card');
        const cap = fig?.querySelector('.rc-figure-caption')?.innerText || '';
        openLightbox(img, '🤖 AI Concept Visual (HD)', cap);
      });
    });
  }

  function bindCodeCopyButtons(container) {
    container.querySelectorAll('.rc-code-copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.preventDefault();
        const codePre = btn.closest('.rc-code-container')?.querySelector('code');
        const codeText = codePre ? codePre.innerText : '';
        if (codeText) {
          navigator.clipboard.writeText(codeText).then(() => {
            const original = btn.innerHTML;
            btn.innerHTML = '✅ Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
              btn.innerHTML = original;
              btn.classList.remove('copied');
            }, 2000);
          });
        }
      });
    });
  }

  function renderMarkdown(md, videoId, keyframesMap) {
    if (!md) return '';

    // 1. Extract & protect fenced code blocks using underscore-free tokens
    const codeBlocks = [];
    md = md.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: (lang || '').trim().toLowerCase(), code: code.trim() });
      return `\n\n@@RCCODEBLOCK${idx}RC@@\n\n`;
    });

    // 2. Extract & protect inline <svg> blocks
    const svgBlocks = [];
    md = md.replace(/<svg[\s\S]*?<\/svg>/gi, (match) => {
      const idx = svgBlocks.length;
      svgBlocks.push(match);
      return `\n\n@@RCSVGBLOCK${idx}RC@@\n\n`;
    });

    // 3. Extract & format Markdown tables
    const tableBlocks = [];
    md = md.replace(/((?:^[ \t]*\|[^\n]+\|[ \t]*(?:\r?\n|$))+)/gm, (tableMatch) => {
      const lines = tableMatch.trim().split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length >= 2) {
        const isSep = /^\|?(\s*:?-+:?\s*\|?)+$/.test(lines[1]);
        if (isSep) {
          const idx = tableBlocks.length;
          const parseRow = row => row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
          const headers = parseRow(lines[0]);
          const rows = lines.slice(2).map(parseRow);

          let tHtml = '<div class="rc-table-wrapper"><table class="rc-table">';
          tHtml += '<thead><tr>' + headers.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
          tHtml += '<tbody>';
          for (const r of rows) {
            tHtml += '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>';
          }
          tHtml += '</tbody></table></div>';
          tableBlocks.push(tHtml);
          return `\n\n@@RCTABLEBLOCK${idx}RC@@\n\n`;
        }
      }
      return tableMatch;
    });

    // 4. Convert LaTeX equations and symbols to clean readable Unicode & HTML
    md = convertLatexToReadable(md);

    // 5. Image & Visuals: Strip unreadable AI diffusion slop; render real keyframes if present
    md = md.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
      let imgSrc = src.trim();

      // Eliminate unreadable AI diffusion images that produce garbled text
      if (imgSrc.startsWith('ai-image:') || imgSrc.includes('pollinations.ai')) {
        return '';
      }

      let isRealKeyframe = false;
      if (imgSrc.startsWith('keyframe:')) {
        const timeKey = imgSrc.replace('keyframe:', '').trim();
        if (keyframesMap && keyframesMap[timeKey]?.dataUrl) {
          imgSrc = keyframesMap[timeKey].dataUrl;
          isRealKeyframe = true;
        } else {
          // Attempt to match closest non-zero captured frame
          const sec = parseInt(timeKey, 10);
          if (!isNaN(sec) && keyframesMap) {
            const validKeys = Object.keys(keyframesMap)
              .map(k => parseInt(k, 10))
              .filter(k => !isNaN(k) && k > 5); // Avoid intro screens < 5s
            if (validKeys.length > 0) {
              const closest = validKeys.reduce((prev, curr) => Math.abs(curr - sec) < Math.abs(prev - sec) ? curr : prev);
              if (keyframesMap[closest]?.dataUrl) {
                imgSrc = keyframesMap[closest].dataUrl;
                isRealKeyframe = true;
              }
            }
          }
        }
        if (!isRealKeyframe) return '';
      }

      if (!imgSrc || imgSrc.startsWith('http://') === false && imgSrc.startsWith('https://') === false && imgSrc.startsWith('data:image') === false) {
        return '';
      }


      return `\n\n<figure class="rc-figure-card ${isAiGen ? 'rc-ai-image-card' : ''}">
        <div class="rc-figure-badge">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="rc-badge-icon">${isAiGen ? '🤖' : '📊'}</span>
            <span>${isAiGen ? 'AI Concept Visual' : 'Concept Diagram'}</span>
          </div>
          <button class="rc-expand-card-btn" title="Inspect &amp; Zoom in HD">🔍 Expand</button>
        </div>
        <div class="rc-figure-img-container">
          <img src="${imgSrc}" alt="${escapeHtml(alt || 'AI Concept Visual')}" class="rc-figure-img" loading="lazy" />
        </div>
        ${alt ? `<figcaption class="rc-figure-caption"><span class="rc-caption-tag">💡 Concept:</span> ${escapeHtml(alt)}</figcaption>` : ''}
      </figure>\n\n`;
    });

    // 6. Interactive Timestamps: [04:23] -> clickable chips
    md = md.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
      const sec = parseTimeStr(timeStr);
      return ` <span class="rc-timestamp" data-sec="${sec}">⏱️ ${timeStr}</span> `;
    });

    // 7. Callout Quotes (> 💡, > ⚠️, > 🎯, > normal blockquote)
    md = md.replace(/^>\s*(.*?)$/gim, (match, content) => {
      let type = 'default';
      let icon = '📌';

      if (content.includes('💡') || /intuition|mental model/i.test(content)) {
        type = 'intuition';
        icon = '💡';
        content = content.replace(/💡/g, '').trim();
      } else if (content.includes('⚠️') || /common mistake|trap|warning|edge case/i.test(content)) {
        type = 'warning';
        icon = '⚠️';
        content = content.replace(/⚠️/g, '').trim();
      } else if (content.includes('🎯') || /exam|strategy|key takeaway/i.test(content)) {
        type = 'exam';
        icon = '🎯';
        content = content.replace(/🎯/g, '').trim();
      }

      return `<div class="rc-callout rc-callout-${type}">
        <div class="rc-callout-icon">${icon}</div>
        <div class="rc-callout-body">${content}</div>
      </div>`;
    });

    // 8. Headers, formatting, and lists
    let html = md
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/---|\*\*\*/gim, '<hr class="rc-divider"/>')
      .replace(/\*\*\*(.*?)\*\*\*/gim, '<b><i>$1</i></b>')
      .replace(/\*\*(.*?)\*\*/gim, '<b>$1</b>')
      .replace(/\*(.*?)\*/gim, '<i>$1</i>')
      .replace(/`([^`]+)`/gim, '<code class="rc-inline-code">$1</code>')
      .replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>')
      .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>');

    // Wrap adjacent <li> in <ul>
    html = html.replace(/(<li>[\s\S]*?<\/li>)/gm, '<ul>$1</ul>');
    html = html.replace(/<\/ul>\s*<ul>/gm, '');

    // Paragraphs for standard lines
    const lines = html.split('\n\n');
    html = lines.map(block => {
      block = block.trim();
      if (!block) return '';
      if (
        block.startsWith('<h') ||
        block.startsWith('<ul') ||
        block.startsWith('<ol') ||
        block.startsWith('<div') ||
        block.startsWith('<figure') ||
        block.startsWith('<hr') ||
        block.startsWith('@@RC')
      ) {
        return block;
      }
      return `<p>${block}</p>`;
    }).join('');

    // 9. Re-inject Markdown Tables (split/join avoids regex replacement issues)
    tableBlocks.forEach((tblHtml, idx) => {
      html = html.split(`@@RCTABLEBLOCK${idx}RC@@`).join(tblHtml);
    });

    // 10. Intelligent Pairing: Detect adjacent Code Block + SVG Graph for Sidewise Presentation
    let splitCounter = 0;

    // Pattern A: Code block immediately followed by SVG block
    html = html.replace(
      /(?:<p>\s*)?@@RCCODEBLOCK(\d+)RC@@(?:\s*<\/p>)?(?:\s*|<p>\s*<\/p>|<(?:h\d|p)[^>]*>[^<]*<\/(?:h\d|p)>\s*)*(?:<p>\s*)?@@RCSVGBLOCK(\d+)RC@@(?:\s*<\/p>)?/gi,
      (match, cIdxStr, sIdxStr) => {
        const cIdx = parseInt(cIdxStr, 10);
        const sIdx = parseInt(sIdxStr, 10);
        if (codeBlocks[cIdx] && svgBlocks[sIdx] && !codeBlocks[cIdx]._used && !svgBlocks[sIdx]._used) {
          codeBlocks[cIdx]._used = true;
          svgBlocks[sIdx]._used = true;
          const codeHtml = buildCodeCard(codeBlocks[cIdx]);
          const svgHtml = buildSvgCard(svgBlocks[sIdx], '📈 Sidewise Visual Walkthrough');
          return `\n\n${buildSplitCard(splitCounter++, codeHtml, svgHtml)}\n\n`;
        }
        return match;
      }
    );

    // Pattern B: SVG block immediately followed by Code block
    html = html.replace(
      /(?:<p>\s*)?@@RCSVGBLOCK(\d+)RC@@(?:\s*<\/p>)?(?:\s*|<p>\s*<\/p>|<(?:h\d|p)[^>]*>[^<]*<\/(?:h\d|p)>\s*)*(?:<p>\s*)?@@RCCODEBLOCK(\d+)RC@@(?:\s*<\/p>)?/gi,
      (match, sIdxStr, cIdxStr) => {
        const sIdx = parseInt(sIdxStr, 10);
        const cIdx = parseInt(cIdxStr, 10);
        if (codeBlocks[cIdx] && svgBlocks[sIdx] && !codeBlocks[cIdx]._used && !svgBlocks[sIdx]._used) {
          codeBlocks[cIdx]._used = true;
          svgBlocks[sIdx]._used = true;
          const codeHtml = buildCodeCard(codeBlocks[cIdx]);
          const svgHtml = buildSvgCard(svgBlocks[sIdx], '📈 Sidewise Visual Walkthrough');
          return `\n\n${buildSplitCard(splitCounter++, codeHtml, svgHtml)}\n\n`;
        }
        return match;
      }
    );

    // Pattern C: Code block followed by ASCII diagram code block
    html = html.replace(
      /(?:<p>\s*)?@@RCCODEBLOCK(\d+)RC@@(?:\s*<\/p>)?(?:\s*|<p>\s*<\/p>|<(?:h\d|p)[^>]*>[^<]*<\/(?:h\d|p)>\s*)*(?:<p>\s*)?@@RCCODEBLOCK(\d+)RC@@(?:\s*<\/p>)?/gi,
      (match, c1Str, c2Str) => {
        const c1 = parseInt(c1Str, 10);
        const c2 = parseInt(c2Str, 10);
        const cb1 = codeBlocks[c1];
        const cb2 = codeBlocks[c2];
        if (cb1 && cb2 && !cb1._used && !cb2._used) {
          const isDiag2 = ['ascii', 'diagram', 'text', 'art', 'flow'].includes(cb2.lang) ||
            cb2.code.includes('──>') || cb2.code.includes('-->') || cb2.code.includes('┌') || cb2.code.includes('+--');
          const isDiag1 = ['ascii', 'diagram', 'text', 'art', 'flow'].includes(cb1.lang) ||
            cb1.code.includes('──>') || cb1.code.includes('-->') || cb1.code.includes('┌') || cb1.code.includes('+--');

          if (!isDiag1 && isDiag2) {
            cb1._used = true;
            cb2._used = true;
            const codeHtml = buildCodeCard(cb1);
            const diagHtml = buildCodeCard(cb2);
            return `\n\n${buildSplitCard(splitCounter++, codeHtml, diagHtml)}\n\n`;
          }
        }
        return match;
      }
    );

    // 11. Re-inject remaining Standalone SVG Blocks
    svgBlocks.forEach((svgHtml, idx) => {
      if (!svgBlocks[idx]._used) {
        html = html.split(`@@RCSVGBLOCK${idx}RC@@`).join(buildSvgCard(svgHtml));
      }
    });

    // 12. Re-inject remaining Standalone Code Blocks
    codeBlocks.forEach((cb, idx) => {
      if (!cb._used) {
        html = html.split(`@@RCCODEBLOCK${idx}RC@@`).join(buildCodeCard(cb));
      }
    });

    return html;
  }

  function parseTimeStr(str) {
    if (!str) return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(str) || 0;
  }

  function renderContent(md) {
    if (!md) return;

    body.innerHTML = renderMarkdown(md, curVideoId, curKeyframesMap);

    body.querySelectorAll('.rc-timestamp').forEach(chip => {
      chip.addEventListener('click', () => {
        const sec = Number(chip.getAttribute('data-sec'));
        if (!isNaN(sec)) seekVideo(sec);
      });
    });

    bindCodeCopyButtons(body);
    bindSplitViewToggles(body);
    bindLightbox(body);
  }

  // ── Read stored transcript/metadata saved by content.js ─────
  function getStoredVideoData() {
    return new Promise(resolve => {
      chrome.storage.local.get(
        ['rc_video_id', 'rc_video_title', 'rc_video_desc', 'rc_chapters', 'rc_transcript', 'gemini_api_key'],
        resolve
      );
    });
  }

  function formatTime(sec) {
    sec = Math.floor(sec || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // ── Generate Notes ──────────────────────────────────────────
  genBtn.addEventListener('click', async () => {
    // Check we're on a YouTube tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!isYouTubeTab(tab)) {
      body.innerHTML = '<div class="sp-empty"><div class="sp-empty-icon">⚠️</div><div>Please open a YouTube video or live stream first.</div></div>';
      return;
    }

    // Load API key
    const stored = await getStoredVideoData();
    let key = stored.gemini_api_key;
    if (!key) {
      const entered = prompt('Please enter your Google Gemini API Key:');
      if (entered && entered.trim()) {
        key = entered.trim();
        await chrome.storage.local.set({ gemini_api_key: key });
      } else {
        body.innerHTML = '<div class="sp-empty"><div class="sp-empty-icon">🔑</div><div>Gemini API key is required. Click the 🔑 icon above to set it.</div></div>';
        return;
      }
    }

    // Query active tab directly for real-time video state (works for Live & VOD)
    let liveState = null;
    try {
      liveState = await new Promise(res => {
        chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_STATE' }, r => {
          if (chrome.runtime.lastError || !r) res(null);
          else res(r);
        });
      });
    } catch (e) {}

    // Track videoId and keyframesMap
    curVideoId = liveState?.videoId || stored.rc_video_id;
    if (liveState?.keyframesMap) {
      curKeyframesMap = liveState.keyframesMap;
    } else if (curVideoId) {
      const kfRes = await new Promise(r => chrome.storage.local.get([`rc_keyframes_${curVideoId}`], r));
      if (kfRes && kfRes[`rc_keyframes_${curVideoId}`]) {
        curKeyframesMap = kfRes[`rc_keyframes_${curVideoId}`];
      }
    }

    // Build source content
    const transcript = (liveState?.transcript?.length > 0 ? liveState.transcript : stored.rc_transcript) || [];
    const vTitle = liveState?.title || stored.rc_video_title || tab.title?.replace(' - YouTube', '') || 'Lecture Video';
    const vDesc  = liveState?.description || stored.rc_video_desc || '';
    const chapters = liveState?.chapters || stored.rc_chapters || '';

    // Show pipeline processing state
    body.innerHTML = `
      <div class="sp-empty">
        <div class="sp-empty-icon">⚙️</div>
        <div style="font-weight:600">Running Lecture Pipeline…</div>
        <div style="font-size:12px;margin-top:6px;color:var(--muted);line-height:1.6">
          1. Cleaning transcript &amp; sentences<br>
          2. Analyzing whiteboard &amp; slide visuals<br>
          3. Combining multimodal lecture feed<br>
          4. Synthesizing ${currentLevel.toUpperCase()} Notes (${currentLang.toUpperCase()})
        </div>
      </div>`;
    genBtn.disabled = true;

    chrome.runtime.sendMessage({
      action: 'RUN_LECTURE_PIPELINE',
      apiKey: key,
      videoId: curVideoId,
      title: vTitle,
      rawTranscript: transcript,
      keyframes: liveState?.keyframes || [],
      currentLevel,
      currentLang
    }, response => {
      genBtn.disabled = false;
      if (response?.ok && response.note) {
        cachedNotes[currentLevel][currentLang] = response.note;
        renderContent(response.note);

        const footerInfo = document.getElementById('sp-footer-info');
        if (footerInfo) {
          footerInfo.textContent = `✅ Complete • ${response.cleanSentenceCount || 0} sentences • Synced to RecallAI platform`;
        }
      } else {
        body.innerHTML = `
          <div class="sp-empty">
            <div class="sp-empty-icon" style="color:var(--red)">✕</div>
            <div style="color:var(--red);font-weight:600;">Pipeline Execution Failed</div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px;">${response?.error || 'Check your Gemini API key.'}</div>
          </div>`;
      }
    });
  });

  // ── Copy ─────────────────────────────────────────────────────
  copyBtn.addEventListener('click', () => {
    const text = cachedNotes[currentLevel]?.[currentLang] || body.innerText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = '✅ Copied!';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 2000);
    });
  });

  // ── Save Markdown ────────────────────────────────────────────
  dlBtn.addEventListener('click', () => {
    const text = cachedNotes[currentLevel]?.[currentLang] || body.innerText;
    if (!text) {
      dlBtn.textContent = '⚠️ No notes yet';
      setTimeout(() => { dlBtn.textContent = '💾 Save .md'; }, 2000);
      return;
    }
    dlBtn.textContent = '⏳ Saving…';
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_FILE',
      text: text,
      mimeType: 'text/markdown;charset=utf-8',
      filename: `RecallAI_Notes_${currentLevel}_${currentLang}.md`
    }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        // Fallback: blob URL anchor (may open tab, but better than nothing)
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `RecallAI_Notes_${currentLevel}_${currentLang}.md`;
        a.click(); URL.revokeObjectURL(url);
      }
      setTimeout(() => { dlBtn.textContent = '💾 Save .md'; }, 1500);
    });
  });

  // ── Download PDF (Print-to-PDF via new window) ───────────────
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      const text = cachedNotes[currentLevel]?.[currentLang];
      if (!text) {
        pdfBtn.textContent = '⚠️ Generate notes first';
        setTimeout(() => { pdfBtn.textContent = '📄 Download PDF'; }, 2000);
        return;
      }

      const title = `RecallAI — ${currentLevel.toUpperCase()} Notes (${currentLang.toUpperCase()})`;
      const renderedHtml = renderMarkdown(text, curVideoId, curKeyframesMap);

      // Try chrome.tabs.create with a blob URL for the print page
      pdfBtn.textContent = '⏳ Preparing PDF…';

      const printWin = window.open('', '_blank');
      if (!printWin) {
        pdfBtn.textContent = '📄 Download PDF';
        // Fallback: use message to background to open print page
        alert('Please allow popups for this extension, then try again.');
        return;
      }

      printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Kalam:wght@300;400;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']]}};<\/script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"><\/script>
  <style>
    @page { margin: 18mm; size: A4 portrait; }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: 'Kalam','Noto Sans Devanagari',cursive,sans-serif; font-size:15px; line-height:1.9; color:#0f172a; background:#fff; padding:24px; max-width:860px; margin:0 auto; }
    h1 { font-family:'Inter',sans-serif; font-size:24px; font-weight:800; color:#1e3a8a; border-bottom:2px solid #3b82f6; padding-bottom:8px; margin:0 0 20px; }
    h2 { font-family:'Inter',sans-serif; font-size:18px; font-weight:700; color:#1d4ed8; background:#eff6ff; border-left:4px solid #3b82f6; padding:8px 14px; margin:24px 0 12px; border-radius:0 6px 6px 0; page-break-after:avoid; }
    h3 { font-family:'Inter',sans-serif; font-size:16px; font-weight:600; color:#334155; border-bottom:1px dashed #cbd5e1; padding-bottom:4px; margin:18px 0 8px; page-break-after:avoid; }
    p { margin-bottom:12px; }
    ul,ol { margin:6px 0 14px 26px; }
    li { margin-bottom:5px; }

    /* Code */
    .rc-code-container { background:#0f172a; border-radius:8px; margin:14px 0; overflow:hidden; border:1px solid #334155; page-break-inside:avoid; }
    .rc-code-header { background:#1e293b; color:#94a3b8; font-size:11px; font-weight:600; padding:6px 14px; display:flex; justify-content:space-between; border-bottom:1px solid #334155; font-family:'Inter',sans-serif; }
    .rc-code-copy-btn { display:none; }
    .rc-code-pre { margin:0; padding:12px 14px; color:#f8fafc; font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.55; overflow-x:auto; }
    .rc-inline-code { font-family:'JetBrains Mono',monospace; font-size:12px; background:#f1f5f9; color:#0369a1; padding:2px 6px; border-radius:4px; }

    /* Diagrams & ASCII */
    .rc-diagram-box { background:#f8fafc; border:1px solid #cbd5e1; border-radius:8px; margin:14px 0; overflow:hidden; page-break-inside:avoid; }
    .rc-diagram-box-header { background:#e2e8f0; color:#334155; font-size:11px; font-weight:700; padding:6px 12px; font-family:'Inter',sans-serif; }
    .rc-ascii-art { font-family:'JetBrains Mono',monospace; font-size:12px; line-height:1.4; padding:12px; margin:0; color:#1e293b; overflow-x:auto; }

    /* Visual Figures */
    .rc-figure-card { margin:16px 0; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; page-break-inside:avoid; }
    .rc-figure-badge { background:#eff6ff; color:#1d4ed8; font-size:11px; font-weight:700; padding:6px 12px; display:flex; align-items:center; gap:6px; font-family:'Inter',sans-serif; border-bottom:1px solid #e2e8f0; }
    .rc-figure-img { width:100%; max-height:380px; object-fit:contain; background:#000; display:block; }
    .rc-figure-caption { padding:8px 14px; font-size:12px; color:#475569; font-style:italic; border-top:1px solid #e2e8f0; background:#fff; }

    /* SVG Cards */
    .rc-svg-card { margin:16px 0; background:#fff; border:1px solid #cbd5e1; border-radius:10px; overflow:hidden; page-break-inside:avoid; }
    .rc-svg-header { background:#eff6ff; color:#1e40af; font-size:11px; font-weight:700; padding:6px 12px; font-family:'Inter',sans-serif; }
    .rc-svg-viewport { padding:14px; display:flex; justify-content:center; background:#f8fafc; }

    /* Callouts */
    .rc-callout { display:flex; gap:12px; padding:12px 16px; margin:14px 0; border-radius:8px; page-break-inside:avoid; }
    .rc-callout-intuition { background:#f0fdf4; border-left:4px solid #22c55e; color:#14532d; }
    .rc-callout-warning { background:#fffbeb; border-left:4px solid #f59e0b; color:#78350f; }
    .rc-callout-exam { background:#faf5ff; border-left:4px solid #a855f7; color:#581c87; }
    .rc-callout-default { background:#f8fafc; border-left:4px solid #64748b; color:#1e293b; }
    .rc-callout-icon { font-size:18px; flex-shrink:0; }
    .rc-callout-body { font-size:13.5px; line-height:1.6; }

    /* Tables */
    .rc-table-wrapper { margin:14px 0; overflow-x:auto; }
    .rc-table { width:100%; border-collapse:collapse; font-size:13.5px; }
    .rc-table th { background:#f1f5f9; padding:8px 12px; border:1px solid #cbd5e1; font-family:'Inter',sans-serif; font-weight:700; color:#1e293b; text-align:left; }
    .rc-table td { padding:8px 12px; border:1px solid #cbd5e1; color:#334155; }

    /* Math */
    .rc-math-inline { font-family:'JetBrains Mono',monospace; font-size:13px; color:#0284c7; background:#f0f9ff; padding:1px 4px; border-radius:4px; }
    .rc-math-block { font-family:'JetBrains Mono',monospace; font-size:14px; color:#0369a1; background:#f0f9ff; border-left:3px solid #0284c7; padding:8px 14px; margin:10px 0; border-radius:0 6px 6px 0; }

    .rc-timestamp { display:none; }
    @media print { body { padding:0; background:transparent; } }
  </style>
</head>
<body>
  ${renderedHtml}
  <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),800));<\/script>
</body>
</html>`);
      printWin.document.close();
      setTimeout(() => { pdfBtn.textContent = '📄 Download PDF'; }, 1000);
    });
  }
});
