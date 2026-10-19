/**
 * RecallAI YouTube Companion — Content Script
 * Injects a parallel note-taking sidebar directly into YouTube.
 */

(() => {
  // State
  let sidebarOpen = false;
  let currentLevel = 'overview'; // overview, summary, detailed
  let currentLang = 'english';    // english, hindi, hinglish
  let isHandwritten = false;
  let isLiveMode = false;
  let liveInterval = null;
  let videoEl = null;
  let currentVideoId = null;
  let videoTranscript = []; // [{start: seconds, duration: seconds, text: string}]
  let isGenerating = false;
  let cachedNotes = {
    overview: {},
    summary: {},
    detailed: {}
  };
  let liveNotesList = [];

  // ============================================================
  // INITIALIZATION & YOUTUBE PAGE LISTENER
  // ============================================================

  function init() {
    setupTriggerButton();
    setupSidebar();
    hookYouTubeEvents();
    checkForVideo();
  }

  function getMainVideoElement() {
    // 1. Primary main video element inside YouTube's main movie player
    const mainPlayerVid = document.querySelector('#movie_player video.html5-main-video')
      || document.querySelector('#movie_player video');
    if (mainPlayerVid) return mainPlayerVid;

    // 2. Fallback: find any video element that is NOT inside sidebar hover preview or thumbnail
    const allVideos = Array.from(document.querySelectorAll('video'));
    for (const v of allVideos) {
      if (v.closest('ytd-video-preview, ytd-thumbnail, ytd-compact-video-renderer, #inline-preview-player, ytd-moving-thumbnail-renderer')) {
        continue;
      }
      if (v.classList.contains('html5-main-video')) return v;
    }

    const nonPreview = allVideos.find(v => !v.closest('ytd-video-preview, ytd-thumbnail, ytd-compact-video-renderer, #inline-preview-player, ytd-moving-thumbnail-renderer'));
    return nonPreview || allVideos[0] || null;
  }

  function getYouTubeTitle() {
    const el = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')
      || document.querySelector('h1.ytd-watch-metadata')
      || document.querySelector('#title h1')
      || document.querySelector('#container h1.title');
    return el?.textContent?.trim() || document.title.replace(' - YouTube', '').trim() || 'YouTube Video';
  }

  function getYouTubeChannel() {
    const el = document.querySelector('#upload-info #channel-name a')
      || document.querySelector('ytd-watch-metadata #channel-name a')
      || document.querySelector('ytd-video-owner-renderer #channel-name a')
      || document.querySelector('#owner-name a')
      || document.querySelector('ytd-channel-name yt-formatted-string')
      || document.querySelector('#channel-name');
    return el?.textContent?.trim() || '';
  }

  function getYouTubeDescription() {
    return document.querySelector('#description-inline-expander yt-attributed-string')?.textContent?.trim()
      || document.querySelector('#description-inline-expander')?.textContent?.trim()
      || '';
  }

  function updateSidebarMetadata() {
    const titleEl = document.getElementById('rc-video-title');
    const chanEl = document.getElementById('rc-channel-text');
    if (!titleEl) return;
    const title = getYouTubeTitle();
    const channel = getYouTubeChannel();
    if (title && title !== 'YouTube Video') {
      titleEl.textContent = title;
      titleEl.title = title;
    }
    if (chanEl && channel) {
      chanEl.textContent = channel;
    }
  }

  function hookYouTubeEvents() {
    window.addEventListener('yt-navigate-finish', checkForVideo);
    window.addEventListener('yt-page-data-updated', checkForVideo);
    window.addEventListener('popstate', checkForVideo);

    // Continuous watch for video changes and SPA navigation
    setInterval(() => {
      const vId = getVideoId();
      if (vId && vId !== currentVideoId) {
        checkForVideo();
      }
      const vid = getMainVideoElement();
      if (vid && vid !== videoEl) {
        attachVideoListeners(vid);
      }
      updateSidebarMetadata();
    }, 1000);
  }

  function getVideoId() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('v')) return params.get('v');
    const match = window.location.pathname.match(/\/(live|shorts)\/([a-zA-Z0-9_-]+)/);
    if (match) return match[2];
    return null;
  }

  function isLiveVideo() {
    if (window.location.pathname.includes('/live/')) return true;
    const badge = document.querySelector('.ytp-live-badge:not([disabled])');
    if (badge) return true;
    if (videoEl && !isNaN(videoEl.duration) && videoEl.duration === Infinity) return true;
    return false;
  }

  // Live caption accumulation for real-time streams
  let liveCaptionsBuffer = [];
  let lastSeenCaption = '';

  function setupLiveCaptionObserver() {
    const player = document.querySelector('#movie_player') || document.body;
    if (!player) return;

    const obs = new MutationObserver(() => {
      const segments = Array.from(document.querySelectorAll('.ytp-caption-segment'))
        .map(el => el.textContent.trim())
        .filter(Boolean);

      if (segments.length > 0) {
        const full = segments.join(' ');
        if (full && full !== lastSeenCaption) {
          lastSeenCaption = full;
          const curTime = videoEl ? (videoEl.currentTime || 0) : 0;
          const item = { start: curTime, duration: 4, text: full };
          liveCaptionsBuffer.push(item);
          if (!videoTranscript.some(t => Math.abs(t.start - curTime) < 3 && t.text === full)) {
            videoTranscript.push(item);
            saveTranscriptToStorage(getVideoId() || currentVideoId, videoTranscript);
          }
        }
      }
    });

    obs.observe(player, { childList: true, subtree: true, characterData: true });
  }

  function checkForVideo() {
    const vId = getVideoId();
    const trigger = document.getElementById('recall-ai-trigger');

    if (vId) {
      if (trigger) trigger.style.display = 'flex';
      if (vId !== currentVideoId) {
        console.log('[RecallAI] Detected new video:', vId, '(was:', currentVideoId, ')');
        currentVideoId = vId;
        cachedNotes = { overview: {}, summary: {}, detailed: {} };
        liveNotesList = [];
        videoTranscript = [];
        liveCaptionsBuffer = [];
        capturedKeyframes = {};

        // Reset sidebar notes body immediately so previous video's notes do not linger
        const body = document.getElementById('rc-notes-body');
        if (body) {
          body.innerHTML = `
            <div class="rc-empty-state">
              <div class="rc-empty-icon">${currentLevel.toUpperCase()}</div>
              <div style="font-weight:600;color:#fff;">${currentLevel.toUpperCase()} Notes Not Generated Yet</div>
              <div style="font-size:12px;color:var(--rc-muted);line-height:1.5;margin-top:6px;max-width:280px;">
                Click below to run the pipeline and generate full ${currentLevel.toUpperCase()} notes for this lecture.
              </div>
              <button id="rc-quick-gen" class="rc-action-btn" style="margin-top:14px;width:auto;padding:8px 18px;">
                Generate ${currentLevel.toUpperCase()} Notes
              </button>
            </div>
          `;
          document.getElementById('rc-quick-gen')?.addEventListener('click', generateCurrentNotes);
        }

        chrome.storage.local.get([`rc_keyframes_${vId}`, `rc_transcript_${vId}`, `rc_cached_notes_${vId}`], res => {
          if (res && res[`rc_keyframes_${vId}`]) {
            capturedKeyframes = res[`rc_keyframes_${vId}`];
          }
          if (res && Array.isArray(res[`rc_transcript_${vId}`]) && res[`rc_transcript_${vId}`].length > 0) {
            videoTranscript = res[`rc_transcript_${vId}`];
            const statusEl = document.getElementById('rc-transcript-status');
            if (statusEl) statusEl.textContent = `Captions: cached (${videoTranscript.length} lines)`;
          }
          if (res && res[`rc_cached_notes_${vId}`]) {
            cachedNotes = res[`rc_cached_notes_${vId}`];
            const cached = cachedNotes[currentLevel]?.[currentLang];
            if (cached) {
              renderMarkdownNotes(cached);
            }
          }
        });
        fetchYouTubeTranscript(vId);
      }
      const vid = getMainVideoElement();
      if (vid) attachVideoListeners(vid);
      setupLiveCaptionObserver();
      setTimeout(updateSidebarMetadata, 500);
      setTimeout(updateSidebarMetadata, 1500);
    } else {
      if (trigger) trigger.style.display = 'none';
      closeSidebar();
    }
  }

  function attachVideoListeners(vid) {
    videoEl = vid;
    videoEl.addEventListener('timeupdate', onTimeUpdate);
    videoEl.addEventListener('seeked', () => sampleFrameIfNeeded());
    videoEl.addEventListener('play', () => {
      if (isLiveMode && !liveInterval) startLiveTracking();
      sampleFrameIfNeeded();
    });
    videoEl.addEventListener('pause', () => {
      // Keep tracking or idle
    });
    setupLiveCaptionObserver();
  }

  function onTimeUpdate() {
    if (!videoEl) return;
    const cur = videoEl.currentTime || 0;
    const dur = videoEl.duration || 0;
    const tracker = document.getElementById('rc-time-display');
    if (tracker) {
      tracker.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    }
    sampleFrameIfNeeded();
  }

  function formatTime(sec) {
    sec = Math.floor(sec || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  function parseTimeStr(str) {
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return Number(str) || 0;
  }

  // ============================================================
  // UI CONSTRUCTION
  // ============================================================

  function setupTriggerButton() {
    if (document.getElementById('recall-ai-trigger')) return;

    const btn = document.createElement('div');
    btn.id = 'recall-ai-trigger';
    btn.title = 'Open RecallAI Parallel Notes';
    btn.innerHTML = `<span class="trigger-label">Notes</span>`;
    btn.addEventListener('click', toggleSidebar);
    document.body.appendChild(btn);
  }

  function setupSidebar() {
    if (document.getElementById('recall-ai-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'recall-ai-sidebar';
    sidebar.innerHTML = `
      <!-- Header -->
      <div class="rc-header">
        <div class="rc-brand">
          <span class="rc-brand-title">RecallAI Companion</span>
        </div>
        <div class="rc-header-controls">
          <button class="rc-icon-btn" id="rc-cloud-save-btn" title="Save Notes to AWS DynamoDB" style="display:flex;align-items:center;gap:3px;padding:3px 8px;font-size:11px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;border-radius:6px;cursor:pointer;">☁️ Save</button>
          <button class="rc-icon-btn" id="rc-key-btn" title="Gemini API Key Settings">Key</button>
          <button class="rc-icon-btn" id="rc-close-btn" title="Close Sidebar">✕</button>
        </div>
      </div>

      <!-- Live Tracker -->
      <div class="rc-tracker-bar">
        <div class="rc-live-pill">
          <span class="rc-pulse-dot"></span>
          <span id="rc-status-text">Ready to sync</span>
        </div>
        <span id="rc-time-display" style="font-family:'JetBrains Mono',monospace;font-size:11px;">0:00 / 0:00</span>
      </div>

      <!-- Current Video & Channel Bar -->
      <div class="rc-video-meta" id="rc-video-meta">
        <div class="rc-video-title" id="rc-video-title" title="Current Video">Detecting video...</div>
        <div class="rc-channel-name" id="rc-channel-name">
          <span class="rc-channel-badge">CHANNEL</span>
          <span id="rc-channel-text">Detecting channel...</span>
        </div>
      </div>

      <!-- Controls -->
      <div class="rc-controls">
        <!-- Levels -->
        <div class="rc-btn-group">
          <button class="rc-tab-btn active-l1" data-level="overview" id="rc-btn-l1">Overview</button>
          <button class="rc-tab-btn" data-level="summary" id="rc-btn-l2">Summary</button>
          <button class="rc-tab-btn" data-level="detailed" id="rc-btn-l3">Detailed</button>
        </div>

        <!-- Languages -->
        <div class="rc-btn-group">
          <button class="rc-tab-btn active-lang" data-lang="english" id="rc-btn-en">English</button>
          <button class="rc-tab-btn" data-lang="hindi" id="rc-btn-hi">हिन्दी</button>
          <button class="rc-tab-btn" data-lang="hinglish" id="rc-btn-hing">Hinglish</button>
        </div>

        <!-- Toggles -->
        <div class="rc-toggle-row">
          <button class="rc-switch-btn" id="rc-toggle-handwritten" title="Toggle handwritten font style">
            <span>Handwritten</span>
          </button>
          <button class="rc-switch-btn" id="rc-toggle-live" title="Generate notes live in parallel as you watch">
            <span>Live Parallel Mode</span>
          </button>
        </div>

        <!-- Primary Action -->
        <button class="rc-action-btn" id="rc-generate-btn">
          <span>Generate Notes for Video</span>
        </button>
      </div>

      <!-- Notes Body -->
      <div class="rc-body" id="rc-notes-body">
        <div class="rc-empty-state">
          <div class="rc-empty-icon">Notes</div>
          <div style="font-weight:600;color:#fff;">Parallel Video Notes</div>
          <div style="font-size:12px;line-height:1.5;">Click <b>"Generate Notes"</b> to create full structured notes, or enable <b>"Live Parallel Mode"</b> to take notes alongside the video as you watch.</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="rc-footer">
        <span id="rc-transcript-status" style="font-size:11px;color:var(--rc-muted);">Captions: detecting…</span>
        <div class="rc-footer-actions">
          <button class="rc-footer-btn" id="rc-cloud-save-footer-btn" title="Save Active Notes to AWS DynamoDB" style="display:flex;align-items:center;gap:4px;border:1px solid rgba(56,189,248,0.4);color:#38bdf8;">
            <span>☁️ Save AWS</span>
          </button>
          <button class="rc-footer-btn" id="rc-studio-footer-btn" title="Open Interactive Notes Studio: Edit, Draw & Share" style="display:flex;align-items:center;gap:4px;border:1px solid rgba(139,92,246,0.4);color:#c084fc;">
            <span>✏️ Studio</span>
          </button>
          <button class="rc-footer-btn rc-pdf-btn-hero" id="rc-pdf-btn" title="Download Notes as PDF">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download PDF</span>
          </button>
        </div>
      </div>


      <!-- API Key Modal -->
      <div id="rc-key-modal" class="hidden">
        <div class="rc-modal-card">
          <div class="rc-modal-title">
            <span>Gemini API Key</span>
          </div>
          <div style="font-size:12px;color:var(--rc-muted);">Enter your Google Gemini API key to enable instant parallel note generation. Key is stored securely in your browser.</div>
          <input type="password" id="rc-key-input" class="rc-modal-input" placeholder="AIzaSy..." />
          <div id="rc-key-msg" style="font-size:11.5px;color:var(--rc-red);display:none;"></div>
          <div class="rc-modal-actions">
            <button class="rc-footer-btn" id="rc-key-cancel">Cancel</button>
            <button class="rc-action-btn" style="width:auto;padding:6px 14px;" id="rc-key-save">Save & Verify</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(sidebar);
    bindSidebarEvents();
  }

  function bindSidebarEvents() {
    document.getElementById('rc-close-btn').addEventListener('click', toggleSidebar);

    // Levels
    ['overview', 'summary', 'detailed'].forEach(lvl => {
      const btn = document.getElementById(`rc-btn-${lvl === 'overview' ? 'l1' : lvl === 'summary' ? 'l2' : 'l3'}`);
      btn.addEventListener('click', () => setLevel(lvl, btn));
    });

    // Languages
    ['english', 'hindi', 'hinglish'].forEach(lang => {
      const btn = document.getElementById(`rc-btn-${lang === 'english' ? 'en' : lang === 'hindi' ? 'hi' : 'hing'}`);
      btn.addEventListener('click', () => setLanguage(lang, btn));
    });

    // Handwritten toggle
    const hwBtn = document.getElementById('rc-toggle-handwritten');
    hwBtn.addEventListener('click', () => {
      isHandwritten = !isHandwritten;
      hwBtn.classList.toggle('active', isHandwritten);
      const body = document.getElementById('rc-notes-body');
      body.classList.toggle('handwritten', isHandwritten);
    });

    // Live mode toggle
    const liveBtn = document.getElementById('rc-toggle-live');
    liveBtn.addEventListener('click', toggleLiveMode);

    // Generate button
    document.getElementById('rc-generate-btn').addEventListener('click', generateCurrentNotes);

    // API Key modal
    const keyBtn = document.getElementById('rc-key-btn');
    const modal = document.getElementById('rc-key-modal');
    keyBtn.addEventListener('click', openKeyModal);
    document.getElementById('rc-key-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('rc-key-save').addEventListener('click', saveApiKey);

    // Download PDF
    document.getElementById('rc-pdf-btn')?.addEventListener('click', downloadPdfNotes);

    // Notes Studio
    document.getElementById('rc-studio-footer-btn')?.addEventListener('click', openStudioFromContent);

    // AWS Cloud Save
    const cloudSaveBtn = document.getElementById('rc-cloud-save-btn');
    if (cloudSaveBtn) cloudSaveBtn.addEventListener('click', saveActiveNotesToAws);
    const cloudSaveFooterBtn = document.getElementById('rc-cloud-save-footer-btn');
    if (cloudSaveFooterBtn) cloudSaveFooterBtn.addEventListener('click', saveActiveNotesToAws);
  }

  function openStudioFromContent() {
    const text = cachedNotes[currentLevel]?.[currentLang] || liveNotesList.join('\n\n');
    const vId = currentVideoId || getVideoId();
    const title = `RecallAI — ${currentLevel.toUpperCase()} Notes (${currentLang.toUpperCase()})`;
    chrome.runtime.sendMessage({
      action: 'OPEN_STUDIO_PAGE',
      data: {
        markdown: text,
        title: title,
        videoId: vId,
        level: currentLevel,
        lang: currentLang,
        keyframes: capturedKeyframes
      }
    });
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    const sidebar = document.getElementById('recall-ai-sidebar');
    if (sidebar) sidebar.classList.toggle('open', sidebarOpen);
  }

  function closeSidebar() {
    sidebarOpen = false;
    const sidebar = document.getElementById('recall-ai-sidebar');
    if (sidebar) sidebar.classList.remove('open');
  }

  function setLevel(lvl, btn) {
    currentLevel = lvl;
    document.querySelectorAll('[id^="rc-btn-l"]').forEach(b => {
      b.className = 'rc-tab-btn';
    });
    const cls = { overview: 'active-l1', summary: 'active-l2', detailed: 'active-l3' };
    btn.classList.add(cls[lvl]);

    const cached = cachedNotes[currentLevel]?.[currentLang];
    if (cached) {
      renderMarkdownNotes(cached);
    } else {
      const body = document.getElementById('rc-notes-body');
      body.innerHTML = `
        <div class="rc-empty-state">
          <div class="rc-empty-icon">${lvl.toUpperCase()}</div>
          <div style="font-weight:600;color:#fff;">${lvl.toUpperCase()} Notes Not Generated Yet</div>
          <div style="font-size:12px;color:var(--rc-muted);line-height:1.5;margin-top:6px;max-width:280px;">
            Click below to run the pipeline and generate full ${lvl.toUpperCase()} notes for this lecture.
          </div>
          <button id="rc-quick-gen" class="rc-action-btn" style="margin-top:14px;width:auto;padding:8px 18px;">
            Generate ${lvl.toUpperCase()} Notes
          </button>
        </div>
      `;
      document.getElementById('rc-quick-gen')?.addEventListener('click', generateCurrentNotes);
    }
  }

  function setLanguage(lang, btn) {
    currentLang = lang;
    document.querySelectorAll('[data-lang]').forEach(b => b.classList.remove('active-lang'));
    btn.classList.add('active-lang');

    const cached = cachedNotes[currentLevel]?.[currentLang];
    if (cached) {
      renderMarkdownNotes(cached);
    } else {
      const body = document.getElementById('rc-notes-body');
      body.innerHTML = `
        <div class="rc-empty-state">
          <div class="rc-empty-icon">${lang.toUpperCase()}</div>
          <div style="font-weight:600;color:#fff;">${currentLevel.toUpperCase()} in ${lang.toUpperCase()} Not Generated</div>
          <div style="font-size:12px;color:var(--rc-muted);line-height:1.5;margin-top:6px;max-width:280px;">
            Click below to generate ${currentLevel.toUpperCase()} in ${lang.toUpperCase()}.
          </div>
          <button id="rc-quick-gen" class="rc-action-btn" style="margin-top:14px;width:auto;padding:8px 18px;">
            Generate in ${lang.toUpperCase()}
          </button>
        </div>
      `;
      document.getElementById('rc-quick-gen')?.addEventListener('click', generateCurrentNotes);
    }
  }

  // =============================================================
  // TRANSCRIPT EXTRACTION — ROBUST MULTI-STRATEGY
  // =============================================================

  function parseTranscriptData(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const trimmed = rawText.trim();

    // 1. JSON3 format (modern YouTube)
    if (trimmed.startsWith('{')) {
      try {
        const data = JSON.parse(trimmed);
        if (data.events) {
          const res = data.events
            .filter(ev => ev.segs && ev.segs.length > 0)
            .map(ev => {
              const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
              return { start: (ev.tStartMs || 0) / 1000, duration: (ev.dDurationMs || 0) / 1000, text };
            })
            .filter(item => item.text);
          if (res.length > 0) return res;
        }
      } catch (e) {}
    }

    // 2. XML timedtext format
    if (trimmed.startsWith('<') && trimmed.includes('<text')) {
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

  // Fetch via background worker (bypasses content-script CORS)
  function bgFetch(url) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'FETCH_TRANSCRIPT_URL', url }, resp => {
        if (chrome.runtime.lastError || !resp?.ok) resolve(null);
        else resolve(resp.text);
      });
    });
  }

  let bridgeCaptionTracks = [];

  window.addEventListener('__RC_RESP_TRACKS__', (e) => {
    if (e.detail?.tracks && Array.isArray(e.detail.tracks) && e.detail.tracks.length > 0) {
      bridgeCaptionTracks = e.detail.tracks;
    }
  });

  async function getCaptionTracks(vId) {
    // 1. Direct from player bridge (MAIN world)
    if (bridgeCaptionTracks.length > 0) return bridgeCaptionTracks;

    try {
      const tracks = await new Promise(resolve => {
        const handler = (e) => {
          window.removeEventListener('__RC_RESP_TRACKS__', handler);
          resolve(e.detail?.tracks || []);
        };
        window.addEventListener('__RC_RESP_TRACKS__', handler);
        window.dispatchEvent(new CustomEvent('__RC_REQ_TRACKS__'));
        setTimeout(() => {
          window.removeEventListener('__RC_RESP_TRACKS__', handler);
          resolve(bridgeCaptionTracks);
        }, 400);
      });
      if (tracks.length > 0) {
        bridgeCaptionTracks = tracks;
        return tracks;
      }
    } catch (e) {}

    // 2. Background worker fetch
    try {
      const r = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'FETCH_CAPTION_TRACKS', videoId: vId }, res => {
          if (chrome.runtime.lastError) resolve({ ok: false, tracks: [] });
          else resolve(res || { ok: false, tracks: [] });
        });
      });
      if (r.ok && r.tracks?.length) return r.tracks;
    } catch(e) {}

    return [];
  }

  async function fetchYouTubeTranscript(vId) {
    const statusEl = document.getElementById('rc-transcript-status');
    if (statusEl) statusEl.textContent = 'Captions: detecting…';

    try {
      const tracks = await getCaptionTracks(vId);

      if (tracks && tracks.length > 0) {
        // Sort: English first, then Hindi, then any
        const sorted = [...tracks].sort((a, b) => {
          const ae = (a.languageCode || '').startsWith('en') ? 0 : 1;
          const be = (b.languageCode || '').startsWith('en') ? 0 : 1;
          return ae - be;
        });

        for (const track of sorted) {
          if (!track.baseUrl) continue;
          const base = track.baseUrl;
          const urls = base.includes('fmt=') ? [base] : [base + '&fmt=json3', base];

          for (const url of urls) {
            // Use bg worker fetch to avoid CORS in content script
            const rawText = await bgFetch(url);
            if (!rawText) continue;
            const parsed = parseTranscriptData(rawText);
            if (parsed.length > 0) {
              videoTranscript = parsed;
              console.log(`[RecallAI] ${parsed.length} caption lines from`, url);
              if (statusEl) statusEl.textContent = `Captions: ready (${parsed.length} lines)`;
              saveTranscriptToStorage(vId, videoTranscript);
              return videoTranscript;
            }
          }
        }
      }

      // Live stream fallback: read visible on-screen captions
      const onscreen = Array.from(document.querySelectorAll('.ytp-caption-segment'))
        .map(el => el.textContent.trim()).filter(Boolean);
      if (onscreen.length > 0) {
        const t = videoEl?.currentTime || 0;
        videoTranscript = [{ start: t, duration: 10, text: onscreen.join(' ') }];
        if (statusEl) statusEl.textContent = 'Captions: live tracking';
        saveTranscriptToStorage(vId, videoTranscript);
        return videoTranscript;
      }

      // Background InnerTube fallback
      const bgRes = await new Promise(res => {
        chrome.runtime.sendMessage({ action: 'GET_VIDEO_TRANSCRIPT', videoId: vId }, r => {
          if (chrome.runtime.lastError) res({ ok: false, transcript: [] });
          else res(r || { ok: false, transcript: [] });
        });
      });
      if (bgRes?.ok && Array.isArray(bgRes.transcript) && bgRes.transcript.length > 0) {
        videoTranscript = bgRes.transcript;
        if (statusEl) statusEl.textContent = `Captions: ready (${videoTranscript.length} lines)`;
        saveTranscriptToStorage(vId, videoTranscript);
        return videoTranscript;
      }

      saveTranscriptToStorage(vId, []);
      if (statusEl) statusEl.textContent = 'Captions: not found (topic mode)';
      return [];

    } catch (e) {
      console.error('[RecallAI] Transcript error:', e);
      if (statusEl) statusEl.textContent = 'Captions: error';
      return [];
    }
  }

      // Sort: English first, then any
      const sorted = [...tracks].sort((a, b) => {
        const ae = (a.languageCode || '').startsWith('en') ? 0 : 1;
        const be = (b.languageCode || '').startsWith('en') ? 0 : 1;
        return ae - be;
      });

      for (const track of sorted) {
        if (!track.baseUrl) continue;
        if (track.baseUrl.includes('v=') && !track.baseUrl.includes(`v=${vId}`)) {
          console.warn('[RecallAI] Skipping foreign caption track:', track.baseUrl);
          continue;
        }
        const base = track.baseUrl;
        const urls = base.includes('fmt=') ? [base] : [base + '&fmt=json3', base];

        for (const url of urls) {
          // Use bg worker fetch to avoid CORS in content script
          const rawText = await bgFetch(url);
          if (!rawText) continue;
          const parsed = parseTranscriptData(rawText);
          if (parsed.length > 0) {
            videoTranscript = parsed;
            console.log(`[RecallAI] ${parsed.length} caption lines from`, url);
            if (statusEl) statusEl.textContent = `Captions: ready (${parsed.length} lines)`;
            saveTranscriptToStorage(vId, videoTranscript);
            return videoTranscript;
          }
        }
      }

      // Live stream fallback: read visible on-screen captions
      const onscreen = Array.from(document.querySelectorAll('.ytp-caption-segment'))
        .map(el => el.textContent.trim()).filter(Boolean);
      if (onscreen.length > 0) {
        const t = videoEl?.currentTime || 0;
        videoTranscript = [{ start: t, duration: 10, text: onscreen.join(' ') }];
        if (statusEl) statusEl.textContent = 'Captions: live tracking';
        saveTranscriptToStorage(vId, videoTranscript);
        return videoTranscript;
      }

      saveTranscriptToStorage(vId, []);
      if (statusEl) statusEl.textContent = 'Captions: not found (topic mode)';
      console.warn('[RecallAI] No captions for', vId);
      return [];

    } catch (e) {
      console.error('[RecallAI] Transcript error:', e);
      if (statusEl) statusEl.textContent = 'Captions: error';
      return [];
    }
  }

  function saveTranscriptToStorage(vId, transcript) {
    const vTitle = getYouTubeTitle();
    const vChannel = getYouTubeChannel();
    const vDesc = getYouTubeDescription();
    const chapters = Array.from(document.querySelectorAll('ytd-macro-markers-list-item-renderer'))
      .map(el => el.innerText?.trim()).filter(Boolean).join('\n');

    chrome.storage.local.set({
      rc_video_id: vId,
      rc_video_title: vTitle,
      rc_video_channel: vChannel,
      rc_video_desc: vDesc.slice(0, 3000),
      rc_chapters: chapters,
      rc_transcript: transcript,
      [`rc_transcript_${vId}`]: transcript,
      [`rc_meta_${vId}`]: { title: vTitle, channel: vChannel, desc: vDesc.slice(0, 3000), chapters }
    });
    console.log('[RecallAI] Saved to storage — title:', vTitle, '| channel:', vChannel, '| transcript lines:', transcript.length);
  }

  // ============================================================
  // LIVE PARALLEL MODE
  // ============================================================

  function toggleLiveMode() {
    isLiveMode = !isLiveMode;
    const btn = document.getElementById('rc-toggle-live');
    btn.classList.toggle('active-live', isLiveMode);

    const status = document.getElementById('rc-status-text');

    if (isLiveMode) {
      status.textContent = 'Live Parallel Sync: Active';
      status.style.color = 'var(--rc-red)';
      startLiveTracking();
    } else {
      status.textContent = 'Ready to sync';
      status.style.color = 'var(--rc-cyan)';
      stopLiveTracking();
    }
  }

  let lastProcessedTime = 0;

  function startLiveTracking() {
    if (liveInterval) clearInterval(liveInterval);

    // Initial check
    processLiveInterval();

    // Check every 25 seconds of video play
    liveInterval = setInterval(() => {
      if (videoEl && !videoEl.paused) {
        processLiveInterval();
      }
    }, 25000);
  }

  function stopLiveTracking() {
    if (liveInterval) {
      clearInterval(liveInterval);
      liveInterval = null;
    }
  }

  async function processLiveInterval() {
    if (!videoEl || videoEl.paused) return;
    const curTime = videoEl.currentTime;

    // Only process if at least 25s forward has passed
    if (curTime - lastProcessedTime < 20) return;

    // Filter transcript lines between lastProcessedTime and curTime
    const slice = videoTranscript.filter(seg => seg.start >= lastProcessedTime - 5 && seg.start <= curTime + 5);
    lastProcessedTime = curTime;

    if (!slice || slice.length === 0) return;

    const sliceText = slice.map(s => `[${formatTime(s.start)}] ${s.text}`).join('\n');

    // Send incremental note prompt
    generateLiveNoteChunk(sliceText, curTime);
  }

  async function generateLiveNoteChunk(chunkText, timestamp) {
    const key = await getStoredApiKey();
    if (!key) return;

    const langName = { english: 'English', hindi: 'Hindi', hinglish: 'Hinglish' }[currentLang];
    const timeStr = formatTime(timestamp);

    const prompt = `You are a live lecture companion taking bullet notes parallelly while a student watches.
The student is currently at timestamp [${timeStr}].
Here is the spoken transcript segment from this part of the lecture:
---
${chunkText}
---

Task: Write 1 to 3 concise, highly valuable study bullet points summarizing the core concept or explanation taught in this segment in ${langName}.
Start the first bullet with the clickable timestamp tag [${timeStr}].
Preserve exact technical terminology, definitions, and equations. Do not repeat greeting/filler words.`;

    chrome.runtime.sendMessage({
      action: 'CALL_GEMINI',
      apiKey: key,
      prompt: prompt,
      model: 'gemini-2.5-flash'
    }, response => {
      if (response && response.ok && response.text) {
        liveNotesList.push(response.text.trim());
        appendLiveNoteToView(response.text.trim(), timeStr);
      }
    });
  }

  function appendLiveNoteToView(markdownChunk, timeStr) {
    const body = document.getElementById('rc-notes-body');
    const empty = body.querySelector('.rc-empty-state');
    if (empty) empty.remove();

    const chunkDiv = document.createElement('div');
    chunkDiv.style.marginBottom = '14px';
    chunkDiv.style.padding = '10px 14px';
    chunkDiv.style.background = 'var(--rc-surface2)';
    chunkDiv.style.border = '1px solid var(--rc-border)';
    chunkDiv.style.borderRadius = '10px';
    chunkDiv.style.animation = 'fadeIn 0.4s ease';

    chunkDiv.innerHTML = renderMarkdown(markdownChunk);
    body.appendChild(chunkDiv);
    bindTimestamps(chunkDiv);

    // Auto-scroll to bottom of live stream
    body.scrollTop = body.scrollHeight;
  }

  let capturedKeyframes = {}; // { [second]: { timestamp: sec, timeStr: 'MM:SS', dataUrl: 'data:image/jpeg;base64,...' } }
  let lastCapturedTimeSec = -100;

  function sampleFrameIfNeeded() {
    const el = getMainVideoElement() || videoEl;
    if (!el || el.paused || !el.videoWidth) return;
    const cur = el.currentTime || 0;
    if (Math.abs(cur - lastCapturedTimeSec) >= 20) {
      lastCapturedTimeSec = cur;
      const f = captureCurrentFrame();
      if (f && f.base64) {
        const key = Math.floor(cur);
        const dataUrl = `data:image/jpeg;base64,${f.base64}`;
        capturedKeyframes[key] = { timestamp: cur, timeStr: formatTime(cur), dataUrl };
        const vId = getVideoId() || currentVideoId;
        if (vId) {
          chrome.storage.local.set({ [`rc_keyframes_${vId}`]: capturedKeyframes });
        }
      }
    }
  }

  function captureCurrentFrame() {
    const el = getMainVideoElement() || videoEl;
    if (!el || !el.videoWidth) return null;
    try {
      const canvas = document.createElement('canvas');
      const width = Math.min(800, el.videoWidth || 640);
      const height = Math.round(width * ((el.videoHeight || 360) / (el.videoWidth || 640)));
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(el, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      return {
        timestamp: el.currentTime || 0,
        base64: dataUrl.split(',')[1]
      };
    } catch (e) {
      console.warn('[RecallAI] Frame capture notice:', e);
      return null;
    }
  }

  // ============================================================
  // FULL NOTES GENERATION
  // ============================================================

  async function generateCurrentNotes() {
    const key = await getStoredApiKey();
    if (!key) {
      openKeyModal();
      return;
    }

    if (isGenerating) return;

    const genBtn = document.getElementById('rc-generate-btn');
    const body = document.getElementById('rc-notes-body');
    const vId = currentVideoId || getVideoId();

    // If transcript not loaded yet, actively retry fetching now
    if (!videoTranscript || videoTranscript.length === 0) {
      body.innerHTML = `
        <div class="rc-empty-state">
          <div class="rc-spinner" style="width:32px;height:32px;"></div>
          <div style="font-weight:600;color:#fff;">Detecting Lecture Captions…</div>
          <div style="font-size:12px;color:var(--rc-muted);">Retrieving transcript from YouTube player…</div>
        </div>
      `;
      await fetchYouTubeTranscript(vId);
    }

    const vTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
      || document.querySelector('h1.ytd-watch-metadata')?.textContent?.trim()
      || document.title.replace(' - YouTube', '').trim();

    isGenerating = true;
    genBtn.disabled = true;
    genBtn.innerHTML = '<div class="rc-spinner"></div><span>Running Lecture Pipeline…</span>';

    body.innerHTML = `
      <div class="rc-empty-state">
        <div class="rc-spinner" style="width:32px;height:32px;"></div>
        <div style="font-weight:600;color:#fff;">Running Background Lecture Pipeline</div>
        <div style="font-size:12px;color:var(--rc-muted);line-height:1.6;margin-top:6px;">
          1. Cleaning transcript &amp; reconstructing sentences<br>
          2. Analyzing whiteboard visuals &amp; LaTeX formulas<br>
          3. Combining multimodal lecture feed<br>
          4. Generating ${currentLevel.toUpperCase()} Notes (${currentLang.toUpperCase()})
        </div>
      </div>
    `;

    // Capture current frame and store
    const curFrame = captureCurrentFrame();
    if (curFrame && curFrame.base64) {
      const curSec = Math.floor(curFrame.timestamp);
      capturedKeyframes[curSec] = {
        timestamp: curFrame.timestamp,
        timeStr: formatTime(curFrame.timestamp),
        dataUrl: `data:image/jpeg;base64,${curFrame.base64}`
      };
      if (vId) {
        chrome.storage.local.set({ [`rc_keyframes_${vId}`]: capturedKeyframes });
      }
    }

    // Select up to 4 keyframes spread across the lecture for Gemini Vision
    const allFrames = Object.values(capturedKeyframes);
    let keyframes = allFrames.slice(-4).map(f => ({
      timestamp: f.timestamp,
      base64: f.dataUrl ? f.dataUrl.split(',')[1] : null
    })).filter(f => f.base64);

    if (keyframes.length === 0 && curFrame && curFrame.base64) {
      keyframes.push(curFrame);
    }

    chrome.runtime.sendMessage({
      action: 'RUN_LECTURE_PIPELINE',
      apiKey: key,
      videoId: vId,
      title: vTitle,
      rawTranscript: videoTranscript,
      keyframes: keyframes,
      currentLevel: currentLevel,
      currentLang: currentLang
    }, response => {
      isGenerating = false;
      genBtn.disabled = false;
      genBtn.innerHTML = '<span>Regenerate Notes</span>';

      if (response && response.ok && response.note) {
        if (!cachedNotes[currentLevel]) cachedNotes[currentLevel] = {};
        cachedNotes[currentLevel][currentLang] = response.note;
        renderMarkdownNotes(response.note);
        if (vId) {
          chrome.storage.local.set({ [`rc_cached_notes_${vId}`]: cachedNotes });
        }

        const statusEl = document.getElementById('rc-transcript-status');
        if (statusEl) {
          statusEl.textContent = `Complete • ${response.cleanSentenceCount || 0} sentences • Synced to platform`;
        }
      } else {
        const err = response?.error || 'Pipeline execution failed';
        body.innerHTML = `
          <div class="rc-empty-state">
            <div class="rc-empty-icon" style="color:var(--rc-red)">✕</div>
            <div style="font-weight:600;color:var(--rc-red);">Pipeline Error</div>
            <div style="font-size:12px;color:var(--rc-muted);">${err}</div>
          </div>
        `;
      }
    });
  }

  // ============================================================
  // MARKDOWN RENDERER & INTERACTIVE VISUALS
  // ============================================================

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
            <span>Flow &amp; Structure Diagram</span>
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
            <span class="rc-split-badge">CODE &amp; SIDEWISE VISUALIZATION</span>
          </div>
          <div class="rc-split-tabs">
            <button class="rc-split-tab active" data-view="split" title="View side-by-side">◫ Side-by-Side</button>
            <button class="rc-split-tab" data-view="code" title="View code box only">Code Box</button>
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
              <button class="rc-lightbox-btn" id="rc-lb-zoom-out" title="Zoom Out">−</button>
              <button class="rc-lightbox-btn" id="rc-lb-zoom-reset" title="Reset Zoom">↺ 100%</button>
              <button class="rc-lightbox-btn" id="rc-lb-zoom-in" title="Zoom In">+</button>
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
        const tag = card?.querySelector('.rc-graph-tag')?.innerText || 'Concept Graph & Diagram';
        if (svg) openLightbox(svg, tag, '');
      });
    });

    // Clicking viewport of SVG directly opens Lightbox
    container.querySelectorAll('.rc-graph-viewport').forEach(vp => {
      vp.addEventListener('dblclick', () => {
        const svg = vp.querySelector('svg');
        if (svg) openLightbox(svg, 'Concept Graph & Diagram', '');
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
        if (img) openLightbox(img, 'Concept Visual (HD)', cap);
      });
    });

    // Clicking the image directly opens Lightbox
    container.querySelectorAll('.rc-figure-img').forEach(img => {
      img.addEventListener('click', () => {
        const fig = img.closest('.rc-figure-card');
        const cap = fig?.querySelector('.rc-figure-caption')?.innerText || '';
        openLightbox(img, 'Concept Visual (HD)', cap);
      });
    });
  }

  function renderMarkdownNotes(rawMd) {
    const body = document.getElementById('rc-notes-body');
    const vId = currentVideoId || getVideoId();
    body.innerHTML = renderMarkdown(rawMd, vId, capturedKeyframes);
    bindTimestamps(body);
    bindCodeCopyButtons(body);
    bindSplitViewToggles(body);
    bindLightbox(body);
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
            btn.innerHTML = 'Copied!';
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

    // 6. Interactive Timestamps: [04:23] -> clickable chips
    md = md.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, (match, timeStr) => {
      const sec = parseTimeStr(timeStr);
      return ` <span class="rc-timestamp" data-sec="${sec}">${timeStr}</span> `;
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

    return html;
  }

  function bindTimestamps(container) {
    const chips = container.querySelectorAll('.rc-timestamp');
    chips.forEach(chip => {
      chip.addEventListener('click', e => {
        e.preventDefault();
        const sec = Number(chip.getAttribute('data-sec'));
        if (videoEl && !isNaN(sec)) {
          videoEl.currentTime = sec;
          videoEl.play();

          // Visual feedback
          chip.style.transform = 'scale(1.15)';
          setTimeout(() => { chip.style.transform = 'scale(1)'; }, 200);
        }
      });
    });
  }

  // ============================================================
  // STORAGE & API KEY MANAGEMENT
  // ============================================================

  function getStoredApiKey() {
    return new Promise(resolve => {
      chrome.storage.local.get(['gemini_api_key'], result => {
        resolve(result.gemini_api_key || '');
      });
    });
  }

  async function openKeyModal() {
    const modal = document.getElementById('rc-key-modal');
    const input = document.getElementById('rc-key-input');
    const msg = document.getElementById('rc-key-msg');
    msg.style.display = 'none';

    const currentKey = await getStoredApiKey();
    if (currentKey) {
      input.value = currentKey;
    }

    modal.classList.remove('hidden');
    input.focus();
  }

  async function saveApiKey() {
    const input = document.getElementById('rc-key-input');
    const msg = document.getElementById('rc-key-msg');
    const modal = document.getElementById('rc-key-modal');
    const saveBtn = document.getElementById('rc-key-save');
    const key = input.value.trim();

    if (!key) {
      msg.textContent = 'Please enter an API key.';
      msg.style.display = 'block';
      return;
    }

    // Immediately save key locally so user doesn't lose it
    chrome.storage.local.set({ gemini_api_key: key });

    saveBtn.disabled = true;
    saveBtn.textContent = 'Verifying…';
    msg.style.display = 'none';

    try {
      chrome.runtime.sendMessage({
        action: 'TEST_GEMINI_KEY',
        apiKey: key
      }, res => {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Key';

        if (chrome.runtime.lastError) {
          // Extension communication issue, but key is already saved in storage
          console.warn('[RecallAI]', chrome.runtime.lastError.message);
          msg.innerHTML = '<span style="color:var(--rc-green)">Key saved locally.</span> <span style="font-size:11px;color:var(--rc-muted);">(Reload extension if needed)</span>';
          msg.style.display = 'block';
          setTimeout(() => modal.classList.add('hidden'), 1500);
          return;
        }

        if (res && res.ok) {
          msg.innerHTML = '<span style="color:var(--rc-green)">Key verified &amp; saved.</span>';
          msg.style.display = 'block';
          setTimeout(() => modal.classList.add('hidden'), 1000);
        } else {
          // Key was saved anyway, but Google API returned an error
          const errMsg = res?.error || 'Could not verify with Google API';
          msg.innerHTML = `<span style="color:var(--rc-yellow)">Saved, note: ${errMsg}</span><br><button id="rc-force-close" style="margin-top:6px;background:var(--rc-surface3);color:#fff;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">Continue Anyway ↗</button>`;
          msg.style.display = 'block';
          document.getElementById('rc-force-close')?.addEventListener('click', () => modal.classList.add('hidden'));
        }
      });
    } catch (err) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Key';
      msg.innerHTML = '<span style="color:var(--rc-green)">Key saved locally.</span>';
      msg.style.display = 'block';
      setTimeout(() => modal.classList.add('hidden'), 1200);
    }
  }

  // ============================================================
  // EXPORT TOOLS
  // ============================================================

  function copyNotes() {
    const text = cachedNotes[currentLevel]?.[currentLang] || liveNotesList.join('\n\n');
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      const btn = document.getElementById('rc-copy-btn');
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  }

  function downloadNotes() {
    const text = cachedNotes[currentLevel]?.[currentLang] || liveNotesList.join('\n\n');
    if (!text) return;

    const dlBtn = document.getElementById('rc-dl-btn');
    if (dlBtn) { dlBtn.textContent = 'Saving…'; }

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_FILE',
      text: text,
      mimeType: 'text/markdown;charset=utf-8',
      filename: `RecallAI_Notes_${currentLevel}_${currentLang}.md`
    }, (res) => {
      if (dlBtn) setTimeout(() => { dlBtn.textContent = 'Download .md'; }, 1500);
      if (chrome.runtime.lastError || !res?.ok) {
        // Fallback: blob URL anchor
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `RecallAI_Notes_${currentLevel}_${currentLang}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  }

  function downloadPdfNotes() {
    const text = cachedNotes[currentLevel]?.[currentLang] || liveNotesList.join('\n\n');
    const pdfBtn = document.getElementById('rc-pdf-btn');
    const defaultBtnHtml = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg><span>Download PDF</span>';
    
    if (!text) {
      if (pdfBtn) {
        pdfBtn.innerHTML = '<span>Generate notes first</span>';
        setTimeout(() => { pdfBtn.innerHTML = defaultBtnHtml; }, 2200);
      }
      return;
    }

    if (pdfBtn) { pdfBtn.innerHTML = '<span>Preparing PDF…</span>'; }

    const vId = currentVideoId || getVideoId();
    const title = `RecallAI — ${currentLevel.toUpperCase()} Notes (${currentLang.toUpperCase()})`;
    const renderedHtml = renderMarkdown(text, vId, capturedKeyframes);

    const printWin = window.open('', '_blank');
    if (!printWin) {
      if (pdfBtn) { pdfBtn.innerHTML = defaultBtnHtml; }
      alert('Please allow popups to download or save as PDF.');
      return;
    }


    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Kalam:wght@300;400;700&family=Noto+Sans+Devanagari:wght@400;600;700&display=swap" rel="stylesheet">
  <script>
    window.MathJax = {
      tex: { inlineMath: [['$','$'],['\\\\(','\\\\)']], displayMath: [['$$','$$'],['\\\\[','\\\\]']] }
    };
  </script>
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  <style>
    @page { margin: 18mm; size: A4 portrait; }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: 'Kalam', 'Noto Sans Devanagari', cursive, sans-serif;
      font-size: 15px;
      line-height: 1.9;
      color: #0f172a;
      background: #fff;
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

    /* Code Blocks */
    .rc-code-container {
      background: #0f172a;
      border-radius: 8px;
      margin: 14px 0;
      overflow: hidden;
      border: 1px solid #334155;
      page-break-inside: avoid;
    }
    .rc-code-header {
      background: #1e293b;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 600;
      padding: 6px 14px;
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #334155;
      font-family: 'Inter', sans-serif;
    }
    .rc-code-copy-btn { display: none; }
    .rc-code-pre {
      margin: 0;
      padding: 12px 14px;
      color: #f8fafc;
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.55;
      overflow-x: auto;
    }
    .rc-inline-code {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      background: #f1f5f9;
      color: #0369a1;
      padding: 2px 6px;
      border-radius: 4px;
    }

    /* Diagram & ASCII Boxes */
    .rc-diagram-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      margin: 14px 0;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .rc-diagram-box-header {
      background: #e2e8f0;
      color: #334155;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 12px;
      font-family: 'Inter', sans-serif;
    }
    .rc-ascii-art {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      line-height: 1.4;
      padding: 12px;
      margin: 0;
      color: #1e293b;
      overflow-x: auto;
    }

    /* Figures & Keyframe Visuals */
    .rc-figure-card {
      margin: 16px 0;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .rc-figure-badge {
      background: #eff6ff;
      color: #1d4ed8;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 12px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-family: 'Inter', sans-serif;
      border-bottom: 1px solid #e2e8f0;
    }
    .rc-figure-img {
      width: 100%;
      max-height: 380px;
      object-fit: contain;
      background: #000;
      display: block;
    }
    .rc-figure-caption {
      padding: 8px 14px;
      font-size: 12px;
      color: #475569;
      font-style: italic;
      border-top: 1px solid #e2e8f0;
      background: #fff;
    }

    /* SVG Cards */
    .rc-svg-card {
      margin: 16px 0;
      background: #fff;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .rc-svg-header {
      background: #eff6ff;
      color: #1e40af;
      font-size: 11px;
      font-weight: 700;
      padding: 6px 12px;
      font-family: 'Inter', sans-serif;
    }
    .rc-svg-viewport {
      padding: 14px;
      display: flex;
      justify-content: center;
      background: #f8fafc;
    }

    /* Callout Cards */
    .rc-callout {
      display: flex;
      gap: 12px;
      padding: 12px 16px;
      margin: 14px 0;
      border-radius: 8px;
      page-break-inside: avoid;
    }
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

    .rc-timestamp { display: none; }
    @media print {
      body { padding: 0; background: transparent; }
    }
  </style>
</head>
<body>
  ${renderedHtml}
  <script>
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 700);
    });
  </script>
</body>
</html>`);
    printWin.document.close();
    setTimeout(() => { if (pdfBtn) pdfBtn.innerHTML = defaultBtnHtml; }, 1000);
  }

  // =============================================================
  // AWS DYNAMODB CLOUD SAVING (IN-EXTENSION)
  // =============================================================

  async function saveActiveNotesToAws() {
    const rawNote = cachedNotes[currentLevel]?.[currentLang];
    if (!rawNote || !rawNote.trim()) {
      showRcToast('Please generate notes first before saving to AWS.', 'error');
      return;
    }

    const vId = getVideoId() || currentVideoId || 'unknown_video';
    const vTitle = getYouTubeTitle() || 'YouTube Lecture';
    const vChannel = getYouTubeChannel() || '';

    const btn = document.getElementById('rc-cloud-save-btn');
    const footerBtn = document.getElementById('rc-cloud-save-footer-btn');
    const origBtnHtml = btn ? btn.innerHTML : '';
    const origFooterHtml = footerBtn ? footerBtn.innerHTML : '';

    if (btn) btn.innerHTML = '⏳ Saving...';
    if (footerBtn) footerBtn.innerHTML = '<span>⏳ Saving...</span>';

    try {
      chrome.runtime.sendMessage({
        action: 'SAVE_NOTE_TO_AWS',
        payload: {
          video_id: vId,
          video_title: vTitle,
          channel_name: vChannel,
          level: currentLevel,
          language: currentLang,
          markdown: rawNote
        }
      }, (res) => {
        if (btn) btn.innerHTML = origBtnHtml;
        if (footerBtn) footerBtn.innerHTML = origFooterHtml;

        if (res && (res.ok || res.success)) {
          const chunkCount = res.chunks_saved || res.saved_chunks || 0;
          showRcToast(`Saved to AWS DynamoDB! (${chunkCount} topics indexed)`, 'success');
        } else {
          showRcToast(`AWS Save failed: ${res?.error || 'Unknown error'}`, 'error');
        }
      });
    } catch (err) {
      if (btn) btn.innerHTML = origBtnHtml;
      if (footerBtn) footerBtn.innerHTML = origFooterHtml;
      showRcToast(`Error saving to AWS: ${err.message}`, 'error');
    }
  }

  function showRcToast(message, type = 'info') {
    let toast = document.getElementById('rc-toast-notice');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rc-toast-notice';
      toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        padding: 10px 16px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12.5px;
        font-weight: 500;
        box-shadow: 0 8px 24px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: opacity 0.25s ease, transform 0.25s ease;
        opacity: 0;
        transform: translateY(10px);
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }

    if (type === 'success') {
      toast.style.background = '#064e3b';
      toast.style.color = '#34d399';
      toast.style.border = '1px solid rgba(52, 211, 153, 0.4)';
    } else if (type === 'error') {
      toast.style.background = '#450a0a';
      toast.style.color = '#f87171';
      toast.style.border = '1px solid rgba(248, 113, 113, 0.4)';
    } else {
      toast.style.background = '#0f172a';
      toast.style.color = '#38bdf8';
      toast.style.border = '1px solid rgba(56, 189, 248, 0.4)';
    }

    toast.textContent = message;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
    }, 4000);
  }

  // Listen for messages from side panel and popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_VIDEO_STATE') {
      (async () => {
        const vId = getVideoId() || currentVideoId;
        const el = getMainVideoElement() || videoEl;
        if (el) videoEl = el;

        const vTitle = getYouTubeTitle();
        const vChannel = getYouTubeChannel();
        const vDesc = getYouTubeDescription();
        const chapters = Array.from(document.querySelectorAll('ytd-macro-markers-list-item-renderer'))
          .map(el => el.innerText?.trim()).filter(Boolean).join('\n');

        const live = isLiveVideo();
        const curTime = el ? (el.currentTime || 0) : 0;
        const dur = el ? (el.duration || 0) : 0;

        // If transcript not yet captured or forced, retrieve right now via bridge
        if ((!videoTranscript || videoTranscript.length === 0) || request.forceFetchTranscript) {
          try {
            await fetchYouTubeTranscript(vId);
          } catch (e) {}
        }

        const t = (videoTranscript && videoTranscript.length > 0) ? videoTranscript : liveCaptionsBuffer;

        const frame = captureCurrentFrame();
        if (frame && frame.base64) {
          const curSec = Math.floor(frame.timestamp);
          capturedKeyframes[curSec] = {
            timestamp: frame.timestamp,
            timeStr: formatTime(frame.timestamp),
            dataUrl: `data:image/jpeg;base64,${frame.base64}`
          };
        }

        const allFrames = Object.values(capturedKeyframes);
        const keyframes = allFrames.slice(-4).map(f => ({
          timestamp: f.timestamp,
          base64: f.dataUrl ? f.dataUrl.split(',')[1] : null
        })).filter(f => f.base64);

        sendResponse({
          ok: true,
          videoId: vId,
          title: vTitle,
          channel: vChannel,
          description: vDesc.slice(0, 3000),
          chapters: chapters,
          transcript: t,
          keyframes: keyframes,
          keyframesMap: capturedKeyframes,
          currentTime: curTime,
          duration: dur,
          isLive: live,
          isPaused: el ? el.paused : true,
          transcriptCount: t.length
        });
      })();
      return true;
    }

    if (request.action === 'SEEK_VIDEO') {
      if (videoEl && typeof request.seconds === 'number') {
        videoEl.currentTime = request.seconds;
        videoEl.play();
        sendResponse({ ok: true });
      } else {
        sendResponse({ ok: false });
      }
      return true;
    }

    if (request.action === 'TOGGLE_LIVE_MODE') {
      if (typeof request.enable === 'boolean') {
        if (request.enable && !isLiveMode) toggleLiveMode();
        else if (!request.enable && isLiveMode) toggleLiveMode();
      }
      sendResponse({ ok: true, isLiveMode });
      return true;
    }
  });

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
