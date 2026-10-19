/* ═══════════════════════════════════════════════════════════════════════════
   RecallAI Notes Studio — Scope 2 Educational Platform
   Notion • Obsidian • Google Docs • Digital Whiteboard
   ═══════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  // ── State Variables ───────────────────────────────────────────────────────
  let docTitle = 'Machine Learning: Gradient Descent & Optimization';
  let videoId = 'ML-Lecture-01';
  let noteLevel = 'detailed';
  let noteLang = 'english';
  let sections = [];
  let isDarkMode = true;
  let activeEditingDiagramId = null;

  // DOM Elements
  const docTitleInput      = document.getElementById('doc-title-input');
  const docHeading         = document.getElementById('doc-heading');
  const docSubtitle        = document.getElementById('doc-subtitle');
  const sectionsContainer  = document.getElementById('sections-container');
  const outlineList        = document.getElementById('outline-list');
  const highlightsContainer= document.getElementById('highlights-container');
  const sketchesContainer  = document.getElementById('sketches-container');
  const countHighlightsEl  = document.getElementById('count-highlights');
  const countSketchesEl    = document.getElementById('count-sketches');
  const saveStatusText     = document.getElementById('save-status-text');
  const saveStatusPill     = document.getElementById('save-status-pill');
  const floatingToolbar    = document.getElementById('floating-toolbar');
  const toastEl            = document.getElementById('studio-toast');
  const toastText          = document.getElementById('toast-text');
  const toastIcon          = document.getElementById('toast-icon');

  // Modals
  const wbModal            = document.getElementById('whiteboard-modal');
  const shareModal         = document.getElementById('share-modal');

  // Canvas
  const wbCanvas           = document.getElementById('wb-drawing-canvas');
  const wbContainer        = document.getElementById('wb-canvas-container');
  let wbCtx                = null;
  let isDrawing            = false;
  let currentTool          = 'pen';
  let currentColor         = '#0f172a';
  let currentStrokeSize    = 3;
  let startX = 0, startY = 0;
  let canvasHistory        = [];
  let historyStep          = -1;
  let snapshotImgData      = null;

  // ── Default Machine Learning Lecture Data (Scope 2 Requirement) ───────────
  function getDefaultMLSections() {
    return [
      {
        id: 'sec-def',
        type: 'definition',
        title: 'Core Machine Learning Definitions',
        content: `
          <div class="def-item-card">
            <div class="def-term-header">📘 Supervised Learning</div>
            <p>A machine learning paradigm where an algorithm learns a mapping function from input variables ($X$) to output targets ($y$) using labeled training pairs: $\\mathcal{D} = \\{(x^{(1)}, y^{(1)}), \\dots, (x^{(m)}, y^{(m)})\\}$.</p>
          </div>
          <div class="def-item-card">
            <div class="def-term-header">🎯 Cost Function (Loss Function) $J(\\theta)$</div>
            <p>A scalar mathematical metric quantifying how far predictions $h_\\theta(x)$ deviate from actual ground-truth targets $y$. Minimizing $J(\\theta)$ is the primary objective of model training.</p>
          </div>
          <div class="def-item-card">
            <div class="def-term-header">⚡ Learning Rate ($\\alpha$)</div>
            <p>A positive hyperparameter that governs the magnitude of parameter steps taken in the opposite direction of the gradient at each training iteration.</p>
          </div>
        `
      },
      {
        id: 'sec-explain',
        type: 'explanation',
        title: 'Conceptual Explanations & Intuition',
        content: `
          <p>Imagine standing on a foggy hillside blindfolded. Your goal is to reach the lowest point in the valley. At each step, you feel the slope of the terrain under your feet and take a step in the direction of steepest descent.</p>
          <div class="callout-box callout-tip">
            <span class="callout-icon">💡</span>
            <div><b>Intuitive Rule:</b> If the learning rate $\\alpha$ is too small, convergence takes millions of tiny steps. If $\\alpha$ is too large, gradient descent may oscillate or diverge completely!</div>
          </div>
          <p>For convex loss surfaces (such as Linear Regression with Mean Squared Error), gradient descent is mathematically guaranteed to reach the global minimum.</p>
        `
      },
      {
        id: 'sec-formula',
        type: 'formula',
        title: 'Key Mathematical Formulas & Derivations',
        content: `
          <div class="formula-box">
            <div style="font-weight:700;color:#fbbf24;font-size:13px;text-transform:uppercase;">Mean Squared Error Cost Function:</div>
            <div class="formula-display">$$J(\\theta) = \\frac{1}{2m} \\sum_{i=1}^m \\left(h_\\theta(x^{(i)}) - y^{(i)}\\right)^2$$</div>
            <div class="formula-params-list">
              &bull; <b>$m$</b>: Number of training examples &bull; <b>$h_\\theta(x)$</b>: Hypothesis $\\theta_0 + \\theta_1 x$ &bull; <b>$y$</b>: Target label
            </div>
          </div>
          <div class="formula-box">
            <div style="font-weight:700;color:#fbbf24;font-size:13px;text-transform:uppercase;">Simultaneous Parameter Update Rule:</div>
            <div class="formula-display">$$\\theta_j := \\theta_j - \\alpha \\frac{\\partial}{\\partial \\theta_j} J(\\theta)$$</div>
            <div class="formula-display">$$\\theta_j := \\theta_j - \\alpha \\frac{1}{m} \\sum_{i=1}^m \\left(h_\\theta(x^{(i)}) - y^{(i)}\\right) x_j^{(i)}$$</div>
          </div>
        `
      },
      {
        id: 'sec-diagram',
        type: 'whiteboard',
        title: 'Handwritten Diagram: Loss Surface & Gradient Steps',
        content: `
          <div class="diagram-embed-card" id="diagram-card-sec-diagram">
            <div class="diagram-embed-header">
              <div class="diagram-embed-title">
                <span>🎨 Handwritten Sketch: Gradient Descent Bowl Landscape</span>
              </div>
              <div class="diagram-embed-actions">
                <button class="btn btn-secondary btn-edit-sketch" data-sec-id="sec-diagram" style="padding:4px 10px;font-size:11px;">✏️ Edit in Whiteboard</button>
              </div>
            </div>
            <div class="diagram-embed-canvas-wrap">
              <img src="" class="diagram-embed-img" id="img-sec-diagram" alt="Handwritten Diagram" />
            </div>
            <div class="diagram-embed-caption">
              Student Diagram: Demonstrating contour lines of convex cost bowl $J(\\theta_0, \\theta_1)$ and orthogonal gradient update trajectory converging to minimum $\\theta^*$.
            </div>
          </div>
        `,
        sketchDataUrl: null // populated below with vector canvas generator
      },
      {
        id: 'sec-example',
        type: 'example',
        title: 'Practical Numerical Example & Python Code',
        content: `
          <p><b>Step-by-step update:</b> Given initial weights $\\theta = 0$, dataset $x=1, y=2$, and $\\alpha = 0.1$:</p>
          <div class="code-box">
            <div class="code-box-header">
              <span>python // numpy_gradient_descent.py</span>
              <button style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:11px;" onclick="navigator.clipboard.writeText(this.parentElement.nextElementSibling.innerText);alert('Code copied!');">Copy</button>
            </div>
            <pre class="code-pre"><code>import numpy as np

def gradient_descent(X, y, alpha=0.01, iterations=1000):
    m = len(y)
    theta = np.zeros(X.shape[1])
    
    for i in range(iterations):
        predictions = X.dot(theta)
        errors = predictions - y
        gradient = (1/m) * X.T.dot(errors)
        theta -= alpha * gradient
        
    return theta</code></pre>
          </div>
        `
      },
      {
        id: 'sec-summary',
        type: 'summary',
        title: 'Comprehensive Summary & Exam Key Takeaways',
        content: `
          <ul style="list-style-type: none; margin: 0; padding: 0;">
            <li style="margin-bottom:8px;">✅ <b>Always feature scale</b> (Z-score normalization) before running gradient descent so contour circles are spherical rather than elliptical.</li>
            <li style="margin-bottom:8px;">✅ <b>Simultaneous updates:</b> Always compute gradients for all parameters $\\theta_0, \\dots, \\theta_n$ simultaneously before updating.</li>
            <li style="margin-bottom:8px;">✅ <b>Learning curve diagnosis:</b> Plot $J(\\theta)$ vs. iteration number. If cost increases, immediately decrease learning rate $\\alpha$.</li>
          </ul>
        `
      }
    ];
  }

  // Generate an authentic default handwritten sketch for Machine Learning
  function createDefaultMLSketch() {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 800;
    tempCanvas.height = 360;
    const ctx = tempCanvas.getContext('2d');

    // Background paper
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // Subtle grid dots
    ctx.fillStyle = '#e2e8f0';
    for (let x = 20; x < 800; x += 30) {
      for (let y = 20; y < 360; y += 30) {
        ctx.fillRect(x, y, 2, 2);
      }
    }

    // Hand-drawn Axes
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80, 40);
    ctx.lineTo(80, 300);
    ctx.lineTo(740, 300);
    ctx.stroke();

    // Axis Labels
    ctx.font = 'bold 16px "Kalam", cursive, sans-serif';
    ctx.fillStyle = '#1e3a8a';
    ctx.fillText('Cost J(θ)', 40, 35);
    ctx.fillText('Parameter θ (Weights) →', 560, 330);

    // Parabolic Loss Curve
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(120, 70);
    ctx.bezierCurveTo(240, 290, 480, 290, 680, 70);
    ctx.stroke();

    // Gradient descent step points & arrows
    const steps = [
      { x: 160, y: 130 },
      { x: 230, y: 210 },
      { x: 300, y: 260 },
      { x: 360, y: 282 },
      { x: 400, y: 288 }
    ];

    ctx.strokeStyle = '#dc2626';
    ctx.fillStyle = '#dc2626';
    ctx.lineWidth = 2.5;

    for (let i = 0; i < steps.length; i++) {
      ctx.beginPath();
      ctx.arc(steps[i].x, steps[i].y, 6, 0, Math.PI * 2);
      ctx.fill();

      if (i < steps.length - 1) {
        ctx.beginPath();
        ctx.moveTo(steps[i].x, steps[i].y);
        ctx.lineTo(steps[i+1].x, steps[i+1].y);
        ctx.stroke();
      }
    }

    // Annotations in handwritten font
    ctx.font = 'bold 15px "Kalam", cursive, sans-serif';
    ctx.fillStyle = '#dc2626';
    ctx.fillText('Start: Initial θ₀', 175, 125);
    ctx.fillText('Step 1 (Slope < 0)', 245, 195);
    ctx.fillText('Step 2: Steps shrink as slope decreases', 320, 245);

    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(400, 288, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText('★ Global Minimum J(θ*)', 415, 305);

    return tempCanvas.toDataURL('image/png');
  }

  // ── Initialize Notes Data ────────────────────────────────────────────────
  function initNotes() {
    chrome.storage.local.get(['rc_studio_data', 'rc_print_data'], (res) => {
      const data = res?.rc_studio_data || res?.rc_print_data;

      if (data && data.markdown) {
        parseMarkdownIntoSections(data);
      } else if (data && data.sections && data.sections.length > 0) {
        sections = data.sections;
        if (data.title) docTitle = data.title;
        renderAll();
      } else {
        // Load default Machine Learning Lecture Note (Scope 2 prompt)
        const defaultSketch = createDefaultMLSketch();
        sections = getDefaultMLSections();
        const diagramSec = sections.find(s => s.type === 'whiteboard');
        if (diagramSec) diagramSec.sketchDataUrl = defaultSketch;

        renderAll();
      }
    });
  }

  // Parse Raw Markdown/HTML into Notion-style Blocks
  function parseMarkdownIntoSections(data) {
    if (data.title) {
      docTitle = data.title;
      docHeading.textContent = data.title;
      docTitleInput.value = data.title;
    }
    if (data.videoId) videoId = data.videoId;
    if (data.level) noteLevel = data.level;
    if (data.lang) noteLang = data.lang;

    const md = data.markdown || '';
    const lines = md.split('\n');
    let currentSec = null;
    sections = [];

    // Simple robust markdown parser to create sections
    for (let line of lines) {
      if (line.startsWith('## ') || line.startsWith('# ')) {
        if (currentSec) sections.push(currentSec);
        const headingText = line.replace(/^#+\s*/, '').trim();
        let type = 'explanation';
        if (/definition/i.test(headingText)) type = 'definition';
        else if (/formula|equation|math/i.test(headingText)) type = 'formula';
        else if (/example|code|implementation/i.test(headingText)) type = 'example';
        else if (/summary|takeaway|conclusion/i.test(headingText)) type = 'summary';

        currentSec = {
          id: 'sec-' + Math.random().toString(36).substring(2, 9),
          type: type,
          title: headingText,
          content: ''
        };
      } else if (currentSec) {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          currentSec.content += `<li>${line.trim().substring(2)}</li>`;
        } else if (line.trim().length > 0) {
          currentSec.content += `<p>${line}</p>`;
        }
      }
    }
    if (currentSec) sections.push(currentSec);

    // If no sections were produced, fall back to default ML notes
    if (sections.length === 0) {
      sections = getDefaultMLSections();
      const defaultSketch = createDefaultMLSketch();
      const diagramSec = sections.find(s => s.type === 'whiteboard');
      if (diagramSec) diagramSec.sketchDataUrl = defaultSketch;
    }

    renderAll();
    saveToStorage();
  }

  // ── Render All Sections & Outline ─────────────────────────────────────────
  function renderAll() {
    docTitleInput.value = docTitle;
    docHeading.textContent = docTitle;

    document.getElementById('meta-video-id').textContent = videoId || 'ML-Lecture-01';
    document.getElementById('chip-level').textContent = `LEVEL: ${noteLevel.toUpperCase()}`;
    document.getElementById('chip-lang').textContent = `LANG: ${noteLang.toUpperCase()}`;

    renderSections();
    renderOutline();
    renderHighlightsSummary();
    renderSketchesGallery();

    // Re-render MathJax
    if (window.MathJax && window.MathJax.typesetPromise) {
      window.MathJax.typesetPromise([sectionsContainer]).catch(err => console.warn('MathJax error:', err));
    }
  }

  // Render Notion-style Draggable Block Cards
  function renderSections() {
    sectionsContainer.innerHTML = '';

    sections.forEach((sec, idx) => {
      const card = document.createElement('div');
      card.className = 'section-block';
      card.id = `block-${sec.id}`;
      card.setAttribute('draggable', 'true');
      card.dataset.id = sec.id;
      card.dataset.index = idx;

      const pillClass = `pill-${sec.type}`;

      card.innerHTML = `
        <div class="block-header">
          <div class="block-header-left">
            <span class="block-drag-handle" title="Drag to reorder section">⋮⋮</span>
            <button class="block-collapse-toggle" title="Collapse / Expand Section">▼</button>
            <span class="block-type-pill ${pillClass}">${sec.type}</span>
            <span class="block-title-text" contenteditable="true" spellcheck="false" title="Click to rename">${sec.title}</span>
          </div>
          <div class="block-actions">
            <button class="block-action-btn btn-move-up" title="Move Up (▲)">▲</button>
            <button class="block-action-btn btn-move-down" title="Move Down (▼)">▼</button>
            <button class="block-action-btn btn-add-sketch" title="Add Handwritten Diagram to this section">✏️</button>
            <button class="block-action-btn btn-duplicate" title="Duplicate Section">📑</button>
            <button class="block-action-btn btn-danger btn-delete" title="Delete Section">🗑️</button>
          </div>
        </div>
        <div class="block-body" contenteditable="true" spellcheck="false" data-id="${sec.id}">
          ${sec.content}
        </div>
      `;

      // If whiteboard diagram section, inject its canvas image
      if (sec.type === 'whiteboard' && sec.sketchDataUrl) {
        const imgEl = card.querySelector(`#img-${sec.id}`);
        if (imgEl) imgEl.src = sec.sketchDataUrl;
      }

      sectionsContainer.appendChild(card);
    });

    bindCardEvents();
  }

  // Bind Block Events: Drag-and-Drop, Move Up/Down, Edit, Delete, Collapse
  function bindCardEvents() {
    const cards = sectionsContainer.querySelectorAll('.section-block');

    cards.forEach(card => {
      // Drag & Drop
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('dragleave', handleDragLeave);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);

      // Collapse / Expand
      card.querySelector('.block-collapse-toggle')?.addEventListener('click', (e) => {
        e.stopPropagation();
        card.classList.toggle('collapsed');
      });

      // Move Up
      card.querySelector('.btn-move-up')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = card.dataset.id;
        const idx = sections.findIndex(s => s.id === id);
        if (idx > 0) {
          const temp = sections[idx];
          sections[idx] = sections[idx - 1];
          sections[idx - 1] = temp;
          renderAll();
          saveToStorage();
          showToast('Section moved up', '▲');
        }
      });

      // Move Down
      card.querySelector('.btn-move-down')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = card.dataset.id;
        const idx = sections.findIndex(s => s.id === id);
        if (idx < sections.length - 1) {
          const temp = sections[idx];
          sections[idx] = sections[idx + 1];
          sections[idx + 1] = temp;
          renderAll();
          saveToStorage();
          showToast('Section moved down', '▼');
        }
      });

      // Delete
      card.querySelector('.btn-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Delete this section?')) {
          const id = card.dataset.id;
          sections = sections.filter(s => s.id !== id);
          renderAll();
          saveToStorage();
          showToast('Section deleted', '🗑️');
        }
      });

      // Duplicate
      card.querySelector('.btn-duplicate')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = card.dataset.id;
        const target = sections.find(s => s.id === id);
        if (target) {
          const dup = JSON.parse(JSON.stringify(target));
          dup.id = 'sec-' + Math.random().toString(36).substring(2, 9);
          dup.title += ' (Copy)';
          const idx = sections.findIndex(s => s.id === id);
          sections.splice(idx + 1, 0, dup);
          renderAll();
          saveToStorage();
          showToast('Section duplicated', '📑');
        }
      });

      // Add Sketch to this Section
      card.querySelector('.btn-add-sketch')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openWhiteboardForSection(card.dataset.id);
      });

      // Edit Sketch inside whiteboard block
      card.querySelectorAll('.btn-edit-sketch').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const secId = btn.getAttribute('data-sec-id');
          openWhiteboardForSection(secId);
        });
      });

      // ContentEditable sync for Title
      const titleEl = card.querySelector('.block-title-text');
      titleEl?.addEventListener('blur', () => {
        const id = card.dataset.id;
        const sec = sections.find(s => s.id === id);
        if (sec) {
          sec.title = titleEl.textContent.trim();
          renderOutline();
          saveToStorage();
        }
      });

      // ContentEditable sync for Body
      const bodyEl = card.querySelector('.block-body');
      bodyEl?.addEventListener('input', debounce(() => {
        const id = card.dataset.id;
        const sec = sections.find(s => s.id === id);
        if (sec) {
          sec.content = bodyEl.innerHTML;
          saveToStorage();
          renderHighlightsSummary();
        }
      }, 500));
    });
  }

  // ── Drag and Drop Handlers (Notion Section Rearranging) ───────────────────
  let draggedCard = null;

  function handleDragStart(e) {
    draggedCard = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = this.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;

    if (e.clientY < midY) {
      this.classList.add('drag-over-top');
      this.classList.remove('drag-over-bottom');
    } else {
      this.classList.add('drag-over-bottom');
      this.classList.remove('drag-over-top');
    }
  }

  function handleDragLeave() {
    this.classList.remove('drag-over-top', 'drag-over-bottom');
  }

  function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over-top', 'drag-over-bottom');
    if (!draggedCard || draggedCard === this) return;

    const fromId = draggedCard.dataset.id;
    const toId = this.dataset.id;

    const fromIdx = sections.findIndex(s => s.id === fromId);
    const toIdx = sections.findIndex(s => s.id === toId);

    if (fromIdx !== -1 && toIdx !== -1) {
      const [movedSec] = sections.splice(fromIdx, 1);
      const rect = this.getBoundingClientRect();
      const insertIdx = (e.clientY < rect.top + rect.height / 2) ? toIdx : toIdx + 1;
      sections.splice(insertIdx > fromIdx ? insertIdx - 1 : insertIdx, 0, movedSec);

      renderAll();
      saveToStorage();
      showToast('Section rearranged!', '✨');
    }
  }

  function handleDragEnd() {
    this.classList.remove('dragging');
    document.querySelectorAll('.section-block').forEach(c => {
      c.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging');
    });
  }

  // ── Left Sidebar Outline (Obsidian Style) ─────────────────────────────────
  function renderOutline() {
    outlineList.innerHTML = '';

    sections.forEach((sec, idx) => {
      const li = document.createElement('li');
      li.className = 'outline-item';
      li.dataset.id = sec.id;

      li.innerHTML = `
        <div class="outline-item-left">
          <span class="outline-drag-grip">⋮⋮</span>
          <span>${sec.title || 'Untitled Section'}</span>
        </div>
        <span style="font-size:10px;color:var(--text-muted);">${idx + 1}</span>
      `;

      li.addEventListener('click', () => {
        document.querySelectorAll('.outline-item').forEach(el => el.classList.remove('active'));
        li.classList.add('active');
        const targetBlock = document.getElementById(`block-${sec.id}`);
        if (targetBlock) {
          targetBlock.scrollIntoView({ behavior: 'smooth', block: 'start' });
          targetBlock.style.transition = 'box-shadow 0.3s ease';
          targetBlock.style.boxShadow = '0 0 0 3px #3b82f6';
          setTimeout(() => { targetBlock.style.boxShadow = ''; }, 1200);
        }
      });

      outlineList.appendChild(li);
    });
  }

  // ── Quick Add Block Buttons ───────────────────────────────────────────────
  document.querySelectorAll('.add-block-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.getAttribute('data-type');
      addNewBlock(type);
    });
  });

  function addNewBlock(type) {
    const newId = 'sec-' + Math.random().toString(36).substring(2, 9);
    let title = 'New Section';
    let content = '<p>Click here to start writing your custom lecture notes...</p>';

    if (type === 'definition') {
      title = 'Key Definitions';
      content = `
        <div class="def-item-card">
          <div class="def-term-header">📘 Term / Concept Name</div>
          <p>Formal definition and core properties explained in clear student terms.</p>
        </div>
      `;
    } else if (type === 'formula') {
      title = 'Mathematical Formulations';
      content = `
        <div class="formula-box">
          <div style="font-weight:700;color:#fbbf24;">Equation:</div>
          <div class="formula-display">$$y = \\sigma(W^T x + b)$$</div>
          <div class="formula-params-list">&bull; Parameter definitions and derivations here.</div>
        </div>
      `;
    } else if (type === 'whiteboard') {
      title = 'Handwritten Diagram';
      content = `
        <div class="diagram-embed-card" id="diagram-card-${newId}">
          <div class="diagram-embed-header">
            <div class="diagram-embed-title"><span>🎨 Handwritten Sketch</span></div>
            <div class="diagram-embed-actions">
              <button class="btn btn-secondary btn-edit-sketch" data-sec-id="${newId}" style="padding:4px 10px;font-size:11px;">✏️ Draw on Whiteboard</button>
            </div>
          </div>
          <div class="diagram-embed-canvas-wrap">
            <img src="" class="diagram-embed-img" id="img-${newId}" alt="Diagram" />
          </div>
          <div class="diagram-embed-caption">Custom diagram caption...</div>
        </div>
      `;
    } else if (type === 'example') {
      title = 'Practical Example & Code';
      content = `
        <div class="code-box">
          <div class="code-box-header"><span>code snippet</span></div>
          <pre class="code-pre"><code># Enter code or calculation here</code></pre>
        </div>
      `;
    } else if (type === 'summary') {
      title = 'Key Takeaways & Checklist';
      content = `
        <ul>
          <li>✅ Important point 1</li>
          <li>✅ Common exam trap to avoid</li>
        </ul>
      `;
    }

    const newSec = { id: newId, type, title, content };
    sections.push(newSec);

    renderAll();
    saveToStorage();
    showToast(`Added new ${type} block!`, '➕');

    // Scroll to newly added block
    setTimeout(() => {
      const blockEl = document.getElementById(`block-${newId}`);
      blockEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  }

  // ── Floating Highlighter Toolbar (Obsidian / Google Docs Style) ───────────
  document.addEventListener('selectionchange', handleTextSelection);

  function handleTextSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim().length === 0) {
      floatingToolbar.style.display = 'none';
      return;
    }

    // Only show if selection is within the document workspace
    const range = sel.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const isInsideDoc = sectionsContainer.contains(commonAncestor.nodeType === 1 ? commonAncestor : commonAncestor.parentElement);

    if (!isInsideDoc) {
      floatingToolbar.style.display = 'none';
      return;
    }

    const rect = range.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      floatingToolbar.style.display = 'flex';
      floatingToolbar.style.top = `${rect.top + window.scrollY - 44}px`;
      floatingToolbar.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (floatingToolbar.offsetWidth / 2)}px`;
    }
  }

  // Floating Highlighter Swatches
  document.querySelectorAll('.hl-swatch').forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      const color = swatch.getAttribute('data-color');
      applyHighlight(color);
    });
  });

  function applyHighlight(color) {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const selectedText = sel.toString();

    const mark = document.createElement('mark');
    mark.className = `hl hl-${color}`;
    mark.dataset.color = color;
    mark.dataset.id = 'hl-' + Math.random().toString(36).substring(2, 8);
    mark.textContent = selectedText;

    range.deleteContents();
    range.insertNode(mark);

    sel.removeAllRanges();
    floatingToolbar.style.display = 'none';

    syncActiveBlockContent(mark);
    renderHighlightsSummary();
    saveToStorage();
    showToast(`Concept highlighted (${color})`, '🖍️');
  }

  // Format Commands (Bold, Italic, Underline)
  document.querySelectorAll('.float-tool-btn[data-cmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cmd = btn.getAttribute('data-cmd');
      document.execCommand(cmd, false, null);
    });
  });

  // Margin Note / Sticky Comment
  document.getElementById('btn-float-comment')?.addEventListener('click', () => {
    const note = prompt('Add student margin note / comment on this concept:');
    if (note && note.trim()) {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const mark = document.createElement('mark');
      mark.className = 'hl hl-yellow';
      mark.dataset.color = 'yellow';
      mark.dataset.note = note.trim();
      mark.title = `Student Note: ${note.trim()}`;
      mark.textContent = sel.toString();

      range.deleteContents();
      range.insertNode(mark);

      sel.removeAllRanges();
      floatingToolbar.style.display = 'none';

      syncActiveBlockContent(mark);
      renderHighlightsSummary();
      saveToStorage();
      showToast('Margin note saved!', '💬');
    }
  });

  // Clear Highlight
  document.getElementById('btn-float-clear-hl')?.addEventListener('click', () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;

    const range = sel.getRangeAt(0);
    const parentMark = range.commonAncestorContainer.parentElement?.closest('mark.hl');
    if (parentMark) {
      const text = document.createTextNode(parentMark.textContent);
      parentMark.parentNode.replaceChild(text, parentMark);
      floatingToolbar.style.display = 'none';
      syncActiveBlockContent(text);
      renderHighlightsSummary();
      saveToStorage();
      showToast('Highlight removed', '✕');
    }
  });

  function syncActiveBlockContent(el) {
    const blockBody = (el.nodeType === 1 ? el : el.parentElement)?.closest('.block-body');
    if (blockBody) {
      const secId = blockBody.dataset.id;
      const sec = sections.find(s => s.id === secId);
      if (sec) {
        sec.content = blockBody.innerHTML;
      }
    }
  }

  // ── Obsidian Highlights Tracker Sidebar ───────────────────────────────────
  function renderHighlightsSummary() {
    highlightsContainer.innerHTML = '';
    const marks = sectionsContainer.querySelectorAll('mark.hl');
    countHighlightsEl.textContent = marks.length;

    if (marks.length === 0) {
      highlightsContainer.innerHTML = `
        <div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0;">
          No highlights yet.<br>Select any text to highlight key concepts.
        </div>
      `;
      return;
    }

    marks.forEach((mark, i) => {
      const color = mark.dataset.color || 'yellow';
      const text = mark.textContent.trim();
      const note = mark.dataset.note || '';

      const pill = document.createElement('div');
      pill.className = 'highlight-pill-item';
      pill.innerHTML = `
        <div class="hl-meta-row">
          <span class="hl-tag-badge" style="background:var(--hl-${color});color:var(--hl-${color}-text);">
            ${color.toUpperCase()}
          </span>
          <span style="font-size:10px;color:var(--text-muted);">#${i + 1}</span>
        </div>
        <div class="hl-quote-text">"${text}"</div>
        ${note ? `<div class="hl-note-text">💬 ${note}</div>` : ''}
      `;

      pill.addEventListener('click', () => {
        mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        mark.style.outline = '2px solid #3b82f6';
        setTimeout(() => { mark.style.outline = ''; }, 1500);
      });

      highlightsContainer.appendChild(pill);
    });
  }

  document.getElementById('btn-clear-all-hl')?.addEventListener('click', () => {
    if (confirm('Clear all highlights across your notes?')) {
      sectionsContainer.querySelectorAll('mark.hl').forEach(mark => {
        const text = document.createTextNode(mark.textContent);
        mark.parentNode.replaceChild(text, mark);
      });
      sections.forEach(s => {
        const bodyEl = document.querySelector(`.block-body[data-id="${s.id}"]`);
        if (bodyEl) s.content = bodyEl.innerHTML;
      });
      renderHighlightsSummary();
      saveToStorage();
      showToast('All highlights cleared', '🧹');
    }
  });

  // ── Sketches Gallery Sidebar ──────────────────────────────────────────────
  function renderSketchesGallery() {
    sketchesContainer.innerHTML = '';
    const sketchSections = sections.filter(s => s.type === 'whiteboard' && s.sketchDataUrl);
    countSketchesEl.textContent = sketchSections.length;

    if (sketchSections.length === 0) {
      sketchesContainer.innerHTML = `
        <div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px 0;">
          No drawings yet.<br>Click "Draw Diagram" to create one.
        </div>
      `;
      return;
    }

    sketchSections.forEach(sec => {
      const card = document.createElement('div');
      card.className = 'sketch-card-thumb';
      card.innerHTML = `
        <img src="${sec.sketchDataUrl}" class="sketch-thumb-img" alt="Sketch" />
        <div class="sketch-thumb-info">
          <span>${sec.title}</span>
          <button style="background:none;border:none;color:#3b82f6;cursor:pointer;font-size:11px;">Edit</button>
        </div>
      `;
      card.addEventListener('click', () => {
        openWhiteboardForSection(sec.id);
      });
      sketchesContainer.appendChild(card);
    });
  }

  document.getElementById('btn-sidebar-add-sketch')?.addEventListener('click', () => {
    addNewBlock('whiteboard');
  });

  // ── Digital Whiteboard Engine (Scope 2 Handwritten Diagrams) ──────────────
  function initWhiteboard() {
    wbCtx = wbCanvas.getContext('2d', { willReadFrequently: true });
    resizeCanvas();

    window.addEventListener('resize', debounce(resizeCanvas, 200));

    // Mouse & Touch events
    wbCanvas.addEventListener('mousedown', startDrawing);
    wbCanvas.addEventListener('mousemove', draw);
    wbCanvas.addEventListener('mouseup', stopDrawing);
    wbCanvas.addEventListener('mouseleave', stopDrawing);

    wbCanvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      wbCanvas.dispatchEvent(mouseEvent);
    }, { passive: false });

    wbCanvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      wbCanvas.dispatchEvent(mouseEvent);
    }, { passive: false });

    wbCanvas.addEventListener('touchend', (e) => {
      const mouseEvent = new MouseEvent('mouseup', {});
      wbCanvas.dispatchEvent(mouseEvent);
    });

    // Tool switching
    document.querySelectorAll('.wb-tool-group .wb-btn[data-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wb-tool-group .wb-btn[data-tool]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentTool = btn.getAttribute('data-tool');
      });
    });

    // Color switching
    document.querySelectorAll('.wb-color-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        document.querySelectorAll('.wb-color-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
        currentColor = dot.getAttribute('data-color');
      });
    });

    // Size switching
    document.querySelectorAll('.wb-btn[data-size]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wb-btn[data-size]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStrokeSize = parseInt(btn.getAttribute('data-size'), 10) || 3;
      });
    });

    // Paper Grid switching
    document.querySelectorAll('.wb-btn[data-grid]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wb-btn[data-grid]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const gridClass = btn.getAttribute('data-grid');
        wbContainer.className = `wb-canvas-container ${gridClass}`;
      });
    });

    // Clear Canvas
    document.getElementById('wb-btn-clear')?.addEventListener('click', () => {
      if (confirm('Clear the entire whiteboard?')) {
        wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
        saveCanvasState();
      }
    });

    // Undo
    document.getElementById('wb-btn-undo')?.addEventListener('click', undoCanvas);

    // Redo
    document.getElementById('wb-btn-redo')?.addEventListener('click', redoCanvas);

    // Insert into Notes
    document.getElementById('wb-btn-insert')?.addEventListener('click', insertSketchIntoNotes);

    // Close Whiteboard
    document.getElementById('wb-btn-close')?.addEventListener('click', () => {
      wbModal.classList.remove('open');
    });

    // Header Draw Diagram button
    document.getElementById('nav-btn-draw')?.addEventListener('click', () => {
      openWhiteboardForSection(null);
    });
  }

  function resizeCanvas() {
    const rect = wbContainer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    wbCanvas.width = rect.width * dpr;
    wbCanvas.height = rect.height * dpr;
    wbCtx.scale(dpr, dpr);
    wbCanvas.style.width = `${rect.width}px`;
    wbCanvas.style.height = `${rect.height}px`;

    // Restore last state if available
    if (historyStep >= 0 && canvasHistory[historyStep]) {
      const img = new Image();
      img.onload = () => {
        wbCtx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = canvasHistory[historyStep];
    }
  }

  function getCanvasCoords(e) {
    const rect = wbCanvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function startDrawing(e) {
    isDrawing = true;
    const coords = getCanvasCoords(e);
    startX = coords.x;
    startY = coords.y;

    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'eraser') {
      wbCtx.beginPath();
      wbCtx.moveTo(startX, startY);
    } else {
      // Shape tool: take snapshot for live rubber-banding
      snapshotImgData = wbCtx.getImageData(0, 0, wbCanvas.width, wbCanvas.height);
    }
  }

  function draw(e) {
    if (!isDrawing) return;
    const coords = getCanvasCoords(e);

    wbCtx.lineWidth = currentStrokeSize;
    wbCtx.lineCap = 'round';
    wbCtx.lineJoin = 'round';

    if (currentTool === 'pen') {
      wbCtx.strokeStyle = currentColor;
      wbCtx.globalAlpha = 1.0;
      wbCtx.lineTo(coords.x, coords.y);
      wbCtx.stroke();
    } else if (currentTool === 'highlighter') {
      wbCtx.strokeStyle = currentColor;
      wbCtx.globalAlpha = 0.35;
      wbCtx.lineWidth = currentStrokeSize * 3;
      wbCtx.lineTo(coords.x, coords.y);
      wbCtx.stroke();
    } else if (currentTool === 'eraser') {
      wbCtx.strokeStyle = '#ffffff';
      wbCtx.globalAlpha = 1.0;
      wbCtx.lineWidth = currentStrokeSize * 4;
      wbCtx.lineTo(coords.x, coords.y);
      wbCtx.stroke();
    } else {
      // Shape tools: restore snapshot and redraw shape preview
      if (snapshotImgData) {
        wbCtx.putImageData(snapshotImgData, 0, 0);
      }
      wbCtx.strokeStyle = currentColor;
      wbCtx.globalAlpha = 1.0;

      if (currentTool === 'line') {
        wbCtx.beginPath();
        wbCtx.moveTo(startX, startY);
        wbCtx.lineTo(coords.x, coords.y);
        wbCtx.stroke();
      } else if (currentTool === 'arrow') {
        drawArrow(startX, startY, coords.x, coords.y);
      } else if (currentTool === 'rect') {
        wbCtx.beginPath();
        wbCtx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
      } else if (currentTool === 'circle') {
        const radius = Math.sqrt(Math.pow(coords.x - startX, 2) + Math.pow(coords.y - startY, 2));
        wbCtx.beginPath();
        wbCtx.arc(startX, startY, radius, 0, Math.PI * 2);
        wbCtx.stroke();
      }
    }
  }

  function drawArrow(fromx, fromy, tox, toy) {
    const headlen = 14;
    const angle = Math.atan2(toy - fromy, tox - fromx);
    wbCtx.beginPath();
    wbCtx.moveTo(fromx, fromy);
    wbCtx.lineTo(tox, toy);
    wbCtx.stroke();

    wbCtx.beginPath();
    wbCtx.moveTo(tox, toy);
    wbCtx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
    wbCtx.moveTo(tox, toy);
    wbCtx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
    wbCtx.stroke();
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    wbCtx.closePath();
    wbCtx.globalAlpha = 1.0;
    saveCanvasState();
  }

  function saveCanvasState() {
    historyStep++;
    if (historyStep < canvasHistory.length) {
      canvasHistory.length = historyStep;
    }
    canvasHistory.push(wbCanvas.toDataURL());
  }

  function undoCanvas() {
    if (historyStep > 0) {
      historyStep--;
      const img = new Image();
      img.onload = () => {
        wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
        wbCtx.drawImage(img, 0, 0, wbCanvas.width / (window.devicePixelRatio || 1), wbCanvas.height / (window.devicePixelRatio || 1));
      };
      img.src = canvasHistory[historyStep];
    } else if (historyStep === 0) {
      historyStep = -1;
      wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
    }
  }

  function redoCanvas() {
    if (historyStep < canvasHistory.length - 1) {
      historyStep++;
      const img = new Image();
      img.onload = () => {
        wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);
        wbCtx.drawImage(img, 0, 0, wbCanvas.width / (window.devicePixelRatio || 1), wbCanvas.height / (window.devicePixelRatio || 1));
      };
      img.src = canvasHistory[historyStep];
    }
  }

  function openWhiteboardForSection(targetSecId) {
    activeEditingDiagramId = targetSecId;
    wbModal.classList.add('open');
    setTimeout(() => {
      resizeCanvas();
      wbCtx.clearRect(0, 0, wbCanvas.width, wbCanvas.height);

      if (targetSecId) {
        const sec = sections.find(s => s.id === targetSecId);
        if (sec && sec.sketchDataUrl) {
          const img = new Image();
          img.onload = () => {
            const rect = wbContainer.getBoundingClientRect();
            wbCtx.drawImage(img, 0, 0, rect.width, rect.height);
            saveCanvasState();
          };
          img.src = sec.sketchDataUrl;
          return;
        }
      }
      saveCanvasState();
    }, 100);
  }

  function insertSketchIntoNotes() {
    const dataUrl = wbCanvas.toDataURL('image/png');

    if (activeEditingDiagramId) {
      // Update existing section diagram
      const sec = sections.find(s => s.id === activeEditingDiagramId);
      if (sec) {
        sec.sketchDataUrl = dataUrl;
        const imgEl = document.getElementById(`img-${sec.id}`);
        if (imgEl) imgEl.src = dataUrl;
      }
    } else {
      // Create a brand new diagram section block
      const newId = 'sec-' + Math.random().toString(36).substring(2, 9);
      const newSec = {
        id: newId,
        type: 'whiteboard',
        title: 'Handwritten Student Diagram',
        content: `
          <div class="diagram-embed-card" id="diagram-card-${newId}">
            <div class="diagram-embed-header">
              <div class="diagram-embed-title"><span>🎨 Handwritten Sketch</span></div>
              <div class="diagram-embed-actions">
                <button class="btn btn-secondary btn-edit-sketch" data-sec-id="${newId}" style="padding:4px 10px;font-size:11px;">✏️ Edit in Whiteboard</button>
              </div>
            </div>
            <div class="diagram-embed-canvas-wrap">
              <img src="${dataUrl}" class="diagram-embed-img" id="img-${newId}" alt="Diagram" />
            </div>
            <div class="diagram-embed-caption">Handwritten diagram added during lecture revision.</div>
          </div>
        `,
        sketchDataUrl: dataUrl
      };
      sections.push(newSec);
    }

    renderAll();
    saveToStorage();
    wbModal.classList.remove('open');
    showToast('Handwritten diagram inserted into notes!', '🎨');
  }

  // ── Share with Classmates Modal (Collaboration & Ownership) ───────────────
  const navBtnShare = document.getElementById('nav-btn-share');
  const shareCloseBtn = document.getElementById('share-close-btn');

  navBtnShare?.addEventListener('click', () => {
    shareModal.classList.add('open');
  });

  shareCloseBtn?.addEventListener('click', () => {
    shareModal.classList.remove('open');
  });

  shareModal?.addEventListener('click', (e) => {
    if (e.target === shareModal) shareModal.classList.remove('open');
  });

  // 1. Export Standalone Interactive HTML Notebook
  document.getElementById('opt-share-html')?.addEventListener('click', () => {
    shareModal.classList.remove('open');
    exportStandaloneHtmlNotebook();
  });

  function exportStandaloneHtmlNotebook() {
    const serializedSections = JSON.stringify(sections);
    const htmlTitle = docTitle || 'RecallAI_Student_Notes';

    const standaloneHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${htmlTitle}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500&family=Kalam:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"></script>
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; background: #0b0f19; color: #f1f5f9; line-height: 1.8; margin: 0; padding: 30px 20px 80px; }
    .notebook-wrap { max-width: 860px; margin: 0 auto; }
    .banner { background: linear-gradient(135deg, #1e3a8a, #7c3aed); border-radius: 14px; padding: 26px 30px; margin-bottom: 24px; }
    .banner h1 { margin: 0 0 8px; color: #fff; font-size: 24px; font-weight: 800; }
    .banner p { margin: 0; color: #cbd5e1; font-size: 14px; }
    .badge { background: rgba(255,255,255,0.15); padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 700; margin-right: 8px; }
    .sec-card { background: #131a29; border: 1px solid #1e293b; border-radius: 14px; padding: 22px 26px; margin-bottom: 20px; box-shadow: 0 4px 14px rgba(0,0,0,0.4); }
    .sec-title { font-size: 17px; font-weight: 700; color: #60a5fa; border-bottom: 1px solid #1e293b; padding-bottom: 10px; margin-bottom: 16px; }
    mark.hl-yellow { background: #fef08a; color: #713f12; padding: 1px 4px; border-radius: 3px; }
    mark.hl-green  { background: #bbf7d0; color: #14532d; padding: 1px 4px; border-radius: 3px; }
    mark.hl-pink   { background: #fbcfe8; color: #831843; padding: 1px 4px; border-radius: 3px; }
    mark.hl-blue   { background: #bae6fd; color: #0c4a6e; padding: 1px 4px; border-radius: 3px; }
    mark.hl-orange { background: #fed7aa; color: #7c2d12; padding: 1px 4px; border-radius: 3px; }
    .def-item-card { background: rgba(59,130,246,0.06); border-left: 4px solid #3b82f6; padding: 12px 16px; margin: 12px 0; border-radius: 0 8px 8px 0; }
    .def-term-header { font-weight: 700; color: #60a5fa; margin-bottom: 4px; }
    .formula-box { background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.25); border-radius: 10px; padding: 14px 18px; margin: 14px 0; text-align: center; }
    .code-box { background: #090d16; border: 1px solid #1e293b; border-radius: 8px; margin: 14px 0; overflow-x: auto; }
    .code-box-header { background: #111827; padding: 6px 12px; font-size: 11px; color: #94a3b8; font-family: monospace; }
    pre { margin: 0; padding: 12px 14px; font-family: monospace; color: #7dd3fc; }
    img { max-width: 100%; border-radius: 8px; display: block; margin: 12px auto; }
    .share-tag { display: inline-flex; align-items: center; gap: 6px; background: rgba(16,185,129,0.15); color: #34d399; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="notebook-wrap">
    <div class="share-tag">✨ Interactive Student Study Pack &bull; Created with RecallAI Notes Studio</div>
    <div class="banner">
      <div style="margin-bottom:10px;">
        <span class="badge">STUDENT OWNED NOTEBOOK</span>
        <span class="badge">MACHINE LEARNING</span>
      </div>
      <h1>${htmlTitle}</h1>
      <p>Shared study guide with custom definitions, explanations, formulas, highlights, and handwritten whiteboard sketches.</p>
    </div>
    <div id="content-area">
      ${sections.map(s => `
        <div class="sec-card">
          <div class="sec-title">${s.title}</div>
          <div class="sec-body">${s.content}</div>
        </div>
      `).join('')}
    </div>
  </div>
</body>
</html>`;

    downloadFile(standaloneHtml, `${htmlTitle.replace(/\s+/g, '_')}_Student_Notes.html`, 'text/html;charset=utf-8');
    showToast('Interactive Student Notebook exported!', '🌐');
  }

  // 2. Export Student Study Pack JSON
  document.getElementById('opt-share-json')?.addEventListener('click', () => {
    shareModal.classList.remove('open');
    const pack = {
      version: '1.0.0',
      title: docTitle,
      videoId: videoId,
      level: noteLevel,
      lang: noteLang,
      exportedAt: new Date().toISOString(),
      sections: sections
    };
    downloadFile(JSON.stringify(pack, null, 2), `${docTitle.replace(/\s+/g, '_')}_StudyPack.json`, 'application/json');
    showToast('Study Pack (.json) exported!', '📦');
  });

  // 3. Copy Markdown Study Summary
  document.getElementById('opt-share-md')?.addEventListener('click', () => {
    shareModal.classList.remove('open');
    let md = `# ${docTitle}\n\n`;
    sections.forEach(s => {
      md += `## ${s.title}\n`;
      // Clean HTML tags to plain markdown text
      const cleanText = s.content.replace(/<[^>]*>/g, '').replace(/&bull;/g, '-').trim();
      md += `${cleanText}\n\n`;
    });
    navigator.clipboard.writeText(md).then(() => {
      showToast('Markdown summary copied to clipboard!', '📋');
    });
  });

  // 4. Import Notes from Classmate
  const importFileInput = document.getElementById('import-file-input');
  document.getElementById('opt-import-pack')?.addEventListener('click', () => {
    importFileInput?.click();
  });

  importFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target.result;
        const parsed = JSON.parse(text);
        if (parsed.sections && Array.isArray(parsed.sections)) {
          sections = parsed.sections;
          if (parsed.title) docTitle = parsed.title;
          renderAll();
          saveToStorage();
          shareModal.classList.remove('open');
          showToast(`Imported classmate's notes: "${docTitle}"!`, '🎉');
        } else {
          alert('Invalid study pack file format.');
        }
      } catch (err) {
        alert('Could not parse file. Please upload a valid RecallAI .json study pack.');
      }
    };
    reader.readAsText(file);
  });

  // Print / PDF Button
  document.getElementById('nav-btn-print')?.addEventListener('click', () => {
    window.print();
  });

  // Reset to Original AI Version
  document.getElementById('btn-reset-original')?.addEventListener('click', () => {
    if (confirm('Reset notes to the original AI generated version? Any custom edits and drawings will be reset.')) {
      chrome.storage.local.remove(['rc_studio_data'], () => {
        initNotes();
        showToast('Reset to original version', '🔄');
      });
    }
  });

  // ── View Modes & Theme ───────────────────────────────────────────────────
  const modeStudio = document.getElementById('view-mode-studio');
  const modeWhiteboard = document.getElementById('view-mode-whiteboard');
  const modeReading = document.getElementById('view-mode-reading');

  modeStudio?.addEventListener('click', () => {
    setMode('studio');
  });

  modeWhiteboard?.addEventListener('click', () => {
    setMode('whiteboard');
    openWhiteboardForSection(null);
  });

  modeReading?.addEventListener('click', () => {
    setMode('reading');
  });

  function setMode(mode) {
    [modeStudio, modeWhiteboard, modeReading].forEach(b => b.classList.remove('active'));
    if (mode === 'studio') {
      modeStudio.classList.add('active');
      document.body.classList.remove('reading-mode');
    } else if (mode === 'reading') {
      modeReading.classList.add('active');
      document.body.classList.add('reading-mode');
      showToast('Reading Mode: Distraction-free clean notes', '📖');
    }
  }

  // Theme Toggle (Dark Obsidian / Paper Light)
  const themeBtn = document.getElementById('nav-btn-theme');
  const themeIcon = document.getElementById('theme-icon');

  themeBtn?.addEventListener('click', () => {
    isDarkMode = !isDarkMode;
    document.body.classList.toggle('light-theme', !isDarkMode);
    themeIcon.textContent = isDarkMode ? '🌙' : '☀️';
    showToast(isDarkMode ? 'Dark Obsidian Theme' : 'Clean Paper Theme', '🎨');
  });

  // Sidebar Collapse Toggle
  document.getElementById('btn-toggle-sidebar')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('studio-sidebar')?.classList.toggle('collapsed');
  });

  // Sidebar Tab Switching
  document.querySelectorAll('.sidebar-tab-btn').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-tab-btn').forEach(b => b.classList.remove('active'));
      tabBtn.classList.add('active');

      const targetTab = tabBtn.getAttribute('data-tab');
      document.getElementById('pane-outline').style.display = targetTab === 'tab-outline' ? 'block' : 'none';
      document.getElementById('pane-highlights').style.display = targetTab === 'tab-highlights' ? 'block' : 'none';
      document.getElementById('pane-sketches').style.display = targetTab === 'tab-sketches' ? 'block' : 'none';
    });
  });

  // Editable Title sync
  docTitleInput?.addEventListener('input', () => {
    docTitle = docTitleInput.value;
    docHeading.textContent = docTitle;
    document.title = `${docTitle} — RecallAI Notes Studio`;
    saveToStorage();
  });

  docHeading?.addEventListener('blur', () => {
    docTitle = docHeading.textContent.trim();
    docTitleInput.value = docTitle;
    document.title = `${docTitle} — RecallAI Notes Studio`;
    saveToStorage();
  });

  // ── Auto-Save to Chrome Storage & LocalStorage ───────────────────────────
  function saveToStorage() {
    saveStatusText.textContent = 'Saving…';
    saveStatusPill.style.color = 'var(--accent-amber)';

    const dataToSave = {
      title: docTitle,
      videoId: videoId,
      level: noteLevel,
      lang: noteLang,
      lastModified: Date.now(),
      sections: sections
    };

    chrome.storage.local.set({ rc_studio_data: dataToSave }, () => {
      saveStatusText.textContent = 'Saved Locally';
      saveStatusPill.style.color = 'var(--accent-emerald)';
    });
  }

  // Helper: Download a file
  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  // Helper: Toast message
  function showToast(msg, icon = '✨') {
    if (!toastEl) return;
    toastText.textContent = msg;
    toastIcon.textContent = icon;
    toastEl.classList.add('show');
    setTimeout(() => { toastEl.classList.remove('show'); }, 2500);
  }

  // Debounce helper
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Start initialization
  initWhiteboard();
  initNotes();
});
