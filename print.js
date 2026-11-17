// RecallAI Extension Print & PDF Generator

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('rc-print-doc-container');
  const titleEl   = document.getElementById('rc-pbar-title');
  const printBtn  = document.getElementById('rc-print-btn');
  const closeBtn  = document.getElementById('rc-close-btn');

  const openStudioBtn = document.getElementById('rc-open-studio-btn');

  openStudioBtn?.addEventListener('click', () => {
    window.location.href = chrome.runtime.getURL('studio.html');
  });

  printBtn?.addEventListener('click', () => {
    window.print();
  });

  closeBtn?.addEventListener('click', () => {
    window.close();
  });

  // Read the saved notes data
  chrome.storage.local.get(['rc_print_data'], (res) => {
    const data = res?.rc_print_data;
    if (!data || !data.html) {
      if (container) {
        container.innerHTML = `
          <div style="text-align:center;padding:60px 20px;font-family:'Inter',sans-serif;color:#334155;">
            <h2 style="border:none;background:transparent;color:#1e3a8a;">No Notes Found</h2>
            <p style="color:#64748b;">Please generate notes first in the RecallAI companion, then click "Download Notes".</p>
          </div>`;
      }
      return;
    }

    const title = data.title || 'RecallAI_Lecture_Notes';
    document.title = title;
    if (titleEl) {
      titleEl.textContent = title;
    }

    if (container) {
      container.innerHTML = data.html;
    }

    // Re-run MathJax typesetting if present
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([container]).catch(err => console.warn('MathJax error:', err));
    }

    // Automatically trigger print dialog
    setTimeout(() => {
      window.print();
    }, 600);
  });
});
