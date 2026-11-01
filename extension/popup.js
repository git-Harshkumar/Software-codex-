// RecallAI Popup Logic — with First-Run Onboarding

document.addEventListener('DOMContentLoaded', async () => {
  const viewOnboarding = document.getElementById('view-onboarding');
  const viewMain       = document.getElementById('view-main');

  // ── Onboarding Elements ──────────────────────────────────────
  const onboardKeyInput  = document.getElementById('onboard-api-key');
  const onboardSaveBtn   = document.getElementById('onboard-save-btn');
  const onboardStatus    = document.getElementById('onboard-key-status');
  const onboardShowBtn   = document.getElementById('onboard-show-key-btn');

  // ── Main View Elements ───────────────────────────────────────
  const keyBadge         = document.getElementById('key-badge');
  const changeKeyBtn     = document.getElementById('change-key-btn');
  const keyEditArea      = document.getElementById('key-edit-area');
  const keyInput         = document.getElementById('api-key');
  const saveKeyBtn       = document.getElementById('save-key-btn');
  const keyStatus        = document.getElementById('key-status');
  const tabStatus        = document.getElementById('tab-status');
  const openSidebarBtn   = document.getElementById('open-sidebar-btn');
  const openSidepanelBtn = document.getElementById('open-sidepanel-btn');
  const openStudioBtn    = document.getElementById('open-studio-btn');
  const usageCard        = document.getElementById('usage-card');
  const usageModel       = document.getElementById('usage-model');
  const usageStatus      = document.getElementById('usage-status');

  // ── Helpers ──────────────────────────────────────────────────
  function showView(name) {
    viewOnboarding.classList.add('hidden');
    viewMain.classList.add('hidden');
    if (name === 'onboarding') viewOnboarding.classList.remove('hidden');
    if (name === 'main')       viewMain.classList.remove('hidden');
  }

  function setKeyBadge(hasKey, error) {
    if (error) {
      keyBadge.textContent = 'Key Error';
      keyBadge.className = 'badge error';
    } else if (hasKey) {
      keyBadge.textContent = 'Active';
      keyBadge.className = 'badge active';
    } else {
      keyBadge.textContent = 'No Key';
      keyBadge.className = 'badge missing';
    }
  }

  // Toggle password visibility in onboarding
  if (onboardShowBtn) {
    onboardShowBtn.addEventListener('click', () => {
      const isPass = onboardKeyInput.type === 'password';
      onboardKeyInput.type = isPass ? 'text' : 'password';
      onboardShowBtn.textContent = isPass ? 'Show' : 'Hide';
    });
  }

  // ── Check if API key exists on load ──────────────────────────
  chrome.storage.local.get(['gemini_api_key', 'last_verified_model'], async (res) => {
    if (res.gemini_api_key) {
      // Key exists → show main view
      showView('main');
      setKeyBadge(true);
      keyInput.value = res.gemini_api_key;

      // Show usage card with info
      usageCard.classList.remove('hidden');
      if (res.last_verified_model) {
        usageModel.textContent = res.last_verified_model;
      }

      // Check active tab
      checkActiveTab();
    } else {
      // No key → show onboarding
      showView('onboarding');
    }
  });

  // ── Active Tab Check ─────────────────────────────────────────
  async function getLiveYouTubeMetadata(tabId) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const video = document.querySelector('#movie_player video.html5-main-video')
            || document.querySelector('#movie_player video')
            || document.querySelector('video');
          const player = document.getElementById('movie_player');
          const title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim()
            || document.title.replace(' - YouTube', '').trim();
          const channel = document.querySelector('#owner-name a')?.textContent?.trim()
            || document.querySelector('#owner-name yt-formatted-string')?.textContent?.trim()
            || document.querySelector('#upload-info #channel-name a')?.textContent?.trim()
            || document.querySelector('ytd-watch-metadata #channel-name')?.textContent?.trim()
            || document.querySelector('meta[itemprop="author"]')?.getAttribute('content')?.trim()
            || player?.getPlayerResponse?.()?.videoDetails?.author?.trim()
            || '';
          const currentTime = Number.isFinite(video?.currentTime)
            ? video.currentTime
            : Number(player?.getCurrentTime?.()) || 0;
          const duration = Number.isFinite(video?.duration) && video.duration > 0
            ? video.duration
            : Number(player?.getDuration?.())
              || Number(player?.getPlayerResponse?.()?.videoDetails?.lengthSeconds)
              || 0;
          return { title, channel, currentTime, duration };
        }
      });
      return results?.[0]?.result || {};
    } catch (error) {
      console.warn('[RecallAI Popup] Direct YouTube metadata lookup failed:', error);
      return {};
    }
  }

  async function checkActiveTab() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isYouTube = tab && tab.url && (
        tab.url.includes('youtube.com/watch') ||
        tab.url.includes('youtube.com/live/') ||
        tab.url.includes('youtube.com/shorts/')
      );

      if (isYouTube) {
        const cleanTitle = (tab.title || '').replace(' - YouTube', '').trim();
        tabStatus.innerHTML = `<b>YouTube Video Detected</b><br><span style="font-size:11px;font-weight:600;color:var(--text);">${cleanTitle}</span>`;
        tabStatus.style.borderColor = 'rgba(52,211,153,0.3)';
        openSidebarBtn.style.display = 'flex';

        // Try getting real-time channel name & title
        chrome.tabs.sendMessage(tab.id, { action: 'GET_VIDEO_STATE' }, async resp => {
          chrome.storage.local.get(['rc_video_channel', 'rc_video_title'], stored => {
            getLiveYouTubeMetadata(tab.id).then(live => {
            if (chrome.runtime.lastError || !resp || !resp.ok) {
              const storedChannel = stored?.rc_video_channel || '';
              const channel = live.channel || storedChannel;
              const timing = `${formatTime(live.currentTime)} / ${formatTime(live.duration)}`;
              tabStatus.innerHTML = `<b>YouTube Video Detected</b><br><span style="font-size:11px;font-weight:600;color:var(--text);">${live.title || stored?.rc_video_title || cleanTitle}</span>${channel ? `<br><span style="display:inline-block;margin-top:3px;font-size:10px;color:var(--cyan);">${channel}</span>` : ''}<br><span style="font-size:10px;color:var(--muted);font-family:monospace;">${timing}</span>`;
              return;
            }
            const displayTitle = live.title || resp.title || stored?.rc_video_title || cleanTitle;
            const channel = live.channel || resp.channel || stored?.rc_video_channel || '';
            const currentTime = live.currentTime || resp.currentTime;
            const duration = live.duration || resp.duration;
            const timing = resp.isLive ? 'LIVE' : `${formatTime(currentTime)} / ${formatTime(duration)}`;
            const channelBadge = channel ? `<span style="display:inline-block;margin-top:3px;font-size:10px;color:var(--cyan);background:rgba(56,189,248,0.12);padding:1px 5px;border-radius:3px;">${channel}</span>` : '<span style="display:inline-block;margin-top:3px;font-size:10px;color:var(--muted);">Detecting channel...</span>';
            tabStatus.innerHTML = `<b>YouTube Video Detected</b><br><span style="font-size:11px;font-weight:600;color:var(--text);">${displayTitle}</span><br>${channelBadge}<br><span style="font-size:10px;color:var(--muted);font-family:monospace;">${timing}</span>`;
            });
          });
        });
      } else {
        tabStatus.innerHTML = `Open any <b>YouTube video</b> to generate parallel lecture notes.`;
        tabStatus.style.borderColor = '';
      }

      function formatTime(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const minutes = Math.floor(total / 60);
        const secs = total % 60;
        return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
      }
    } catch (e) {
      tabStatus.textContent = 'Could not detect tab.';
    }
  }

  // ── Onboarding: Verify & Save ─────────────────────────────────
  async function verifyAndSaveKey(apiKey, saveBtn, statusEl) {
    if (!apiKey) {
      statusEl.textContent = 'Please enter your API key.';
      statusEl.className = 'status-msg error';
      return;
    }

    // Optimistic save first
    await chrome.storage.local.set({ gemini_api_key: apiKey });

    // Show loading state
    const origContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<span class="spinner"></span> Verifying…';
    saveBtn.disabled = true;
    statusEl.textContent = 'Connecting to Gemini API…';
    statusEl.className = 'status-msg loading';

    chrome.runtime.sendMessage({ action: 'TEST_GEMINI_KEY', apiKey }, async (res) => {
      saveBtn.innerHTML = origContent;
      saveBtn.disabled = false;

      if (chrome.runtime.lastError || !res) {
        // Key saved even if verification couldn't reach background
        statusEl.textContent = 'Key saved locally. (Reload extension if needed)';
        statusEl.className = 'status-msg success';
        setTimeout(() => {
          showView('main');
          setKeyBadge(true);
          keyInput.value = apiKey;
          usageCard.classList.remove('hidden');
          checkActiveTab();
        }, 1200);
        return;
      }

      if (res.ok) {
        // Save model info
        if (res.modelUsed) {
          await chrome.storage.local.set({ last_verified_model: res.modelUsed });
          usageModel.textContent = res.modelUsed;
        }
        statusEl.textContent = `Key verified. Using ${res.modelUsed || 'Gemini Flash'}`;
        statusEl.className = 'status-msg success';
        setTimeout(() => {
          showView('main');
          setKeyBadge(true);
          keyInput.value = apiKey;
          usageCard.classList.remove('hidden');
          usageStatus.textContent = 'Ready';
          usageStatus.className = 'usage-val usage-ok';
          checkActiveTab();
        }, 1000);
      } else {
        statusEl.textContent = `Invalid key: ${res.error || 'Authentication failed'}. Please check and try again.`;
        statusEl.className = 'status-msg error';
        usageStatus.textContent = 'Auth Failed';
        usageStatus.className = 'usage-val';
        // Remove bad key from storage
        await chrome.storage.local.remove('gemini_api_key');
      }
    });
  }

  onboardSaveBtn?.addEventListener('click', () => {
    const key = onboardKeyInput.value.trim();
    verifyAndSaveKey(key, onboardSaveBtn, onboardStatus);
  });

  onboardKeyInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') onboardSaveBtn.click();
  });

  // ── Main View: Change Key ─────────────────────────────────────
  changeKeyBtn?.addEventListener('click', () => {
    keyEditArea.classList.toggle('hidden');
    if (!keyEditArea.classList.contains('hidden')) {
      keyInput.focus();
      changeKeyBtn.textContent = 'Cancel';
    } else {
      changeKeyBtn.textContent = 'Change';
    }
  });

  saveKeyBtn?.addEventListener('click', () => {
    const key = keyInput.value.trim();
    verifyAndSaveKey(key, saveKeyBtn, keyStatus);
  });

  keyInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') saveKeyBtn.click();
  });

  // ── Open Sidebar on YouTube ───────────────────────────────────
  openSidebarBtn?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      const isYouTube = tab.url && (
        tab.url.includes('youtube.com/watch') ||
        tab.url.includes('youtube.com/live/') ||
        tab.url.includes('youtube.com/shorts/')
      );

      if (isYouTube) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const sidebar = document.getElementById('recall-ai-sidebar');
            if (sidebar) sidebar.classList.add('open');
          }
        });
        window.close();
      } else {
        chrome.tabs.create({ url: 'https://www.youtube.com' });
        window.close();
      }
    } catch (e) {
      console.warn('[RecallAI Popup] Sidebar open failed:', e);
    }
  });

  // ── Open Native Side Panel ────────────────────────────────────
  openSidepanelBtn?.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      }
    } catch (e) {
      console.warn('[RecallAI Popup] Side panel open failed:', e);
    }
  });

  openStudioBtn?.addEventListener('click', async () => {
    try {
      const stored = await chrome.storage.local.get(['rc_studio_data', 'rc_print_data']);
      const data = stored.rc_studio_data || stored.rc_print_data;
      if (!data?.markdown) {
        openStudioBtn.textContent = 'Generate notes first';
        setTimeout(() => { openStudioBtn.innerHTML = '<span>Open Notes Studio</span>'; }, 2000);
        return;
      }
      chrome.runtime.sendMessage({ action: 'OPEN_STUDIO_PAGE', data }, () => window.close());
    } catch (e) {
      console.warn('[RecallAI Popup] Studio open failed:', e);
    }
  });

  // ── AWS Backend Configuration ────────────────────────────────
  const changeBackendBtn = document.getElementById('change-backend-btn');
  const backendEditArea = document.getElementById('backend-edit-area');
  const backendInput = document.getElementById('aws-backend-input');
  const saveBackendBtn = document.getElementById('save-backend-btn');
  const backendStatusMsg = document.getElementById('backend-status-msg');

  chrome.storage.local.get(['aws_backend_url'], res => {
    if (backendInput) backendInput.value = res.aws_backend_url || 'http://100.58.169.40';
  });

  changeBackendBtn?.addEventListener('click', () => {
    backendEditArea?.classList.toggle('hidden');
  });

  saveBackendBtn?.addEventListener('click', async () => {
    const urlVal = backendInput?.value?.trim() || 'http://100.58.169.40';
    await chrome.storage.local.set({ aws_backend_url: urlVal });
    if (backendStatusMsg) {
      backendStatusMsg.textContent = 'Saved! Pointing to: ' + urlVal;
      backendStatusMsg.style.color = 'var(--emerald)';
      setTimeout(() => {
        backendStatusMsg.textContent = 'Cloud Server: ' + urlVal;
        backendStatusMsg.style.color = 'var(--muted)';
        backendEditArea?.classList.add('hidden');
      }, 1800);
    }
  });
});
