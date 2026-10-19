// RecallAI Chrome Side Panel Logic

document.addEventListener('DOMContentLoaded', async () => {
  let currentLevel = 'overview';
  let currentLang  = 'english';
  let isHandwritten = false;
  let cachedNotes = { overview: {}, summary: {}, detailed: {} };
  let curTimeline = [];
  let curVideoId = null;
  let curVideoTitle = 'Lecture Video';
  let curKeyframesMap = {};

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
  const dlBtn   = document.getElementById('sp-dl-notes-btn') || document.getElementById('sp-dl-btn');
  const pdfBtn  = document.getElementById('sp-pdf-btn');

  // Cloud Save & Topic Search UI Elements
  const cloudSaveBtn       = document.getElementById('sp-cloud-save-btn');
  const cloudSaveFooterBtn = document.getElementById('sp-cloud-save-footer-btn');
  const searchToggleBtn    = document.getElementById('sp-search-toggle-btn');
  const searchPanel        = document.getElementById('sp-search-panel');
  const searchCloseBtn     = document.getElementById('sp-search-close-btn');
  const searchInput        = document.getElementById('sp-search-input');
  const searchClearBtn     = document.getElementById('sp-search-clear-btn');
  const searchExecBtn      = document.getElementById('sp-search-exec-btn');
  const searchScope        = document.getElementById('sp-search-scope');
  const searchBody         = document.getElementById('sp-search-body');
  const searchStats        = document.getElementById('sp-search-stats');

  // Timeline UI Elements
  const timelineToggleBtn = document.getElementById('sp-timeline-toggle-btn');
  const timelinePanel     = document.getElementById('sp-timeline-panel');
  const timelineCloseBtn  = document.getElementById('sp-timeline-close');
  const timelineList      = document.getElementById('sp-timeline-list');
  const timelineCountEl   = document.getElementById('sp-timeline-count');

  if (timelineToggleBtn && timelinePanel) {
    timelineToggleBtn.addEventListener('click', () => {
      timelinePanel.classList.toggle('hidden');
    });
  }
  if (timelineCloseBtn && timelinePanel) {
    timelineCloseBtn.addEventListener('click', () => {
      timelinePanel.classList.add('hidden');
    });
  }

  function showEmptyNotesState(lvl = currentLevel, lang = currentLang) {
    body.innerHTML = `
      <div class="sp-empty">
        <div class="sp-empty-icon">${lvl.toUpperCase()}</div>
        <div style="font-weight:600;color:#fff;">${lvl.toUpperCase()} Notes Not Generated Yet</div>
        <div style="font-size:12px;color:var(--muted);margin-top:6px;max-width:260px;">
          Click below to generate ${lvl.toUpperCase()} notes for this video.
        </div>
        <button id="sp-quick-gen-btn" class="sp-action-btn" style="margin-top:14px;max-width:240px;">
         Generate ${lvl.toUpperCase()} Notes
        </button>
      </div>
    `;
    document.getElementById('sp-quick-gen-btn')?.addEventListener('click', () => {
      genBtn.click();
    });
  }

  // Load existing stored video state on startup — prioritize currently active tab
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
    const activeVId = tab?.url ? getVideoIdFromUrl(tab.url) : null;
    if (activeVId) {
      curVideoId = activeVId;
      curVideoTitle = tab.title?.replace(' - YouTube', '').trim() || 'Current Video';
      chrome.storage.local.get([`rc_cached_notes_${activeVId}`, `rc_timeline_${activeVId}`], res => {
        if (res && res[`rc_cached_notes_${activeVId}`]) {
          cachedNotes = res[`rc_cached_notes_${activeVId}`];
          if (cachedNotes[currentLevel]?.[currentLang]) {
            renderContent(cachedNotes[currentLevel][currentLang]);
          } else {
            showEmptyNotesState();
          }
        } else {
          showEmptyNotesState();
        }
        if (res && Array.isArray(res[`rc_timeline_${activeVId}`])) {
          curTimeline = res[`rc_timeline_${activeVId}`];
          renderTimelinePanel(curTimeline, curVideoId);
        }
      });
    } else {
      chrome.storage.local.get(['rc_video_id', 'rc_video_title', 'rc_timeline', 'rc_cached_notes'], res => {
        if (res.rc_video_id) curVideoId = res.rc_video_id;
        if (res.rc_video_title) curVideoTitle = res.rc_video_title;
        if (Array.isArray(res.rc_timeline) && res.rc_timeline.length > 0) {
          curTimeline = res.rc_timeline;
          renderTimelinePanel(curTimeline, curVideoId);
        }
        if (res.rc_cached_notes) {
          cachedNotes = res.rc_cached_notes;
        }
      });
    }
  }).catch(() => {});

  // ── Level selector ──────────────────────────────────────────
  function setLevel(lvl, btn) {
    currentLevel = lvl;
    [l1Btn, l2Btn, l3Btn].forEach(b => { b.className = 'sp-tab-btn'; });
    const cls = { overview: 'active-l1', summary: 'active-l2', detailed: 'active-l3' };
    btn.classList.add(cls[lvl]);
    if (cachedNotes[currentLevel]?.[currentLang]) {
      renderContent(cachedNotes[currentLevel][currentLang]);
    } else {
      showEmptyNotesState(lvl, currentLang);
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
      showEmptyNotesState(currentLevel, lang);
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
      position:fixed;inset:0;background:rgba(0,0,0,0.8);
      z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#141414;border:1px solid #2a2a2a;border-radius:6px;
                  padding:18px;width:100%;max-width:300px;font-family:'Inter',sans-serif;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
          <div style="font-size:13px;font-weight:600;color:#e0e0e0;">Gemini API Key</div>
          <button id="sp-km-close" style="background:none;border:1px solid #2a2a2a;color:#6b6b6b;font-size:13px;cursor:pointer;padding:2px 8px;border-radius:3px;">x</button>
        </div>

        <div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;padding:10px;margin-bottom:12px;font-size:11.5px;color:#6b6b6b;line-height:1.6;">
          Get your free key at <a href="https://aistudio.google.com/app/apikey" target="_blank"
          style="color:#4a90d9;text-decoration:none;">Google AI Studio</a> &mdash; takes 30 seconds.
          <br>Free: <strong style="color:#e0e0e0;">1,500 req/day</strong> &middot; No credit card needed.
        </div>

        <label style="font-size:10px;font-weight:600;color:#6b6b6b;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:6px;">Your API Key</label>
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <input id="sp-km-input" type="password" placeholder="AIzaSy..." spellcheck="false"
            style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;
                   padding:7px 9px;color:#e0e0e0;font-family:'JetBrains Mono',monospace;font-size:11px;outline:none;" />
          <button id="sp-km-show" style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:4px;
            color:#6b6b6b;cursor:pointer;padding:0 10px;font-size:11px;font-weight:600;">Show</button>
        </div>
        <div id="sp-km-status" style="font-size:11px;min-height:16px;margin-bottom:10px;"></div>

        <div style="display:flex;gap:8px;">
          <button id="sp-km-cancel" style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;
            border-radius:4px;color:#6b6b6b;font-size:12px;font-weight:600;padding:8px;cursor:pointer;">Cancel</button>
          <button id="sp-km-save" style="flex:2;background:#4a90d9;
            border:none;border-radius:4px;color:#fff;font-size:12px;font-weight:600;padding:8px;cursor:pointer;">Verify &amp; Save</button>
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
      btn.textContent = inp.type === 'password' ? 'Show' : 'Hide';
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
        statusEl.textContent = 'Please enter your API key.';
        statusEl.style.color = '#c0524f';
        return;
      }

      // Save immediately
      await chrome.storage.local.set({ gemini_api_key: key });

      const orig = saveBtn.innerHTML;
      saveBtn.innerHTML = 'Verifying...';
      saveBtn.disabled = true;
      statusEl.textContent = 'Connecting...';
      statusEl.style.color = '#6b6b6b';

      chrome.runtime.sendMessage({ action: 'TEST_GEMINI_KEY', apiKey: key }, (res) => {
        saveBtn.innerHTML = orig;
        saveBtn.disabled = false;
        if (chrome.runtime.lastError || !res) {
          statusEl.textContent = 'Key saved (offline verify).';
          statusEl.style.color = '#5a9e6f';
          setTimeout(closeModal, 1200);
          return;
        }
        if (res.ok) {
          if (res.modelUsed) chrome.storage.local.set({ last_verified_model: res.modelUsed });
          statusEl.textContent = `Key verified — ${res.modelUsed || 'Gemini Flash'}.`;
          statusEl.style.color = '#5a9e6f';
          setTimeout(closeModal, 1000);
        } else {
          statusEl.textContent = res.error || 'Invalid key. Please check and try again.';
          statusEl.style.color = '#c0524f';
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

  function getVideoIdFromUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const match = u.pathname.match(/\/(live|shorts)\/([a-zA-Z0-9_-]+)/);
      if (match) return match[2];
    } catch(e) {}
    return null;
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

  // ── Refresh Active Video & Channel Info ───────────────────────
  async function refreshActiveTabInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const timeEl = document.getElementById('sp-time');
      const statusEl = document.getElementById('sp-status');
      const titleEl = document.getElementById('sp-video-title');
      const channelEl = document.getElementById('sp-channel-text');

      if (!tab?.id || !isYouTubeTab(tab)) {
        if (timeEl) timeEl.textContent = '--:--';
        if (statusEl) statusEl.textContent = 'No Video';
        if (titleEl) {
          titleEl.textContent = 'Open a YouTube video';
          titleEl.title = 'No YouTube video detected in active tab';
        }
        if (channelEl) channelEl.textContent = 'Waiting for video...';
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_STATE' }, response => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          // Tab title fallback
          if (titleEl && tab.title) {
            const cleanTitle = tab.title.replace(' - YouTube', '').trim();
            titleEl.textContent = cleanTitle;
            titleEl.title = cleanTitle;
          }
          return;
        }

        const footerInfo = document.getElementById('sp-footer-info');

        if (titleEl && response.title) {
          titleEl.textContent = response.title;
          titleEl.title = response.title;
        }

        if (channelEl && response.channel) {
          channelEl.textContent = response.channel;
        } else if (channelEl && !channelEl.textContent.trim()) {
          channelEl.textContent = 'YouTube Creator';
        }

        if (timeEl) {
          const cur = formatTime(response.currentTime);
          const dur = response.isLive ? 'LIVE' : formatTime(response.duration);
          timeEl.textContent = `${cur} / ${dur}`;
        }

        if (statusEl) {
          if (response.isLive) {
            statusEl.textContent = ' Live Stream';
            statusEl.style.color = 'var(--red)';
          } else if (response.transcriptCount > 0) {
            statusEl.textContent = `${response.transcriptCount} captions`;
            statusEl.style.color = 'var(--green)';
          } else {
            statusEl.textContent = 'Ready';
            statusEl.style.color = 'var(--text)';
          }
        }

        const activeVideoId = response.videoId || getVideoIdFromUrl(tab.url);
        if (activeVideoId && activeVideoId !== curVideoId) {
          console.log('[RecallAI Sidepanel] Detected active video switch:', activeVideoId, '(was:', curVideoId, ')');
          curVideoId = activeVideoId;
          curVideoTitle = response.title || (titleEl ? titleEl.textContent : '') || '';
          curKeyframesMap = response.keyframesMap || {};
          cachedNotes = { overview: {}, summary: {}, detailed: {} };
          curTimeline = [];
          renderTimelinePanel([], curVideoId);

          chrome.storage.local.get([`rc_cached_notes_${activeVideoId}`, `rc_timeline_${activeVideoId}`], res => {
            if (res && res[`rc_cached_notes_${activeVideoId}`]) {
              cachedNotes = res[`rc_cached_notes_${activeVideoId}`];
              if (cachedNotes[currentLevel]?.[currentLang]) {
                renderContent(cachedNotes[currentLevel][currentLang]);
              } else {
                showEmptyNotesState();
              }
            } else {
              showEmptyNotesState();
            }
            if (res && Array.isArray(res[`rc_timeline_${activeVideoId}`])) {
              curTimeline = res[`rc_timeline_${activeVideoId}`];
              renderTimelinePanel(curTimeline, curVideoId);
            }
          });
        }

        if (footerInfo) {
          if (response.isLive) {
            footerInfo.textContent = `Live video • ${response.transcriptCount || 0} live captions`;
          } else if (response.transcriptCount > 0) {
            footerInfo.textContent = `Captions ready (${response.transcriptCount} lines)`;
          } else {
            footerInfo.textContent = 'Captions detecting / unavailable';
          }
        }
      });
    } catch (e) {}
  }

  // Periodic tracker update from active tab
  setInterval(refreshActiveTabInfo, 1200);

  // Instant refresh when user switches tab or navigates
  chrome.tabs.onActivated?.addListener(refreshActiveTabInfo);
  chrome.tabs.onUpdated?.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || changeInfo.title || changeInfo.url) {
      refreshActiveTabInfo();
    }
  });

  // ── Seek video helper ────────────────────────────────────────
  async function seekVideo(seconds) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'SEEK_VIDEO', seconds }).catch(() => {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (sec) => {
            const v = document.querySelector('#movie_player video.html5-main-video')
              || document.querySelector('#movie_player video')
              || document.querySelector('video');
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

  // ── Timeline UI and Markdown Builders ─────────────────────────
  function renderTimelinePanel(timeline, videoId) {
    if (!timelineList) return;
    if (!Array.isArray(timeline) || timeline.length === 0) {
      timelineList.innerHTML = '<div class="sp-timeline-empty">Timeline will appear after generating notes.</div>';
      if (timelineCountEl) timelineCountEl.textContent = '';
      return;
    }

    if (timelineCountEl) timelineCountEl.textContent = `${timeline.length} chapters`;

    timelineList.innerHTML = timeline.map(item => {
      const sec = typeof item.timestamp === 'number' ? item.timestamp : parseTimeStr(item.time_str);
      const timeStr = item.time_str || formatTime(sec);
      const ytUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}&t=${sec}s` : '#';
      return `
        <div class="sp-timeline-item" data-sec="${sec}">
          <button class="sp-timeline-jump-btn" data-sec="${sec}" title="Jump video to ${timeStr}">
            ▶ ${timeStr}
          </button>
          <div class="sp-timeline-text">
            <div class="sp-timeline-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
            ${item.summary ? `<div class="sp-timeline-summary">${escapeHtml(item.summary)}</div>` : ''}
          </div>
          <a href="${ytUrl}" target="_blank" class="sp-timeline-yt-link" title="Open YouTube at ${timeStr}">↗</a>
        </div>
      `;
    }).join('');

    timelineList.querySelectorAll('.sp-timeline-jump-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const sec = Number(btn.getAttribute('data-sec'));
        if (!isNaN(sec)) seekVideo(sec);
      });
    });
  }

  function buildTimelineCardHtml(timeline, videoId) {
    if (!Array.isArray(timeline) || timeline.length === 0) return '';

    return `
      <div class="rc-timeline-card" id="rc-lecture-timeline">
        <div class="rc-timeline-header">
          <div class="rc-timeline-title">
            <span>Video Timeline</span>
          </div>
          <span class="rc-timeline-count-badge">${timeline.length} segments</span>
        </div>
        <p class="rc-timeline-subtitle">Click any timestamp to jump to that part of the lecture on YouTube.</p>
        <div class="rc-timeline-table-wrap">
          <table class="rc-timeline-table">
            <thead>
              <tr>
                <th style="width:110px;">Timestamp</th>
                <th>Topic &amp; Core Concept</th>
                <th style="width:105px;text-align:center;">Watch Video</th>
              </tr>
            </thead>
            <tbody>
              ${timeline.map(item => {
                const sec = typeof item.timestamp === 'number' ? item.timestamp : parseTimeStr(item.time_str);
                const timeStr = item.time_str || formatTime(sec);
                const ytUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}&t=${sec}s` : '#';
                return `
                  <tr>
                    <td>
                      <a href="${ytUrl}" target="_blank" class="rc-timeline-pill" data-sec="${sec}" title="Watch at ${timeStr}">
                        ${timeStr}
                      </a>
                    </td>
                    <td>
                      <strong class="rc-timeline-topic">${escapeHtml(item.title || 'Topic Segment')}</strong>
                      ${item.summary ? `<div class="rc-timeline-desc">${escapeHtml(item.summary)}</div>` : ''}
                    </td>
                    <td style="text-align:center;">
                      <a href="${ytUrl}" target="_blank" class="rc-timeline-jump-link" data-sec="${sec}">
                        Watch ↗
                      </a>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function buildTimelineMarkdown(timeline, videoId) {
    if (!Array.isArray(timeline) || timeline.length === 0) return '';
    let tmd = `## Important Lecture Timeline & Video Jumps\n\n`;
    tmd += `| Timestamp | Topic & Concept | Watch on YouTube |\n`;
    tmd += `| :--- | :--- | :--- |\n`;
    for (const item of timeline) {
      const sec = typeof item.timestamp === 'number' ? item.timestamp : parseTimeStr(item.time_str);
      const timeStr = item.time_str || formatTime(sec);
      const ytUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}&t=${sec}s` : '#';
      const title = (item.title || 'Topic Segment').replace(/\|/g, '-');
      const summary = (item.summary || '').replace(/\|/g, '-');
      const topicText = summary ? `**${title}** — ${summary}` : `**${title}**`;
      tmd += `| [${timeStr}](${ytUrl}) | ${topicText} | [Watch Video ↗](${ytUrl}) |\n`;
    }
    tmd += `\n***\n\n`;
    return tmd;
  }

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
    const rawCode = cb.code.trim();
    if (rawCode.startsWith('<svg') && rawCode.endsWith('</svg>')) {
      return buildSvgCard(rawCode, 'Concept Graph & Diagram');
    }

    const isDiagram = ['ascii', 'diagram', 'text', 'art', 'flow'].includes(cb.lang) ||
      cb.code.includes('──>') || cb.code.includes('-->') || cb.code.includes('┌') || cb.code.includes('+--');
    const escaped = escapeHtml(cb.code);

    if (isDiagram) {
      return `
        <div class="rc-diagram-box">
          <div class="rc-diagram-box-header">
            <span> Flow &amp; Structure Diagram</span>
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
          <button class="rc-code-copy-btn" title="Copy code">Copy</button>
        </div>
        <pre class="rc-code-pre"><code class="language-${cb.lang || 'text'}">${escaped}</code></pre>
      </div>
    `;
  }

  function buildSvgCard(svgHtml, label) {
    return `
      <div class="rc-graph-card">
        <div class="rc-graph-header">
          <span class="rc-graph-tag">${label || 'Concept Graph &amp; Diagram'}</span>
          <button class="rc-graph-expand-btn" title="Inspect &amp; Zoom in HD">Expand</button>
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
            <span class="rc-split-badge"> CODE &amp; VISUALIZATION</span>
          </div>
          <div class="rc-split-tabs">
            <button class="rc-split-tab active" data-view="split" title="View side-by-side">Side-by-Side</button>
            <button class="rc-split-tab" data-view="code" title="View code box only">Code</button>
            <button class="rc-split-tab" data-view="visual" title="View visualization only">Visualization</button>
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
            <span class="rc-lightbox-title" id="rc-lb-title">Visual Inspection</span>
            <div class="rc-lightbox-controls">
              <button class="rc-lightbox-btn" id="rc-lb-zoom-out" title="Zoom Out">Zoom Out</button>
              <button class="rc-lightbox-btn" id="rc-lb-zoom-reset" title="Reset Zoom">Reset</button>
              <button class="rc-lightbox-btn" id="rc-lb-zoom-in" title="Zoom In">Zoom In</button>
              <button class="rc-lightbox-btn rc-lightbox-close" id="rc-lb-close" title="Close (Esc)">Close</button>
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
          resetBtn.textContent = `Reset ${Math.round(currentZoom * 100)}%`;
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

    title.textContent = titleText || 'Visual Inspection';
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
        const tag = card?.querySelector('.rc-graph-tag')?.innerText || ' Concept Graph & Diagram';
        if (svg) openLightbox(svg, tag, '');
      });
    });

    // Clicking viewport of SVG directly opens Lightbox
    container.querySelectorAll('.rc-graph-viewport').forEach(vp => {
      vp.addEventListener('dblclick', () => {
        const svg = vp.querySelector('svg');
        if (svg) openLightbox(svg, ' Concept Graph & Diagram', '');
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
        if (img) openLightbox(img, ' AI Concept Visual (HD)', cap);
      });
    });

    // Clicking the image directly opens Lightbox
    container.querySelectorAll('.rc-figure-img').forEach(img => {
      img.addEventListener('click', () => {
        const fig = img.closest('.rc-figure-card');
        const cap = fig?.querySelector('.rc-figure-caption')?.innerText || '';
        openLightbox(img, ' AI Concept Visual (HD)', cap);
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
            btn.innerHTML = ' Copied!';
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

  function renderMarkdown(md, videoId, keyframesMap, timeline) {
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
            <span class="rc-badge-icon">${isAiGen ? '' : ''}</span>
            <span>${isAiGen ? 'AI Concept Visual' : 'Concept Diagram'}</span>
          </div>
          <button class="rc-expand-card-btn" title="Inspect &amp; Zoom in HD">Expand</button>
        </div>
        <div class="rc-figure-img-container">
          <img src="${imgSrc}" alt="${escapeHtml(alt || 'AI Concept Visual')}" class="rc-figure-img" loading="lazy" />
        </div>
        ${alt ? `<figcaption class="rc-figure-caption"><span class="rc-caption-tag">Concept:</span> ${escapeHtml(alt)}</figcaption>` : ''}
      </figure>\n\n`;
    });

    // 6. Interactive Timestamps: [04:23] -> clickable links & chips
    md = md.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
      const sec = parseTimeStr(timeStr);
      const ytUrl = (videoId || curVideoId) ? `https://www.youtube.com/watch?v=${videoId || curVideoId}&t=${sec}s` : '#';
      return ` <a href="${ytUrl}" target="_blank" class="rc-timestamp" data-sec="${sec}" title="Jump video to ${timeStr}">${timeStr}</a> `;
    });

    // 7. Callout Quotes (> Intuition, > Warning, > Exam Strategy, > normal blockquote)
    md = md.replace(/^>\s*(.*?)$/gim, (match, rawContent) => {
      let content = rawContent.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}]/gu, '').trim();
      let type = 'default';
      let label = 'Note:';

      if (/intuition|mental model/i.test(content)) {
        type = 'intuition';
        label = 'Core Intuition:';
      } else if (/common mistake|trap|warning|edge case/i.test(content)) {
        type = 'warning';
        label = 'Important / Warning:';
      } else if (/exam|strategy|key takeaway/i.test(content)) {
        type = 'exam';
        label = 'Exam Strategy:';
      }

      return `<div class="rc-callout rc-callout-${type}">
        <div class="rc-callout-body"><strong>${label}</strong> ${content}</div>
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
          const svgHtml = buildSvgCard(svgBlocks[sIdx], 'Sidewise Visual Walkthrough');
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
          const svgHtml = buildSvgCard(svgBlocks[sIdx], 'Sidewise Visual Walkthrough');
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

    const activeTimeline = (Array.isArray(timeline) && timeline.length > 0) ? timeline : curTimeline;
    const timelineCard = buildTimelineCardHtml(activeTimeline, videoId || curVideoId);
    return timelineCard + html;
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

    body.innerHTML = renderMarkdown(md, curVideoId, curKeyframesMap, curTimeline);

    // Bind timestamp & timeline clicks to seek the video in current active tab
    body.querySelectorAll('.rc-timestamp, .rc-timeline-pill, .rc-timeline-jump-link').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const sec = Number(chip.getAttribute('data-sec'));
        if (!isNaN(sec)) {
          e.preventDefault();
          seekVideo(sec);
        }
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

  function parseTranscriptData(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const trimmed = rawText.trim();

    // 1. JSON3 format (modern YouTube)
    if (trimmed.startsWith('{')) {
      try {
        const data = JSON.parse(trimmed);
        if (Array.isArray(data.events)) {
          const res = [];
          for (const ev of data.events) {
            if (!ev.segs || ev.segs.length === 0) continue;
            const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
            if (text) {
              res.push({
                start: (ev.tStartMs || 0) / 1000,
                duration: (ev.dDurationMs || 0) / 1000,
                text: text
              });
            }
          }
          if (res.length > 0) return res;
        }
      } catch (e) {}
    }

    // 2. XML timedtext format
    if (trimmed.includes('<text')) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(trimmed, 'text/xml');
        const textNodes = xmlDoc.getElementsByTagName('text');
        const items = [];
        for (let i = 0; i < textNodes.length; i++) {
          const node = textNodes[i];
          const start = parseFloat(node.getAttribute('start') || '0');
          const dur   = parseFloat(node.getAttribute('dur') || '0');
          const d = document.createElement('div');
          d.innerHTML = node.textContent;
          const text = d.textContent.replace(/\n/g, ' ').trim();
          if (text) items.push({ start, duration: dur, text });
        }
        if (items.length > 0) return items;
      } catch (e) {}
    }

    return [];
  }

  // Direct extraction from YouTube active tab DOM (MAIN world)
  async function getCaptionTracksFromTab(tabId, targetVideoId) {
    if (!tabId) return [];
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (vId) => {
          try {
            // 1. Check live movie_player
            const mp = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            if (mp) {
              if (typeof mp.getPlayerResponse === 'function') {
                const pr = mp.getPlayerResponse();
                const pVid = pr?.videoDetails?.videoId;
                if (!vId || !pVid || pVid === vId) {
                  const tr = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                  if (Array.isArray(tr) && tr.length > 0) return { ok: true, tracks: tr, source: 'mp.getPlayerResponse' };
                }
              }
              if (typeof mp.getOption === 'function') {
                const tr = mp.getOption('captions', 'tracklist');
                if (Array.isArray(tr) && tr.length > 0) return { ok: true, tracks: tr, source: 'mp.getOption' };
              }
            }

            // 2. Check window.ytInitialPlayerResponse
            if (window.ytInitialPlayerResponse) {
              const pr = window.ytInitialPlayerResponse;
              const pVid = pr?.videoDetails?.videoId;
              if (!vId || !pVid || pVid === vId) {
                const tr = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
                if (Array.isArray(tr) && tr.length > 0) return { ok: true, tracks: tr, source: 'ytInitialPlayerResponse' };
              }
            }

            // 3. Check yt.player
            if (window.yt?.player?.getPlayerByElement) {
              const pr = window.yt.player.getPlayerByElement(mp)?.getPlayerResponse?.();
              const tr = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
              if (Array.isArray(tr) && tr.length > 0) return { ok: true, tracks: tr, source: 'yt.player' };
            }
          } catch (e) {
            return { ok: false, error: e.message };
          }
          return { ok: false, tracks: [] };
        },
        args: [targetVideoId]
      });

      const res = results?.[0]?.result;
      if (res?.ok && Array.isArray(res.tracks) && res.tracks.length > 0) {
        console.log(`[RecallAI] Extracted ${res.tracks.length} caption tracks from tab (${res.source})`);
        return res.tracks;
      }
    } catch (e) {
      console.warn('[RecallAI] MAIN world script notice:', e);
    }
    return [];
  }

  async function fetchTranscriptFromTracks(tracks, vId) {
    if (!tracks || tracks.length === 0) return [];
    // Prioritize English then Hindi
    const sorted = [...tracks].sort((a, b) => {
      const aLang = (a.languageCode || '').toLowerCase();
      const bLang = (b.languageCode || '').toLowerCase();
      const aScore = aLang.startsWith('en') ? (a.kind === 'asr' ? 2 : 1) : (aLang.startsWith('hi') ? 3 : 4);
      const bScore = bLang.startsWith('en') ? (b.kind === 'asr' ? 2 : 1) : (bLang.startsWith('hi') ? 3 : 4);
      return aScore - bScore;
    });

    for (const track of sorted) {
      if (!track.baseUrl) continue;
      const base = track.baseUrl;
      const urls = base.includes('fmt=') ? [base] : [base + '&fmt=json3', base];

      for (const u of urls) {
        try {
          const res = await new Promise(r => {
            chrome.runtime.sendMessage({ action: 'FETCH_TRANSCRIPT_URL', url: u }, r);
          });
          if (res && res.ok && res.text) {
            const parsed = parseTranscriptData(res.text);
            if (parsed.length > 0) {
              console.log(`[RecallAI] Retrieved ${parsed.length} caption lines for ${vId}`);
              return parsed;
            }
          }
        } catch (e) {}
      }
    }
    return [];
  }

  async function getActiveYouTubeTab() {
    try {
      // 1. Check last focused window (the browser window containing the active page)
      const [lastFocused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastFocused && isYouTubeTab(lastFocused)) return lastFocused;

      // 2. Check current window
      const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (current && isYouTubeTab(current)) return current;

      // 3. Check any active tab
      const activeTabs = await chrome.tabs.query({ active: true });
      const activeYt = activeTabs.find(t => isYouTubeTab(t));
      if (activeYt) return activeYt;

      // 4. Any open YouTube tab
      const allYt = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
      if (allYt && allYt.length > 0) return allYt[0];
    } catch (e) {
      console.warn('[RecallAI] getActiveYouTubeTab notice:', e);
    }
    return null;
  }

  // ── Generate Notes ──────────────────────────────────────────
  genBtn.addEventListener('click', async () => {
    // Check we're on a YouTube tab (using reliable window detection)
    const tab = await getActiveYouTubeTab();
    if (!tab) {
      body.innerHTML = '<div class="sp-empty"><div class="sp-empty-icon">Notice</div><div>Please open a YouTube video or live stream first.</div></div>';
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
        body.innerHTML = '<div class="sp-empty"><div class="sp-empty-icon">Key</div><div>Gemini API key is required. Click Key above to set it.</div></div>';
        return;
      }
    }

    // Query active tab directly for real-time video state & force caption extraction if needed
    let liveState = null;
    try {
      liveState = await new Promise(res => {
        chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_STATE', forceFetchTranscript: true }, r => {
          if (chrome.runtime.lastError || !r) res(null);
          else res(r);
        });
      });
    } catch (e) {}

    // Track videoId and keyframesMap
    const urlVideoId = getVideoIdFromUrl(tab.url);
    curVideoId = liveState?.videoId || urlVideoId || stored.rc_video_id;

    if (liveState?.keyframesMap && Object.keys(liveState.keyframesMap).length > 0) {
      curKeyframesMap = liveState.keyframesMap;
    } else if (curVideoId) {
      const kfRes = await new Promise(r => chrome.storage.local.get([`rc_keyframes_${curVideoId}`], r));
      if (kfRes && kfRes[`rc_keyframes_${curVideoId}`]) {
        curKeyframesMap = kfRes[`rc_keyframes_${curVideoId}`];
      }
    }

    // Build source content - strictly prevent cross-video transcript leakage!
    let validStoredTranscript = [];
    if (stored.rc_video_id === curVideoId && Array.isArray(stored.rc_transcript)) {
      validStoredTranscript = stored.rc_transcript;
    } else if (curVideoId) {
      const vKeyRes = await new Promise(r => chrome.storage.local.get([`rc_transcript_${curVideoId}`], r));
      if (vKeyRes && Array.isArray(vKeyRes[`rc_transcript_${curVideoId}`])) {
        validStoredTranscript = vKeyRes[`rc_transcript_${curVideoId}`];
      }
    }

    let transcript = (liveState?.transcript?.length > 0 ? liveState.transcript : validStoredTranscript) || [];
    const isMatchingStoredVideo = stored.rc_video_id === curVideoId;
    const vTitle = liveState?.title || (isMatchingStoredVideo ? stored.rc_video_title : null) || tab.title?.replace(' - YouTube', '') || 'Lecture Video';
    const vDesc  = liveState?.description || (isMatchingStoredVideo ? stored.rc_video_desc : '') || '';
    const chapters = liveState?.chapters || (isMatchingStoredVideo ? stored.rc_chapters : '') || '';

    // If transcript not yet in memory, extract from YouTube player directly in MAIN world
    if (transcript.length === 0 && curVideoId) {
      body.innerHTML = `
        <div class="sp-empty">
          <div class="sp-spinner" style="width:28px;height:28px;margin:0 auto 10px;"></div>
          <div style="font-weight:600;color:#fff;">Detecting Lecture Captions…</div>
          <div style="font-size:12px;margin-top:6px;color:var(--muted);line-height:1.5;">
            Retrieving subtitles from YouTube for <b>"${vTitle}"</b>…
          </div>
        </div>`;

      // 1. Direct from Tab player
      try {
        const tabTracks = await getCaptionTracksFromTab(tab.id, curVideoId);
        if (tabTracks.length > 0) {
          const parsedLines = await fetchTranscriptFromTracks(tabTracks, curVideoId);
          if (parsedLines.length > 0) {
            transcript = parsedLines;
            chrome.storage.local.set({ [`rc_transcript_${curVideoId}`]: transcript });
          }
        }
      } catch (e) {
        console.warn('[RecallAI] Tab caption extraction notice:', e);
      }

      // 2. Fallback to background service worker
      if (transcript.length === 0) {
        try {
          const bgTransRes = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'GET_VIDEO_TRANSCRIPT', videoId: curVideoId }, resolve);
          });
          if (bgTransRes?.ok && Array.isArray(bgTransRes.transcript) && bgTransRes.transcript.length > 0) {
            transcript = bgTransRes.transcript;
            chrome.storage.local.set({ [`rc_transcript_${curVideoId}`]: transcript });
          }
        } catch (e) {
          console.warn('[RecallAI] Background transcript fetch error:', e);
        }
      }
    }

    // If still no transcript (video has no subtitles/CC on YouTube at all)
    if (transcript.length === 0) {
      body.innerHTML = `
        <div class="sp-empty">
          <div class="sp-empty-icon" style="font-size:26px;">📝</div>
          <div style="font-weight:600;color:var(--yellow);">No Subtitles Found on YouTube</div>
          <div style="font-size:12px;margin-top:6px;color:var(--muted);line-height:1.6;max-width:280px;">
            This video does not have CC / subtitles on YouTube.<br>
            You can still generate full structured lecture notes using the lecture topic, outline, and captured visual frames!
          </div>
          <button id="sp-force-gen-btn" class="sp-btn sp-btn-primary" style="margin-top:14px;width:auto;padding:8px 18px;display:inline-flex;align-items:center;gap:6px;">
            <span>Generate Notes from Topic &amp; Visuals</span>
          </button>
        </div>`;

      document.getElementById('sp-force-gen-btn')?.addEventListener('click', () => {
        dispatchPipeline([], vTitle, chapters, liveState, key);
      });
      return;
    }

    dispatchPipeline(transcript, vTitle, chapters, liveState, key);
  });

  function dispatchPipeline(activeTranscript, vTitle, chapters, liveState, key) {
    // Show pipeline processing state
    body.innerHTML = `
      <div class="sp-empty">
        <div class="sp-empty-icon">Working</div>
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
      rawTranscript: activeTranscript,
      keyframes: liveState?.keyframes || [],
      currentLevel,
      currentLang
    }, response => {
      genBtn.disabled = false;
      if (response?.ok && response.note) {
        if (!cachedNotes[currentLevel]) cachedNotes[currentLevel] = {};
        cachedNotes[currentLevel][currentLang] = response.note;
        if (Array.isArray(response.timeline) && response.timeline.length > 0) {
          curTimeline = response.timeline;
          renderTimelinePanel(curTimeline, curVideoId);
        }
        renderContent(response.note);

        if (curVideoId) {
          chrome.storage.local.set({
            [`rc_cached_notes_${curVideoId}`]: cachedNotes,
            [`rc_timeline_${curVideoId}`]: curTimeline
          });
        }

        const footerInfo = document.getElementById('sp-footer-info');
        if (footerInfo) {
          footerInfo.textContent = `Complete • ${response.cleanSentenceCount || 0} sentences • Synced to RecallAI platform`;
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
  }

  // ── Copy ─────────────────────────────────────────────────────
  copyBtn?.addEventListener('click', () => {
    const text = cachedNotes[currentLevel]?.[currentLang] || body.innerText;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
    });
  });

  // ── Helper: Direct Download without Opening New Tab ─────────
  // Always route through chrome.downloads in the background service worker
  // for the most reliable download behavior in Chrome extensions.
  function triggerDirectDownload(content, filename, mimeType) {
    // Prefer background-worker download (chrome.downloads API — most reliable in MV3)
    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_FILE',
      text: content,
      mimeType: mimeType,
      filename: filename
    }, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        // Fallback: blob URL anchor click
        try {
          const blob = new Blob([content], { type: mimeType });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
        } catch (e) {
          console.error('[RecallAI] All download methods failed:', e);
        }
      }
    });
  }

  // ── Helper: Build Printable / Standalone HTML Document ────────
  function buildStandaloneHtmlDoc(title, renderedHtml) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Kalam:wght@300;400;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$'],['\\\\[','\\\\]']] }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  <style>
    @page { margin: 15mm; size: A4 portrait; }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Kalam', 'Noto Sans Devanagari', cursive, sans-serif;
      font-size: 15px;
      line-height: 1.85;
      color: #0f172a;
      background: #ffffff;
      padding: 24px;
      max-width: 860px;
      margin: 0 auto;
    }
    h1 {
      font-family: 'Inter', sans-serif;
      font-size: 24px;
      font-weight: 800;
      color: #1e3a8a;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 8px;
      margin: 0 0 20px;
    }
    h2 {
      font-family: 'Inter', sans-serif;
      font-size: 18px;
      font-weight: 700;
      color: #1d4ed8;
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
      padding: 8px 14px;
      margin: 24px 0 12px;
      border-radius: 0 6px 6px 0;
      page-break-after: avoid;
    }
    h3 {
      font-family: 'Inter', sans-serif;
      font-size: 16px;
      font-weight: 600;
      color: #334155;
      border-bottom: 1px dashed #cbd5e1;
      padding-bottom: 4px;
      margin: 18px 0 8px;
      page-break-after: avoid;
    }
    p { margin-bottom: 12px; }
    ul, ol { margin: 6px 0 14px 26px; }
    li { margin-bottom: 5px; }

    /* ── Important Timeline Section in PDF / HTML ── */
    .rc-timeline-card {
      margin: 20px 0 26px;
      background: #f8fafc;
      border: 1.5pt solid #3b82f6;
      border-radius: 10px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .rc-timeline-header {
      background: #eff6ff;
      padding: 10px 16px;
      border-bottom: 1.5pt solid #bfdbfe;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .rc-timeline-title {
      font-family: 'Inter', sans-serif;
      font-size: 14.5px;
      font-weight: 700;
      color: #1e3a8a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .rc-timeline-count-badge {
      background: #dbeafe;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 99px;
      border: 1px solid #bfdbfe;
    }
    .rc-timeline-subtitle {
      font-size: 11.5px;
      color: #475569;
      margin: 8px 16px 10px;
      font-style: italic;
    }
    .rc-timeline-table-wrap {
      padding: 0 16px 14px;
      overflow-x: auto;
    }
    .rc-timeline-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
    }
    .rc-timeline-table th {
      background: #f1f5f9;
      padding: 7px 12px;
      border-bottom: 1.5pt solid #cbd5e1;
      font-family: 'Inter', sans-serif;
      font-weight: 700;
      color: #1e293b;
      text-align: left;
    }
    .rc-timeline-table td {
      padding: 8px 12px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .rc-timeline-pill {
      display: inline-flex;
      align-items: center;
      padding: 3px 8px;
      background: #eff6ff;
      color: #2563eb !important;
      border: 1px solid #93c5fd;
      border-radius: 5px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11.5px;
      font-weight: 700;
      text-decoration: none;
    }
    .rc-timeline-topic {
      font-family: 'Inter', sans-serif;
      font-size: 13px;
      color: #0f172a;
      display: block;
    }
    .rc-timeline-desc {
      font-size: 11.5px;
      color: #64748b;
      margin-top: 2px;
      line-height: 1.4;
    }
    .rc-timeline-jump-link {
      display: inline-block;
      font-family: 'Inter', sans-serif;
      font-size: 11.5px;
      font-weight: 600;
      color: #2563eb !important;
      text-decoration: underline;
    }

    /* Timestamps in text: always visible with YouTube link */
    .rc-timestamp {
      display: inline-flex;
      align-items: center;
      padding: 1px 6px;
      background: #eff6ff;
      color: #2563eb !important;
      border: 1px solid #bfdbfe;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      text-decoration: none;
    }

    /* Code & Diagrams */
    .rc-code-container { background: #0f172a; border-radius: 8px; margin: 14px 0; overflow: hidden; border: 1px solid #334155; page-break-inside: avoid; }
    .rc-code-header { background: #1e293b; color: #94a3b8; font-size: 11px; font-weight: 600; padding: 6px 14px; display: flex; justify-content: space-between; border-bottom: 1px solid #334155; font-family: 'Inter', sans-serif; }
    .rc-code-copy-btn { display: none; }
    .rc-code-pre { margin: 0; padding: 12px 14px; color: #f8fafc; font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.55; overflow-x: auto; }
    .rc-inline-code { font-family: 'JetBrains Mono', monospace; font-size: 12px; background: #f1f5f9; color: #0369a1; padding: 2px 6px; border-radius: 4px; }
    .rc-diagram-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; margin: 14px 0; overflow: hidden; page-break-inside: avoid; }
    .rc-diagram-box-header { background: #e2e8f0; color: #334155; font-size: 11px; font-weight: 700; padding: 6px 12px; font-family: 'Inter', sans-serif; }
    .rc-ascii-art { font-family: 'JetBrains Mono', monospace; font-size: 12px; line-height: 1.4; padding: 12px; margin: 0; color: #1e293b; overflow-x: auto; }

    /* Visual Figures */
    .rc-figure-card { margin: 16px 0; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; page-break-inside: avoid; }
    .rc-figure-badge { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 6px 12px; display: flex; align-items: center; gap: 6px; font-family: 'Inter', sans-serif; border-bottom: 1px solid #e2e8f0; }
    .rc-figure-img { width: 100%; max-height: 380px; object-fit: contain; background: #000; display: block; }
    .rc-figure-caption { padding: 8px 14px; font-size: 12px; color: #475569; font-style: italic; border-top: 1px solid #e2e8f0; background: #fff; }

    /* SVG Cards */
    .rc-svg-card { margin: 16px 0; background: #fff; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; page-break-inside: avoid; }
    .rc-svg-header { background: #eff6ff; color: #1e40af; font-size: 11px; font-weight: 700; padding: 6px 12px; font-family: 'Inter', sans-serif; }
    .rc-svg-viewport { padding: 14px; display: flex; justify-content: center; background: #f8fafc; }

    /* Callouts */
    .rc-callout { display: flex; gap: 12px; padding: 12px 16px; margin: 14px 0; border-radius: 8px; page-break-inside: avoid; }
    .rc-callout-intuition { background: #f0fdf4; border-left: 4px solid #22c55e; color: #14532d; }
    .rc-callout-warning { background: #fffbeb; border-left: 4px solid #f59e0b; color: #78350f; }
    .rc-callout-exam { background: #faf5ff; border-left: 4px solid #a855f7; color: #581c87; }
    .rc-callout-default { background: #f8fafc; border-left: 4px solid #64748b; color: #1e293b; }
    .rc-callout-icon { font-size: 18px; flex-shrink: 0; }
    .rc-callout-body { font-size: 13.5px; line-height: 1.6; }

    /* Tables */
    .rc-table-wrapper { margin: 14px 0; overflow-x: auto; }
    .rc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
    .rc-table th { background: #f1f5f9; padding: 8px 12px; border: 1px solid #cbd5e1; font-family: 'Inter', sans-serif; font-weight: 700; color: #1e293b; text-align: left; }
    .rc-table td { padding: 8px 12px; border: 1px solid #cbd5e1; color: #334155; }

    /* Math */
    .rc-math-inline { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #0284c7; background: #f0f9ff; padding: 1px 4px; border-radius: 4px; }
    .rc-math-block { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #0369a1; background: #f0f9ff; border-left: 3px solid #0284c7; padding: 8px 14px; margin: 10px 0; border-radius: 0 6px 6px 0; }

    @media print {
      body { padding: 0; background: transparent; }
    }
  </style>
</head>
<body>
  ${renderedHtml}
</body>
</html>`;
  }

  // ── Download Notes (Direct File Download Modal / Trigger) ─────
  // ── Download Notes (Direct File Download Modal / Trigger) ─────
  function showDownloadMenu() {
    document.getElementById('sp-dl-modal')?.remove();

    const rawNote = cachedNotes[currentLevel]?.[currentLang];
    if (!rawNote) {
      if (dlBtn) {
        dlBtn.textContent = 'Generate notes first';
        setTimeout(() => { dlBtn.textContent = 'Download Notes'; }, 2000);
      }
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'sp-dl-modal';
    modal.style.cssText = `
      position:fixed;inset:0;background:rgba(8,12,20,0.85);backdrop-filter:blur(6px);
      z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;
    `;
    modal.innerHTML = `
      <div style="background:#0f1520;border:1px solid #263550;border-radius:14px;
                  padding:20px;width:100%;max-width:320px;font-family:'Inter',sans-serif;
                  box-shadow:0 20px 60px rgba(0,0,0,0.6);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <div style="font-size:14px;font-weight:700;color:#fff;">Download Lecture Notes</div>
          <button id="sp-dlm-close" style="background:none;border:none;color:#7a8ba8;font-size:18px;cursor:pointer;">✕</button>
        </div>
        <p style="font-size:11.5px;color:#7a8ba8;margin-bottom:14px;line-height:1.5;">
          Directly download notes to your computer with the full <b>Important Timeline</b> and video jump links included.
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button id="sp-dlm-studio" style="background:linear-gradient(135deg,#1e3a8a,#7c3aed);border:1px solid #60a5fa;border-radius:8px;
            color:#fff;padding:10px 12px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
            <span>✏️ Notes Studio & Whiteboard</span>
            <span style="font-size:10px;color:#fff;background:rgba(255,255,255,0.25);padding:2px 6px;border-radius:4px;">Edit & Draw</span>
          </button>
          <button id="sp-dlm-html" style="background:#161e2e;border:1px solid #1e2d45;border-radius:8px;
            color:#fff;padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
            <span>Interactive HTML Notes (.html)</span>
            <span style="font-size:10px;color:#38bdf8;background:rgba(56,189,248,0.15);padding:2px 6px;border-radius:4px;">Recommended</span>
          </button>
          <button id="sp-dlm-md" style="background:#161e2e;border:1px solid #1e2d45;border-radius:8px;
            color:#fff;padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
            <span>Markdown Notes (.md)</span>
            <span style="font-size:10px;color:#34d399;background:rgba(52,211,153,0.15);padding:2px 6px;border-radius:4px;">Markdown</span>
          </button>
          <button id="sp-dlm-pdf" style="background:#2563eb;border:1px solid #3b82f6;border-radius:8px;
            color:#fff;padding:10px 12px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;">
            <span>Print / Save as PDF (.pdf)</span>
            <span style="font-size:10px;color:#fff;background:rgba(255,255,255,0.2);padding:2px 6px;border-radius:4px;">PDF</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    modal.querySelector('#sp-dlm-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    // Notes Studio
    modal.querySelector('#sp-dlm-studio')?.addEventListener('click', () => {
      modal.remove();
      openNotesStudio();
    });

    // HTML Download
    modal.querySelector('#sp-dlm-html').addEventListener('click', () => {
      modal.remove();
      downloadNotesHtml();
    });

    // Markdown Download
    modal.querySelector('#sp-dlm-md').addEventListener('click', () => {
      modal.remove();
      downloadNotesMarkdown();
    });

    // PDF Download
    modal.querySelector('#sp-dlm-pdf').addEventListener('click', () => {
      modal.remove();
      triggerPdfPrint();
    });
  }

  function downloadNotesHtml() {
    const rawNote = cachedNotes[currentLevel]?.[currentLang];
    if (!rawNote) return;

    const title = `RecallAI_${currentLevel.toUpperCase()}_Notes_${currentLang.toUpperCase()}`;
    const renderedHtml = renderMarkdown(rawNote, curVideoId, curKeyframesMap, curTimeline);
    const fullHtml = buildStandaloneHtmlDoc(title, renderedHtml);

    triggerDirectDownload(fullHtml, `${title}.html`, 'text/html;charset=utf-8');
    if (dlBtn) {
      dlBtn.textContent = 'Downloaded HTML!';
      setTimeout(() => { dlBtn.textContent = 'Download Notes'; }, 2000);
    }
  }

  function downloadNotesMarkdown() {
    const rawNote = cachedNotes[currentLevel]?.[currentLang];
    if (!rawNote) return;

    const timelineMd = buildTimelineMarkdown(curTimeline, curVideoId);
    const fullMd = timelineMd + rawNote;
    const filename = `RecallAI_${currentLevel.toUpperCase()}_Notes_${currentLang.toUpperCase()}.md`;

    triggerDirectDownload(fullMd, filename, 'text/markdown;charset=utf-8');
    if (dlBtn) {
      dlBtn.textContent = 'Downloaded .md!';
      setTimeout(() => { dlBtn.textContent = 'Download Notes'; }, 2000);
    }
  }

  if (dlBtn) {
    dlBtn.addEventListener('click', showDownloadMenu);
  }

  const studioFooterBtn = document.getElementById('sp-studio-btn');
  if (studioFooterBtn) {
    studioFooterBtn.addEventListener('click', openNotesStudio);
  }

  function openNotesStudio() {
    const rawNote = cachedNotes[currentLevel]?.[currentLang] || '';
    const vId = curVideoId || '';
    const title = curVideoTitle ? `${curVideoTitle} — RecallAI Notes` : `RecallAI ${currentLevel.toUpperCase()} Lecture Notes`;
    
    chrome.runtime.sendMessage({
      action: 'OPEN_STUDIO_PAGE',
      data: {
        markdown: rawNote,
        title: title,
        videoId: vId,
        level: currentLevel,
        lang: currentLang,
        timeline: curTimeline,
        keyframes: curKeyframesMap
      }
    });
  }

  // ── Download PDF (Clean in-place print without permanent blank tabs) ──
  function triggerPdfPrint() {
    const rawNote = cachedNotes[currentLevel]?.[currentLang];
    if (!rawNote) {
      if (pdfBtn) {
        pdfBtn.textContent = 'Generate notes first';
        setTimeout(() => { pdfBtn.textContent = 'Download PDF'; }, 2000);
      }
      return;
    }

    if (pdfBtn) pdfBtn.textContent = 'Preparing PDF…';

    const title = `RecallAI_${currentLevel.toUpperCase()}_Notes_${currentLang.toUpperCase()}`;
    const renderedHtml = renderMarkdown(rawNote, curVideoId, curKeyframesMap, curTimeline);
    const fullHtml = buildStandaloneHtmlDoc(title, renderedHtml);

    // In-place hidden iframe printing: opens browser print-to-PDF dialog with ZERO permanent tabs!
    let iframe = document.getElementById('rc-sp-print-frame');
    if (iframe) iframe.remove();

    iframe = document.createElement('iframe');
    iframe.id = 'rc-sp-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-99999';
    document.body.appendChild(iframe);

    try {
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(fullHtml);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          if (pdfBtn) pdfBtn.textContent = 'Download PDF';
          setTimeout(() => iframe.remove(), 2500);
        } catch (printErr) {
          // If iframe printing restricted by browser sandbox, open clean self-closing print window
          openSelfClosingPrintWin(fullHtml, title);
        }
      }, 700);
    } catch (e) {
      openSelfClosingPrintWin(fullHtml, title);
    }
  }

  function openSelfClosingPrintWin(fullHtml, title) {
    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert('Please allow popups to save PDF or use "Download Notes" for instant HTML download.');
      if (pdfBtn) pdfBtn.textContent = 'Download PDF';
      return;
    }
    printWin.document.write(fullHtml);
    printWin.document.close();
    printWin.addEventListener('load', () => {
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 600);
    });
    // Auto-close the tab once the user completes or cancels print dialog
    printWin.addEventListener('afterprint', () => {
      try { printWin.close(); } catch (e) {}
    });
    if (pdfBtn) setTimeout(() => { pdfBtn.textContent = 'Download PDF'; }, 1000);
  }

  // The footer PDF button now opens the same download modal (consistent UX)
  // so the user can choose between interactive HTML, Markdown, or Print-to-PDF.
  if (pdfBtn) {
    pdfBtn.addEventListener('click', () => {
      const rawNote = cachedNotes[currentLevel]?.[currentLang];
      if (!rawNote) {
        pdfBtn.textContent = 'Generate notes first';
        setTimeout(() => { pdfBtn.textContent = 'Download PDF'; }, 2000);
        return;
      }
      showDownloadMenu();
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  PRACTICE SESSION MODULE
  // ═══════════════════════════════════════════════════════════

  const practiceOpenBtn = document.getElementById('sp-practice-open-btn');
  const practicePanel   = document.getElementById('sp-practice-panel');
  const prCloseBtn      = document.getElementById('pr-close-btn');

  // ── State ────────────────────────────────────────────────────
  let prState = {
    level: 'overview',
    lang: 'english',
    questions: null,       // { mcq, fill_blanks, long_answer }
    mcqAnswers: [],        // user's selected option index per MCQ question
    mcqCurrentIdx: 0,      // which MCQ question is showing
    fibAnswers: [],        // user's typed fill-in-blank answers (strings)
    longImages: [],        // base64 data URLs, one per long question
    scores: null,          // { mcq, fib, long, total } after grading
    mcqResults: [],        // { correct, selectedIdx, correctIdx } per MCQ
    fibResults: [],        // { correct, userAns, correctAns } per FIB
    longEvals: [],         // { score, feedback, key_points_found } per long
  };

  // ── Step helpers ─────────────────────────────────────────────
  const PR_STEPS = ['config', 'loading', 'mcq', 'fib', 'long', 'evaluating', 'results'];
  const PR_STEP_PROGRESS = { config: '5%', loading: '20%', mcq: '40%', fib: '60%', long: '78%', evaluating: '90%', results: '100%' };
  const PR_STEP_LABELS   = { config: 'Step 1 of 5 — Config', loading: 'Generating…', mcq: 'Step 2 of 5 — MCQ', fib: 'Step 3 of 5 — Fill in the Blanks', long: 'Step 4 of 5 — Long Answer', evaluating: 'Evaluating…', results: 'Step 5 of 5 — Results' };

  function prShowStep(stepName) {
    PR_STEPS.forEach(s => {
      const el = document.getElementById(`pr-step-${s}`);
      if (el) el.classList.toggle('hidden', s !== stepName);
    });
    const stepBar = document.getElementById('pr-step-bar');
    const indicator = document.getElementById('pr-step-indicator');
    const fill = document.getElementById('pr-progress-fill');
    if (indicator) indicator.textContent = PR_STEP_LABELS[stepName] || '';
    if (fill) fill.style.width = PR_STEP_PROGRESS[stepName] || '0%';
    if (stepBar) stepBar.style.display = (stepName === 'loading' || stepName === 'evaluating') ? 'none' : '';
  }

  function prShowMsg(elId, text, type = 'error') {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = text;
    el.className = `pr-msg ${type}`;
    el.classList.remove('hidden');
  }
  function prHideMsg(elId) {
    const el = document.getElementById(elId);
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  }

  // ── Open / Close ─────────────────────────────────────────────
  function openPracticePanel() {
    if (!practicePanel) return;
    // Reset state
    prState = { level: prState.level, lang: prState.lang, questions: null, mcqAnswers: [], mcqCurrentIdx: 0, fibAnswers: [], longImages: [], scores: null, mcqResults: [], fibResults: [], longEvals: [] };
    practicePanel.classList.remove('hidden');
    prShowStep('config');
    prHideMsg('pr-config-msg');
  }

  function closePracticePanel() {
    if (practicePanel) practicePanel.classList.add('hidden');
  }

  if (practiceOpenBtn) {
    practiceOpenBtn.addEventListener('click', () => {
      const hasAnyNotes = Object.values(cachedNotes).some(levelObj =>
        Object.values(levelObj || {}).some(v => v && v.length > 0)
      );
      if (!hasAnyNotes) {
        // Show a brief tooltip feedback
        const orig = practiceOpenBtn.textContent;
        practiceOpenBtn.textContent = '⚠ Generate notes first';
        practiceOpenBtn.style.color = 'var(--yellow)';
        setTimeout(() => { practiceOpenBtn.textContent = orig; practiceOpenBtn.style.color = ''; }, 2200);
        return;
      }
      openPracticePanel();
    });
  }
  if (prCloseBtn) prCloseBtn.addEventListener('click', closePracticePanel);

  // ── Config: Level + Lang selectors ───────────────────────────
  document.getElementById('pr-level-group')?.querySelectorAll('.pr-sel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('pr-level-group').querySelectorAll('.pr-sel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      prState.level = btn.dataset.level;
    });
  });
  document.getElementById('pr-lang-group')?.querySelectorAll('.pr-sel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('pr-lang-group').querySelectorAll('.pr-sel-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      prState.lang = btn.dataset.lang;
    });
  });

  // ── Start Practice ───────────────────────────────────────────
  document.getElementById('pr-start-btn')?.addEventListener('click', async () => {
    const notes = cachedNotes[prState.level]?.[prState.lang];
    if (!notes || notes.trim().length === 0) {
      prShowMsg('pr-config-msg', `No ${prState.level} notes in ${prState.lang}. Please generate them first.`, 'error');
      return;
    }
    prHideMsg('pr-config-msg');
    prShowStep('loading');
    document.getElementById('pr-loading-sub').textContent =
      `Generating 18 questions from your ${prState.level} notes in ${prState.lang}…`;

    chrome.runtime.sendMessage({
      action: 'GENERATE_PRACTICE_QUESTIONS',
      notesMarkdown: notes,
      level: prState.level,
      lang: prState.lang
    }, response => {
      if (chrome.runtime.lastError || !response?.ok) {
        prShowStep('config');
        prShowMsg('pr-config-msg', response?.error || 'Failed to generate questions. Check your API key and try again.', 'error');
        return;
      }
      prState.questions = response.questions;
      prState.mcqAnswers = new Array(prState.questions.mcq.length).fill(-1);
      prState.fibAnswers = new Array(prState.questions.fill_blanks.length).fill('');
      prState.longImages = new Array(prState.questions.long_answer.length).fill(null);
      prShowStep('mcq');
      prRenderMCQ();
    });
  });

  // ── MCQ Step ─────────────────────────────────────────────────
  function prRenderMCQ() {
    const qs = prState.questions?.mcq || [];
    const idx = prState.mcqCurrentIdx;
    const q = qs[idx];
    if (!q) return;

    const counter = document.getElementById('pr-mcq-counter');
    if (counter) counter.textContent = `Question ${idx + 1} of ${qs.length}`;

    const questionEl = document.getElementById('pr-mcq-question');
    if (questionEl) questionEl.textContent = q.q;

    const optionsEl = document.getElementById('pr-mcq-options');
    if (optionsEl) {
      const letters = ['A', 'B', 'C', 'D'];
      optionsEl.innerHTML = q.options.map((opt, oi) => `
        <button class="pr-option-btn${prState.mcqAnswers[idx] === oi ? ' selected' : ''}" data-oi="${oi}">
          <span class="pr-opt-letter">${letters[oi]}</span>
          <span>${opt}</span>
        </button>
      `).join('');

      optionsEl.querySelectorAll('.pr-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const oi = Number(btn.dataset.oi);
          prState.mcqAnswers[idx] = oi;
          optionsEl.querySelectorAll('.pr-option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          prUpdateMCQDots();
          // Auto-advance after short delay
          setTimeout(() => {
            if (idx < qs.length - 1) {
              prState.mcqCurrentIdx++;
              prRenderMCQWithAnim();
            } else {
              document.getElementById('pr-mcq-submit-btn')?.classList.remove('hidden');
              document.getElementById('pr-mcq-next-btn')?.classList.add('hidden');
            }
          }, 350);
        });
      });
    }

    // Update nav buttons
    const prevBtn = document.getElementById('pr-mcq-prev-btn');
    const nextBtn = document.getElementById('pr-mcq-next-btn');
    const submitBtn = document.getElementById('pr-mcq-submit-btn');
    if (prevBtn) prevBtn.disabled = idx === 0;
    if (nextBtn) {
      nextBtn.classList.toggle('hidden', idx === qs.length - 1);
    }
    if (submitBtn) {
      const allAnswered = prState.mcqAnswers.every(a => a !== -1);
      submitBtn.classList.toggle('hidden', !(idx === qs.length - 1 || allAnswered));
    }

    prUpdateMCQDots();
  }

  function prRenderMCQWithAnim() {
    const card = document.getElementById('pr-mcq-card');
    if (card) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(12px)';
      setTimeout(() => {
        card.style.transition = 'opacity 0.2s, transform 0.2s';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
        prRenderMCQ();
      }, 80);
    } else {
      prRenderMCQ();
    }
  }

  function prUpdateMCQDots() {
    const qs = prState.questions?.mcq || [];
    const dotsEl = document.getElementById('pr-mcq-dots');
    if (!dotsEl) return;
    dotsEl.innerHTML = qs.map((_, i) => {
      let cls = 'pr-dot';
      if (i === prState.mcqCurrentIdx) cls += ' active';
      else if (prState.mcqAnswers[i] !== -1) cls += ' answered';
      return `<span class="${cls}"></span>`;
    }).join('');
  }

  document.getElementById('pr-mcq-prev-btn')?.addEventListener('click', () => {
    if (prState.mcqCurrentIdx > 0) { prState.mcqCurrentIdx--; prRenderMCQWithAnim(); }
  });
  document.getElementById('pr-mcq-next-btn')?.addEventListener('click', () => {
    const qs = prState.questions?.mcq || [];
    if (prState.mcqCurrentIdx < qs.length - 1) { prState.mcqCurrentIdx++; prRenderMCQWithAnim(); }
  });

  document.getElementById('pr-mcq-submit-btn')?.addEventListener('click', () => {
    // Score MCQ locally — answers come from session storage in background
    // For now, transition to FIB and score after FIB submission
    prShowStep('fib');
    prRenderFIB();
  });

  // ── Fill-in-Blank Step ───────────────────────────────────────
  function prRenderFIB() {
    const qs = prState.questions?.fill_blanks || [];
    const listEl = document.getElementById('pr-fib-list');
    if (!listEl) return;

    listEl.innerHTML = qs.map((q, i) => `
      <div class="pr-fib-item" data-qi="${i}">
        <div class="pr-fib-num">Sentence ${i + 1}</div>
        <div class="pr-fib-sentence">
          <span>${q.before || ''}</span>
          <input type="text" class="pr-fib-input" id="pr-fib-in-${i}" placeholder="type answer…" autocomplete="off" spellcheck="false"/>
          <span>${q.after || ''}</span>
        </div>
      </div>
    `).join('');

    // Sync answer state to inputs
    qs.forEach((_, i) => {
      const inp = document.getElementById(`pr-fib-in-${i}`);
      if (inp) {
        inp.value = prState.fibAnswers[i] || '';
        inp.addEventListener('input', () => { prState.fibAnswers[i] = inp.value.trim(); });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            const next = document.getElementById(`pr-fib-in-${i + 1}`);
            if (next) next.focus(); else document.getElementById('pr-fib-submit-btn')?.focus();
          }
        });
      }
    });
  }

  document.getElementById('pr-fib-submit-btn')?.addEventListener('click', () => {
    const qs = prState.questions?.fill_blanks || [];
    const unanswered = qs.filter((_, i) => !prState.fibAnswers[i]?.trim());
    if (unanswered.length > 0) {
      prShowMsg('pr-fib-msg', `Please fill in all ${unanswered.length} blank(s) before submitting.`, 'error');
      return;
    }
    prHideMsg('pr-fib-msg');
    prShowStep('long');
    prRenderLong();
  });

  // ── Long Answer Step ─────────────────────────────────────────
  function prRenderLong() {
    const qs = prState.questions?.long_answer || [];
    const listEl = document.getElementById('pr-long-list');
    if (!listEl) return;

    listEl.innerHTML = qs.map((q, i) => `
      <div class="pr-long-item" data-qi="${i}">
        <div class="pr-long-qnum">Long Answer ${i + 1}</div>
        <div class="pr-long-q">${q.q}</div>
        ${q.hint ? `<div class="pr-long-hint">💡 Hint: ${q.hint}</div>` : ''}
        ${q.model_answer ? `
          <details class="pr-long-model-details" style="margin:6px 0;cursor:pointer;">
            <summary style="font-size:11px;color:var(--muted);user-select:none;display:inline-flex;align-items:center;gap:4px;">
              <span>👁️</span> <span>Peek Model Solution</span>
            </summary>
            <div style="margin-top:6px;padding:8px 10px;background:rgba(0,0,0,0.25);border-left:2px solid var(--green);border-radius:4px;font-size:11.5px;line-height:1.6;color:var(--text);white-space:pre-wrap;">${q.model_answer}</div>
          </details>
        ` : ''}
        <div class="pr-upload-zone" id="pr-upload-zone-${i}">
          <div class="pr-upload-icon">📷</div>
          <div class="pr-upload-text">
            <strong>Click to upload</strong> or drag &amp; drop<br>
            Photo of your handwritten answer
          </div>
          <input type="file" class="pr-upload-file-input" id="pr-upload-input-${i}" accept="image/*">
        </div>
      </div>
    `).join('');

    qs.forEach((_, i) => {
      const zone = document.getElementById(`pr-upload-zone-${i}`);
      const input = document.getElementById(`pr-upload-input-${i}`);
      if (!zone || !input) return;

      zone.addEventListener('click', () => input.click());

      zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) prHandleUpload(i, file, zone);
      });

      input.addEventListener('change', () => {
        const file = input.files[0];
        if (file) prHandleUpload(i, file, zone);
      });

      // Restore existing image if any
      if (prState.longImages[i]) prRenderUploadPreview(i, prState.longImages[i], zone);
    });
  }

  function prHandleUpload(qi, file, zone) {
    const reader = new FileReader();
    reader.onload = e => {
      prState.longImages[qi] = e.target.result;
      prRenderUploadPreview(qi, e.target.result, zone);
    };
    reader.readAsDataURL(file);
  }

  function prRenderUploadPreview(qi, dataUrl, zone) {
    zone.classList.add('has-file');
    zone.innerHTML = `
      <img src="${dataUrl}" class="pr-upload-preview" alt="Your answer ${qi + 1}"/>
      <span class="pr-upload-clear" id="pr-clear-${qi}">✕ Remove image</span>
    `;
    // Re-attach click to re-open file picker if user wants to change
    zone.addEventListener('click', e => {
      if (e.target.id === `pr-clear-${qi}`) {
        e.stopPropagation();
        prState.longImages[qi] = null;
        prRenderLong();
        return;
      }
      const inp = document.getElementById(`pr-upload-input-${qi}`);
      if (inp) inp.click();
    });
  }

  document.getElementById('pr-long-submit-btn')?.addEventListener('click', async () => {
    const qs = prState.questions?.long_answer || [];
    const missingCount = prState.longImages.filter(img => !img).length;
    if (missingCount === qs.length) {
      prShowMsg('pr-long-msg', 'No photos uploaded. Submitting will score 0/10 and reveal all correct model answers.', 'info');
      await new Promise(r => setTimeout(r, 1200));
    } else if (missingCount > 0) {
      prShowMsg('pr-long-msg', `${missingCount} answer image(s) missing — missing questions will score 0/10 and reveal model answers.`, 'info');
      await new Promise(r => setTimeout(r, 1200));
    }
    prHideMsg('pr-long-msg');
    prShowStep('evaluating');
    prEvaluateAndScore();
  });

  // ── Evaluate + Score ─────────────────────────────────────────
  async function prEvaluateAndScore() {
    const qs = prState.questions;

    // Send long answers to background for Gemini Vision evaluation
    await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'EVALUATE_LONG_ANSWERS',
        questions: qs.long_answer,
        images: prState.longImages
      }, response => {
        if (response?.ok && response.evaluations) {
          prState.longEvals = response.evaluations;
        } else {
          // Fallback: score 0 for all
          prState.longEvals = qs.long_answer.map(() => ({
            score: 0, feedback: 'Could not evaluate — ' + (response?.error || 'unknown error'), key_points_found: []
          }));
        }
        resolve();
      });
    });

    // MCQ & FIB scoring happens via background (session storage holds answers)
    // We request scoring from background using stored answers
    await new Promise(resolve => {
      chrome.runtime.sendMessage({
        action: 'SCORE_MCQ_FIB',
        mcqAnswers: prState.mcqAnswers,
        fibAnswers: prState.fibAnswers
      }, response => {
        if (response?.ok) {
          prState.mcqResults = response.mcqResults || [];
          prState.fibResults = response.fibResults || [];
        } else {
          // Graceful fallback: compare locally (less secure but functional)
          prState.mcqResults = prState.mcqAnswers.map((ans, i) => ({
            correct: ans === (qs.mcq[i]?._answerHint ?? -99),
            selectedIdx: ans,
            correctIdx: -1
          }));
          prState.fibResults = prState.fibAnswers.map((ans, i) => ({
            correct: false, userAns: ans, correctAns: '(see notes)'
          }));
        }
        resolve();
      });
    });

    prComputeScores();
    prShowStep('results');
    prRenderResults();
  }

  function prComputeScores() {
    const mcqTotal = prState.questions.mcq.length;
    const fibTotal = prState.questions.fill_blanks.length;
    const longTotal = prState.questions.long_answer.length;

    const mcqCorrect = prState.mcqResults.filter(r => r.correct).length;
    const fibCorrect = prState.fibResults.filter(r => r.correct).length;
    const longRaw    = prState.longEvals.reduce((sum, e) => sum + (e.score || 0), 0);
    const longMax    = longTotal * 10;

    const mcqPct  = mcqTotal  > 0 ? Math.round(mcqCorrect / mcqTotal * 100) : 0;
    const fibPct  = fibTotal  > 0 ? Math.round(fibCorrect / fibTotal * 100) : 0;
    const longPct = longMax   > 0 ? Math.round(longRaw / longMax * 100) : 0;

    // Weighted: MCQ 40%, FIB 20%, Long 40%
    const total = Math.round(mcqPct * 0.4 + fibPct * 0.2 + longPct * 0.4);

    prState.scores = { mcqCorrect, mcqTotal, fibCorrect, fibTotal, longRaw, longMax, mcqPct, fibPct, longPct, total };
  }

  // ── Results ──────────────────────────────────────────────────
  function prRenderResults() {
    const s = prState.scores;
    if (!s) return;

    // Animated score ring
    const ringFill = document.getElementById('pr-ring-fill');
    const scoreNum = document.getElementById('pr-score-num');
    const circumference = 314;

    // Add SVG gradient definition inline
    const svgEl = ringFill?.closest('svg');
    if (svgEl && !svgEl.querySelector('#pr-ring-gradient')) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = `<linearGradient id="pr-ring-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" style="stop-color:#4a90d9"/>
        <stop offset="100%" style="stop-color:#8b7bbf"/>
      </linearGradient>`;
      svgEl.prepend(defs);
    }

    setTimeout(() => {
      if (ringFill) {
        const offset = circumference - (s.total / 100) * circumference;
        ringFill.style.strokeDashoffset = offset;
      }
    }, 100);

    // Animate score number count-up
    if (scoreNum) {
      let count = 0;
      const target = s.total;
      const step = Math.max(1, Math.floor(target / 30));
      const timer = setInterval(() => {
        count = Math.min(count + step, target);
        scoreNum.textContent = count + '%';
        if (count >= target) clearInterval(timer);
      }, 40);
    }

    // Score colour
    const colour = s.total >= 70 ? 'var(--green)' : s.total >= 40 ? 'var(--yellow)' : 'var(--red)';
    if (ringFill) ringFill.style.stroke = colour;
    if (scoreNum) setTimeout(() => { scoreNum.style.color = colour; }, 500);

    // Breakdown bars
    const breakdownEl = document.getElementById('pr-score-breakdown');
    if (breakdownEl) {
      const rows = [
        { label: '🔵 MCQ',          pct: s.mcqPct,  detail: `${s.mcqCorrect}/${s.mcqTotal}`,  color: 'var(--primary)' },
        { label: '🟢 Fill-Blanks',  pct: s.fibPct,  detail: `${s.fibCorrect}/${s.fibTotal}`,  color: 'var(--green)'   },
        { label: '🟣 Long Answer',  pct: s.longPct, detail: `${s.longRaw}/${s.longMax} pts`,  color: 'var(--purple)'  },
      ];
      breakdownEl.innerHTML = rows.map(r => `
        <div class="pr-breakdown-row">
          <span class="pr-breakdown-label">${r.label}</span>
          <div class="pr-breakdown-bar-track">
            <div class="pr-breakdown-bar-fill" style="width:0%;background:${r.color}" data-pct="${r.pct}"></div>
          </div>
          <span class="pr-breakdown-val">${r.pct}%</span>
        </div>
      `).join('');
      // Animate bars after paint
      setTimeout(() => {
        breakdownEl.querySelectorAll('.pr-breakdown-bar-fill').forEach(bar => {
          bar.style.transition = 'width 0.8s ease';
          bar.style.width = bar.dataset.pct + '%';
        });
      }, 150);
    }

    // Results tabs — render all three sections
    prRenderMCQResults();
    prRenderFIBResults();
    prRenderLongResults();

    // Tab switching
    document.querySelectorAll('.pr-rtab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.pr-rtab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const which = tab.dataset.rtab;
        ['mcq', 'fib', 'long'].forEach(sec => {
          const el = document.getElementById(`pr-results-${sec}`);
          if (el) el.classList.toggle('hidden', sec !== which);
        });
      });
    });

    // Retry / Done
    document.getElementById('pr-retry-btn')?.addEventListener('click', openPracticePanel);
    document.getElementById('pr-done-btn')?.addEventListener('click', closePracticePanel);
  }

  function prRenderMCQResults() {
    const qs = prState.questions.mcq;
    const container = document.getElementById('pr-results-mcq');
    if (!container) return;
    const letters = ['A', 'B', 'C', 'D'];
    container.innerHTML = qs.map((q, i) => {
      const r = prState.mcqResults[i] || {};
      const icon = r.correct ? '✅' : '❌';
      const badgeCls = r.correct ? 'correct-badge' : 'wrong-badge';
      const badgeText = r.correct ? 'Correct' : 'Wrong';
      const selLetter = r.selectedIdx >= 0 ? letters[r.selectedIdx] : '—';
      const corLetter = r.correctIdx >= 0 ? letters[r.correctIdx] : '?';
      return `
        <div class="pr-result-item" data-ri="${i}">
          <div class="pr-result-summary">
            <span class="pr-result-icon">${icon}</span>
            <span class="pr-result-q">Q${i+1}: ${q.q}</span>
            <span class="pr-result-score-badge ${badgeCls}">${badgeText}</span>
            <span class="pr-result-chevron">›</span>
          </div>
          <div class="pr-result-body">
            <div class="pr-result-detail">Your answer: <strong>${selLetter !== '—' ? selLetter + ' — ' + (q.options[r.selectedIdx] || '—') : 'Not answered'}</strong></div>
            ${!r.correct ? `<div class="pr-result-correct-ans">✓ Correct: ${corLetter !== '?' ? corLetter + ' — ' + (q.options[r.correctIdx] || '') : 'See your notes'}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    prBindAccordion(container);
  }

  function prRenderFIBResults() {
    const qs = prState.questions.fill_blanks;
    const container = document.getElementById('pr-results-fib');
    if (!container) return;
    container.innerHTML = qs.map((q, i) => {
      const r = prState.fibResults[i] || {};
      const icon = r.correct ? '✅' : '❌';
      const badgeCls = r.correct ? 'correct-badge' : 'wrong-badge';
      return `
        <div class="pr-result-item" data-ri="${i}">
          <div class="pr-result-summary">
            <span class="pr-result-icon">${icon}</span>
            <span class="pr-result-q">Blank ${i+1}: ${(q.before || '') + '___' + (q.after || '')}</span>
            <span class="pr-result-score-badge ${badgeCls}">${r.correct ? 'Correct' : 'Wrong'}</span>
            <span class="pr-result-chevron">›</span>
          </div>
          <div class="pr-result-body">
            <div class="pr-result-detail">Your answer: <strong>${r.userAns || '(empty)'}</strong></div>
            ${!r.correct ? `<div class="pr-result-correct-ans">✓ Correct answer: ${r.correctAns || 'See your notes'}</div>` : ''}
          </div>
        </div>`;
    }).join('');
    prBindAccordion(container);
  }

  function prRenderLongResults() {
    const qs = prState.questions.long_answer;
    const container = document.getElementById('pr-results-long');
    if (!container) return;
    container.innerHTML = qs.map((q, i) => {
      const e = prState.longEvals[i] || { score: 0, feedback: 'Not evaluated.', key_points_found: [] };
      const pct = Math.round(e.score / 10 * 100);
      const badgeCls = pct >= 70 ? 'correct-badge' : pct >= 40 ? 'partial-badge' : 'wrong-badge';
      const keyTags = (e.key_points_found || []).map(pt => `<span class="pr-key-point-tag">${pt}</span>`).join('');
      const modelAns = e.model_answer || q.model_answer || q.rubric || null;

      return `
        <div class="pr-result-item" data-ri="${i}">
          <div class="pr-result-summary">
            <span class="pr-result-icon">${pct >= 70 ? '✅' : pct >= 40 ? '🟡' : '❌'}</span>
            <span class="pr-result-q">Q${i+1}: ${q.q}</span>
            <span class="pr-result-score-badge ${badgeCls}">${e.score}/10</span>
            <span class="pr-result-chevron">›</span>
          </div>
          <div class="pr-result-body">
            <div class="pr-result-feedback">📝 <strong>Feedback:</strong> ${e.feedback}</div>
            ${keyTags ? `<div class="pr-key-points" style="margin-top:8px;">${keyTags}</div>` : ''}
            ${modelAns ? `
              <div class="pr-result-correct-ans" style="margin-top:10px;">
                <div style="font-size:11.5px;font-weight:700;color:var(--green);display:flex;align-items:center;gap:5px;margin-bottom:5px;">
                  <span>✓</span> <span>Correct / Model Answer:</span>
                </div>
                <div style="font-size:11.5px;font-weight:400;color:var(--text);background:rgba(0,0,0,0.25);border:1px solid rgba(90,158,111,0.25);border-left:3px solid var(--green);border-radius:6px;padding:9px 12px;line-height:1.6;white-space:pre-wrap;">${modelAns}</div>
              </div>
            ` : ''}
          </div>
        </div>`;
    }).join('');
    prBindAccordion(container);
  }

  function prBindAccordion(container) {
    container.querySelectorAll('.pr-result-summary').forEach(summary => {
      summary.addEventListener('click', () => {
        const item = summary.closest('.pr-result-item');
        item.classList.toggle('expanded');
      });
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // CLOUD SAVE (AWS DYNAMODB) & GROUNDED TOPIC SEARCH ENGINE
  // ══════════════════════════════════════════════════════════════════

  function showToast(msg, icon = '☁️') {
    const existing = document.querySelector('.sp-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'sp-toast';
    toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3400);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function highlightTerms(htmlStr, query) {
    if (!query || !htmlStr) return htmlStr;
    const words = query.trim().split(/\s+/).filter(w => w.length > 2);
    if (!words.length) return htmlStr;
    const regex = new RegExp(`(${words.map(w => escapeRegex(w)).join('|')})`, 'gi');
    return htmlStr.replace(regex, '<mark>$1</mark>');
  }

  // ── Save active note to AWS DynamoDB ─────────────────────────────
  async function saveActiveNoteToAws() {
    const rawNote = cachedNotes[currentLevel]?.[currentLang];
    if (!rawNote || !rawNote.trim()) {
      showToast('Please generate notes for this lecture before saving to AWS.', '⚠️');
      return;
    }

    const btns = [cloudSaveBtn, cloudSaveFooterBtn].filter(Boolean);
    btns.forEach(b => {
      b.disabled = true;
      b.dataset.origText = b.innerHTML;
      b.innerHTML = '<span>☁️ Saving...</span>';
    });

    const activeTitle = curVideoTitle || document.getElementById('sp-video-title')?.textContent || 'Lecture Video';
    const activeChannel = document.getElementById('sp-channel-text')?.textContent || '';

    chrome.runtime.sendMessage({
      action: 'SAVE_NOTE_TO_AWS',
      payload: {
        videoId: curVideoId,
        title: activeTitle,
        channel: activeChannel,
        level: currentLevel,
        lang: currentLang,
        note: rawNote,
        timeline: curTimeline
      }
    }, response => {
      btns.forEach(b => {
        b.disabled = false;
        b.innerHTML = b.dataset.origText || '☁️ Save';
      });

      if (response && response.ok) {
        showToast(`Saved to ${response.storage || 'AWS DynamoDB'} (${response.chunks_saved || 0} topic sections)`, '✓');
        btns.forEach(b => {
          b.innerHTML = '<span>✓ Saved</span>';
          setTimeout(() => { b.innerHTML = b.dataset.origText || '☁️ Save'; }, 3000);
        });
      } else {
        const err = response?.error || 'Failed to save to AWS';
        showToast(err, '✕');
      }
    });
  }

  if (cloudSaveBtn) cloudSaveBtn.addEventListener('click', saveActiveNoteToAws);
  if (cloudSaveFooterBtn) cloudSaveFooterBtn.addEventListener('click', saveActiveNoteToAws);

  // ── Topic Search Panel Wiring ────────────────────────────────────
  if (searchToggleBtn && searchPanel) {
    searchToggleBtn.addEventListener('click', () => {
      searchPanel.classList.toggle('hidden');
      if (!searchPanel.classList.contains('hidden')) {
        searchInput?.focus();
      }
    });
  }

  if (searchCloseBtn && searchPanel) {
    searchCloseBtn.addEventListener('click', () => {
      searchPanel.classList.add('hidden');
    });
  }

  if (searchInput && searchClearBtn) {
    searchInput.addEventListener('input', () => {
      searchClearBtn.classList.toggle('hidden', !searchInput.value.trim());
    });
    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchClearBtn.classList.add('hidden');
      searchInput.focus();
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') executeTopicSearch();
    });
  }

  if (searchExecBtn) {
    searchExecBtn.addEventListener('click', executeTopicSearch);
  }

  // ── Execute Strict Grounded Search ───────────────────────────────
  // ── Open Note Section Directly in Main Viewer ─────────────────────
  function openNoteSection(level, lang, heading) {
    if (level && level !== currentLevel) {
      const lvlBtn = (level === 'overview') ? l1Btn : ((level === 'summary') ? l2Btn : l3Btn);
      if (lvlBtn) setLevel(level, lvlBtn);
    }
    if (lang && lang !== currentLang) {
      const lngBtn = (lang === 'hindi') ? hiBtn : ((lang === 'hinglish') ? hingBtn : enBtn);
      if (lngBtn) setLang(lang, lngBtn);
    }

    if (searchPanel) searchPanel.classList.add('hidden');

    setTimeout(() => {
      const cleanHeading = (heading || '')
        .replace(/^#{1,4}\s+/, '')
        .replace(/\[\d{1,2}:\d{2}(?::\d{2})?\]/, '')
        .trim()
        .toLowerCase();

      const headings = body.querySelectorAll('h1, h2, h3, h4, .rc-topic-title');
      let target = null;
      for (const h of headings) {
        const text = h.textContent.toLowerCase().trim();
        if (text && (text.includes(cleanHeading) || cleanHeading.includes(text))) {
          target = h;
          break;
        }
      }
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.transition = 'background 0.3s, padding 0.3s';
        target.style.background = 'rgba(56, 189, 248, 0.3)';
        target.style.borderRadius = '4px';
        setTimeout(() => { target.style.background = 'transparent'; }, 2200);
      }
      showToast(`Jumped to note section: ${heading.slice(0, 30)}`, '📖');
    }, 150);
  }

  // ── Local Fallback Notes Search Engine ───────────────────────────
  function searchLocalNotes(query, filterVideoId) {
    const qLower = query.toLowerCase().trim();
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'what', 'how']);
    const terms = (qLower.match(/\w+/g) || []).filter(w => !stopWords.has(w) && w.length > 2);
    if (terms.length === 0) terms.push(qLower);

    const matches = [];
    const videoTitle = curVideoTitle || 'Current Lecture';

    for (const lvl of ['detailed', 'summary', 'overview']) {
      const langs = cachedNotes[lvl] || {};
      for (const [lng, md] of Object.entries(langs)) {
        if (!md || typeof md !== 'string') continue;

        const sections = md.split(/\n(?=#{1,3}\s+)/);
        for (const sec of sections) {
          const lines = sec.trim().split('\n');
          if (lines.length === 0) continue;
          const heading = lines[0].replace(/^#{1,3}\s+/, '').trim();
          const bodyText = lines.slice(1).join('\n').trim();
          if (!bodyText && !heading) continue;

          const hLower = heading.toLowerCase();
          const bLower = bodyText.toLowerCase();

          let score = 0;
          if (hLower.includes(qLower)) score += 12;
          if (bLower.includes(qLower)) score += 7;

          for (const t of terms) {
            if (hLower.includes(t)) score += 3;
            const cnt = (bLower.match(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')) || []).length;
            if (cnt > 0) score += Math.min(cnt * 1.5, 6);
          }

          if (score >= 1.0) {
            const tsMatch = heading.match(/\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?/);
            let secNum = 0;
            let tsStr = '00:00';
            if (tsMatch) {
              tsStr = tsMatch[1];
              const parts = tsStr.split(':').map(Number);
              if (parts.length === 2) secNum = parts[0] * 60 + parts[1];
              else if (parts.length === 3) secNum = parts[0] * 3600 + parts[1] * 60 + parts[2];
            }

            let snip = bodyText.slice(0, 240).replace(/\n+/g, ' ');
            for (const t of terms) {
              const idx = bLower.indexOf(t);
              if (idx !== -1) {
                const start = Math.max(0, idx - 40);
                const end = Math.min(bodyText.length, idx + 180);
                snip = (start > 0 ? '...' : '') + bodyText.slice(start, end).replace(/\n+/g, ' ') + (end < bodyText.length ? '...' : '');
                break;
              }
            }

            matches.push({
              video_id: curVideoId || '',
              video_title: videoTitle,
              topic_heading: heading,
              timestamp_sec: secNum,
              timestamp_str: tsStr,
              snippet: snip,
              full_content: bodyText,
              level: lvl,
              lang: lng,
              score
            });
          }
        }
      }
    }

    matches.sort((a, b) => b.score - a.score);
    const seen = new Set();
    const unique = [];
    for (const m of matches) {
      if (!seen.has(m.topic_heading)) {
        seen.add(m.topic_heading);
        unique.push(m);
      }
    }
    return unique.slice(0, 8);
  }

  // ── Render Search Results UI Helper ───────────────────────────────
  function renderSearchResultsCards(results, groundedAnswer, citations, query, isLocal = false) {
    if (!searchBody) return;
    if (searchStats) searchStats.textContent = `${results.length} matched sections${isLocal ? ' (Local Cache)' : ''}`;

    let html = '';

    if (isLocal) {
      html += `
        <div style="margin-bottom:8px;padding:6px 10px;border-radius:6px;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.25);font-size:11px;color:var(--cyan);display:flex;align-items:center;gap:6px;">
          <span>⚡</span> <span>Notes found in your active lecture notes cache</span>
        </div>
      `;
    }

    if (groundedAnswer) {
      const citationsHtml = (citations || []).map(c => `
        <button class="sp-citation-pill" data-sec="${c.timestamp_sec}" data-vid="${c.video_id || ''}" title="Jump to ${c.timestamp_str} in video">
          <span>▶</span> <span>${escapeHtml(c.heading)} [${c.timestamp_str}]</span>
        </button>
      `).join('');

      html += `
        <div class="sp-grounded-qa-card">
          <div class="sp-grounded-qa-header">
            <div class="sp-grounded-qa-title">
              <span>🧠</span> <span>In-Context Answer</span>
            </div>
            <span class="sp-grounded-badge">Verified Excerpt</span>
          </div>
          <div class="sp-grounded-qa-text">${escapeHtml(groundedAnswer)}</div>
          ${citationsHtml ? `<div class="sp-grounded-citations">${citationsHtml}</div>` : ''}
        </div>
      `;
    }

    results.forEach((chunk, idx) => {
      const fullNote = chunk.full_content || '';
      const hasFullNote = fullNote && fullNote.length > (chunk.snippet?.length || 0) + 30;

      html += `
        <div class="sp-topic-card" data-idx="${idx}">
          <div class="sp-topic-card-top">
            <div style="overflow:hidden;flex:1;">
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;flex-wrap:wrap;">
                <span class="sp-note-level-badge">${escapeHtml((chunk.level || 'detailed').toUpperCase())}</span>
                <span class="sp-note-lang-badge">${escapeHtml((chunk.lang || 'english').toUpperCase())}</span>
                <span class="sp-topic-lecture-title" title="${escapeHtml(chunk.video_title)}">📖 ${escapeHtml(chunk.video_title)}</span>
              </div>
              <div class="sp-topic-heading">${escapeHtml(chunk.topic_heading)}</div>
            </div>
            <button class="sp-topic-seek-btn" data-sec="${chunk.timestamp_sec}" data-vid="${chunk.video_id || ''}" title="Open YouTube at ${chunk.timestamp_str}">
              <span>▶</span> <span>${chunk.timestamp_str}</span>
            </button>
          </div>

          <!-- Note Content Containing Search Input -->
          <div class="sp-topic-notes-container">
            <div class="sp-topic-notes-label">📝 Notes Content (Matched "${escapeHtml(query)}"):</div>
            <div class="sp-topic-snippet">${highlightTerms(escapeHtml(chunk.snippet || fullNote.slice(0, 240) || ''), query)}</div>

            ${hasFullNote ? `
              <div class="sp-topic-full-note hidden" id="sp-full-note-${idx}">
                <div class="sp-topic-full-note-content">${highlightTerms(escapeHtml(fullNote), query)}</div>
              </div>
              <button class="sp-topic-toggle-full-btn" data-target="sp-full-note-${idx}">
                <span>👁️ Show Full Note Section</span>
              </button>
            ` : ''}
          </div>

          <!-- Action Bar: Jump to video, Open in main reader, Copy -->
          <div class="sp-topic-actions">
            <button class="sp-topic-open-notes-btn" data-lvl="${chunk.level || currentLevel}" data-lang="${chunk.lang || currentLang}" data-heading="${escapeHtml(chunk.topic_heading)}" data-vid="${chunk.video_id || ''}" data-content="${escapeHtml(chunk.full_content || chunk.snippet || '')}" data-title="${escapeHtml(chunk.video_title || '')}" title="Open this note section in a new tab">
              <span>📖 Open in Notes</span>
            </button>
            <button class="sp-topic-copy-btn" data-text="${escapeHtml(fullNote || chunk.snippet || '')}" title="Copy note text to clipboard">
              <span>📋 Copy</span>
            </button>
          </div>
        </div>
      `;
    });

    searchBody.innerHTML = html;

    // 1. Bind Seek buttons and citation pills — always open YouTube tab from search results
    searchBody.querySelectorAll('[data-sec]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sec      = Number(btn.getAttribute('data-sec')) || 0;
        const targetVid = btn.getAttribute('data-vid') || curVideoId;
        if (targetVid) {
          // Always open YouTube so user is reliably redirected to the right moment
          chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${targetVid}&t=${sec}s` });
        } else {
          seekVideo(sec);
          showToast(`Jumped to ${formatTime(sec)} in lecture`, '▶');
        }
      });
    });

    // 2. Bind Toggle Full Note Section
    searchBody.querySelectorAll('.sp-topic-toggle-full-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = btn.getAttribute('data-target');
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          const isHidden = targetEl.classList.toggle('hidden');
          btn.innerHTML = isHidden ? '<span>👁️ Show Full Note Section</span>' : '<span>▲ Hide Full Note Section</span>';
        }
      });
    });

    // 3. Bind Open in Notes Viewer — opens in a new Chrome tab via print.html
    searchBody.querySelectorAll('.sp-topic-open-notes-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lvl      = btn.getAttribute('data-lvl')     || currentLevel;
        const lng      = btn.getAttribute('data-lang')    || currentLang;
        const heading  = btn.getAttribute('data-heading') || '';
        const noteVid  = btn.getAttribute('data-vid')     || '';
        const content  = btn.getAttribute('data-content') || '';
        const vidTitle = btn.getAttribute('data-title')   || heading;

        // If same video and note is loaded, also scroll to section in sidepanel
        if (!noteVid || noteVid === curVideoId) {
          openNoteSection(lvl, lng, heading);
        }

        // Always open a full readable tab with the note content
        const noteHtml = `
          <style>
            body{font-family:'Segoe UI',sans-serif;max-width:860px;margin:40px auto;padding:0 24px 60px;background:#0f172a;color:#e2e8f0;line-height:1.8;}
            .banner{background:linear-gradient(135deg,#1e3a8a,#7c3aed);padding:28px 32px;border-radius:14px;margin-bottom:32px;}
            .banner h1{color:#fff;font-size:1.4rem;margin:0 0 8px;}
            .meta{font-size:.8rem;color:#bfdbfe;display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;}
            .badge{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:20px;padding:3px 12px;}
            pre,code{background:#1e293b;border-radius:6px;padding:2px 7px;font-family:'JetBrains Mono',monospace;font-size:.85em;color:#7dd3fc;}
            pre{display:block;padding:14px 18px;overflow-x:auto;margin:12px 0;}
            h2{color:#7dd3fc;border-bottom:1px solid #334155;padding-bottom:6px;margin-top:28px;}
            h3{color:#a78bfa;margin-top:20px;}
            strong{color:#fbbf24;}
            mark{background:#fbbf2444;color:#fbbf24;border-radius:3px;padding:0 3px;}
            li{margin-bottom:5px;}
            a{color:#60a5fa;}
          </style>
          <div class='banner'>
            <h1>${vidTitle}</h1>
            <div class='meta'>
              <span class='badge'>${lvl.toUpperCase()}</span>
              <span class='badge'>${lng.toUpperCase()}</span>
              ${noteVid ? `<span class='badge'>Video: ${noteVid}</span>` : ''}
            </div>
          </div>
          <div id='note-content'>${content.replace(/\n/g,'<br>')}</div>
        `;

        chrome.runtime.sendMessage({
          action: 'OPEN_PRINT_PAGE',
          data: { html: noteHtml, title: `${heading} — RecallAI Notes` }
        });
      });
    });

    // 4. Bind Copy button
    searchBody.querySelectorAll('.sp-topic-copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const text = btn.getAttribute('data-text') || '';
        if (text) {
          navigator.clipboard.writeText(text).then(() => {
            showToast('Note section copied!', '📋');
          });
        }
      });
    });
  }

  // ── Execute Strict Grounded Search ───────────────────────────────
  async function executeTopicSearch() {
    const query = searchInput?.value?.trim();
    if (!query) return;

    if (!searchBody) return;
    searchBody.innerHTML = `
      <div class="sp-search-empty">
        <div style="font-size:24px;margin-bottom:8px;animation:pulse 1s infinite;">🔍</div>
        <div style="font-weight:600;color:#fff;">Searching Saved Knowledge...</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px;">Strictly querying your saved notes on AWS Cloud &amp; Cache</div>
      </div>
    `;

    const scope = searchScope ? searchScope.value : 'all';
    const filterVideoId = scope === 'current' ? curVideoId : null;

    chrome.runtime.sendMessage({
      action: 'SEARCH_AWS_NOTES',
      payload: {
        query,
        videoId: filterVideoId,
        level: 'all',
        lang: 'all'
      }
    }, response => {
      // 1. Got results (from cloud OR local chunk cache via background.js fallback)
      if (response && response.ok && response.in_context && Array.isArray(response.results) && response.results.length > 0) {
        // Detect if results came from local cache (no grounded_answer = local)
        const isLocal = !response.grounded_answer;
        renderSearchResultsCards(response.results, response.grounded_answer || null, response.citations || null, query, isLocal);
        return;
      }

      // 2. Server/cache returned ok but no matches — show its message
      if (response && response.ok && !response.in_context) {
        const msg = response.message || `"${query}" was not found in your saved notes.`;
        // Still try in-memory cached notes as absolute last resort
        const localMatches = searchLocalNotes(query, filterVideoId);
        if (localMatches.length > 0) {
          renderSearchResultsCards(localMatches, null, null, query, true);
          return;
        }
        searchBody.innerHTML = `
          <div class="sp-search-empty">
            <div style="font-size:28px;margin-bottom:6px;">🛡️</div>
            <div style="font-weight:700;color:#fbbf24;">Topic Not In Saved Notes</div>
            <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.6;max-width:280px;">
              ${escapeHtml(msg)}
            </div>
            <div style="font-size:11px;color:var(--cyan);margin-top:10px;">
              💡 Tip: Click <strong>☁️ Save</strong> on a generated note to make it searchable.
            </div>
          </div>
        `;
        if (searchStats) searchStats.textContent = '0 matches';
        return;
      }

      // 3. Something failed entirely — last resort: search in-memory cached notes
      const localMatches = searchLocalNotes(query, filterVideoId);
      if (localMatches.length > 0) {
        renderSearchResultsCards(localMatches, null, null, query, true);
        return;
      }

      // 4. Truly nothing found anywhere
      searchBody.innerHTML = `
        <div class="sp-search-empty">
          <div style="font-size:28px;margin-bottom:6px;">🛡️</div>
          <div style="font-weight:700;color:#fbbf24;">Topic Not In Saved Notes</div>
          <div style="font-size:12px;color:var(--muted);margin-top:6px;line-height:1.6;max-width:280px;">
            "${escapeHtml(query)}" was not found in your saved lecture notes.
          </div>
          <div style="font-size:11px;color:var(--cyan);margin-top:10px;">
            💡 Tip: Click <strong>☁️ Save</strong> on a generated note to make it searchable.
          </div>
        </div>
      `;
      if (searchStats) searchStats.textContent = '0 matches';
    });
  }

}); // end DOMContentLoaded

