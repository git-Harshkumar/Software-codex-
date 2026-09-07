// RecallAI Background Service Worker (Manifest V3)
// Implements the complete lecture processing pipeline in the background:
// 1. Transcript extraction & cleaning (filler removal, sentence reconstruction)
// 2. Visual keyframe analysis (board OCR, formulas, diagrams via Gemini Vision)
// 3. Multimodal lecture combiner (merging audio & visual observations)
// 4. Multi-level & multilingual note generation (Levels 1, 2, 3 x EN, HI, Hinglish)
// 5. Chapter timeline & sticky notes generation
// 6. Automatic sync to local RecallAI web platform (http://localhost:5000)

chrome.runtime.onInstalled.addListener(() => {
  console.log('[RecallAI] Background pipeline service worker installed.');
});

// ── Confirmed available Gemini models (queried live from v1beta API) ──────────
const GEMINI_MODELS = [
  'gemini-3.8-flash',        // Latest stable flash (Sep 2026)
  'gemini-3.7-flash',        // Previous stable flash
  'gemini-3.6-flash',        // June 2026 stable flash
  'gemini-3.5-flash',        // May 2026 stable flash
  'gemini-flash-latest',     // Always points to latest flash release
  'gemini-2.5-flash',        // Stable June 2025 flash
  'gemini-2.5-flash-lite',   // Lighter version of 2.5 flash
  'gemini-flash-lite-latest',// Latest flash-lite
];

// ── Gemini API Caller with Fallback and Multimodal Vision Support ─────────────
async function callGeminiApi(apiKey, contents, systemInstruction, preferredModel) {
  const modelsToTry = preferredModel
    ? [preferredModel, ...GEMINI_MODELS.filter(m => m !== preferredModel)]
    : GEMINI_MODELS;

  let lastError = null;

  // Normalize contents to Gemini API format
  let formattedContents = [];
  if (typeof contents === 'string') {
    formattedContents = [{ role: 'user', parts: [{ text: contents }] }];
  } else if (Array.isArray(contents)) {
    formattedContents = contents;
  }

  for (const model of modelsToTry) {
    try {
      const endpoint =
        `https://generativelanguage.googleapis.com/v1beta/models/` +
        `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

      const payload = {
        contents: formattedContents,
        generationConfig: { temperature: 0.2, maxOutputTokens: 8192 }
      };

      if (systemInstruction) {
        payload.systemInstruction = { parts: [{ text: systemInstruction }] };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (!res.ok) {
        lastError = data.error?.message || `HTTP ${res.status}`;
        console.warn(`[RecallAI] ${model} failed:`, lastError);
        continue;
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (text) {
        return { ok: true, text, modelUsed: model };
      }

      lastError = 'Empty response from Gemini.';
    } catch (err) {
      lastError = err.message;
      console.warn(`[RecallAI] Network error with ${model}:`, err);
    }
  }

  return { ok: false, error: lastError || 'All Gemini models failed.' };
}

// ── Transcript Cleaning & Sentence Reconstructor (clean_transcript.py & sentence_reconstructor.py) ──
const FILLER_WORDS = [
  'um', 'uh', 'umm', 'hmm', 'you know', 'like', 'sort of', 'kind of',
  'basically', 'actually', 'right?', 'i mean'
];

function cleanAndReconstructTranscript(rawSegments) {
  if (!Array.isArray(rawSegments) || rawSegments.length === 0) return [];

  // 1. Clean individual segments (remove filler words & normalize whitespace)
  const cleanedList = [];
  const fillerRegex = new RegExp(`\\b(${FILLER_WORDS.join('|')})\\b`, 'gi');

  for (const seg of rawSegments) {
    if (!seg || !seg.text) continue;
    let t = seg.text.replace(/\s+/g, ' ').trim();
    t = t.replace(fillerRegex, '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\s+([,.!?])/g, '$1');

    if (t) {
      cleanedList.push({
        start: Number(seg.start) || 0,
        duration: Number(seg.duration) || 3,
        text: t
      });
    }
  }

  if (cleanedList.length === 0) return [];

  // 2. Reconstruct into natural sentence chunks
  const sentences = [];
  let curText = '';
  let curStart = cleanedList[0].start;
  let curEnd = curStart;

  for (let i = 0; i < cleanedList.length; i++) {
    const item = cleanedList[i];
    if (!curText) {
      curStart = item.start;
    }
    curText += (curText ? ' ' : '') + item.text;
    curEnd = item.start + item.duration;

    // Robust sentence boundary detection:
    // 1. Explicit terminal punctuation (. ! ?)
    // 2. Audible pause between caption tracks (> 1.6 seconds)
    // 3. Natural clause break (, ; :) when text length >= 80
    // 4. Maximum length threshold (> 130 characters)
    // 5. Final transcript item
    const endsWithTerminal = /[.!?]$/.test(item.text);
    const nextItem = cleanedList[i + 1];
    const pauseDuration = nextItem ? (nextItem.start - (item.start + item.duration)) : 0;
    const isNaturalPause = pauseDuration >= 1.6;
    const isClauseBreak = (curText.length >= 80) && (/[,;:]$/.test(item.text) || /\b(so|now|and|then|therefore|because|however)\b$/i.test(item.text));
    const isMaxLimit = curText.length >= 130;

    if (endsWithTerminal || isNaturalPause || isClauseBreak || isMaxLimit || !nextItem) {
      let finalSentence = curText.trim();
      if (finalSentence) {
        finalSentence = finalSentence.charAt(0).toUpperCase() + finalSentence.slice(1);
        if (!/[.!?]$/.test(finalSentence)) finalSentence += '.';
        sentences.push({
          start: curStart,
          end: curEnd,
          text: finalSentence
        });
      }
      curText = '';
    }
  }

  return sentences;
}

// ── Visual Keyframe Analysis with Gemini Vision (analyze_keyframes.py) ────────
async function analyzeKeyframesWithVision(apiKey, frames, preferredModel) {
  if (!Array.isArray(frames) || frames.length === 0) return [];

  const analysisResults = [];

  for (const f of frames) {
    if (!f.base64) continue;

    const prompt = `Analyze this lecture frame carefully from an educational video.
Extract:
1. Visible text on the whiteboard or slides as accurately as possible.
2. Mathematical equations and notation (preserve using LaTeX notation: $formula$ or $$formula$$).
3. Diagrams, flowcharts, graphs, or visual structures.
4. Key concepts or definitions written down.

Return a concise educational summary of what is visible on this board/slide. Do NOT describe irrelevant visual elements.`;

    const contents = [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: f.base64
            }
          },
          { text: prompt }
        ]
      }
    ];

    try {
      const res = await callGeminiApi(apiKey, contents, 'You are an educational vision analyzer extracting whiteboard notes and diagrams.', preferredModel);
      if (res.ok && res.text) {
        analysisResults.push({
          timestamp: f.timestamp || 0,
          visual_notes: res.text.trim()
        });
      }
    } catch (err) {
      console.warn('[RecallAI] Vision analysis error at', f.timestamp, err);
    }
  }

  return analysisResults;
}

// ── Multimodal Combiner (combine_lecture.py) ──────────────────────────────────
function combineLectureData(transcriptSentences, visualAnalyses) {
  const combined = [];

  for (const seg of transcriptSentences) {
    combined.push({
      type: 'transcript',
      timestamp: seg.start,
      text: seg.text
    });
  }

  for (const va of visualAnalyses) {
    combined.push({
      type: 'visual',
      timestamp: va.timestamp,
      text: va.visual_notes
    });
  }

  combined.sort((a, b) => a.timestamp - b.timestamp);

  // Format as structured multimodal feed for Gemini prompt
  const lines = [];
  for (const item of combined) {
    const min = Math.floor(item.timestamp / 60);
    const sec = Math.floor(item.timestamp % 60);
    const tsStr = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    if (item.type === 'visual') {
      lines.push(`  [BOARD/SLIDE VISUAL @ ${tsStr}]:\n${item.text}`);
    } else {
      lines.push(`[${tsStr}] ${item.text}`);
    }
  }

  return {
    combinedList: combined,
    feedText: lines.join('\n')
  };
}

// ── Academic Note Generator Prompts (generators/generate_notes_v2.py) ─────────
const SYSTEM_PROMPT = `You are an expert Academic Lecture Companion and Note Generator.
Your mission is to transform lecture content into exceptionally clear, comprehensive, highly visual, and topic-accurate study notes.

CORE GROUNDING RULE:
Preserve all concepts, terminology, mathematical sequence, theorems, definitions, and instructor examples from the lecture source material. Never hallucinate content outside the lecture scope.

CRITICAL DIRECTIVE: INTELLIGENT CODE INCLUSION (ONLY FOR CODING TOPICS):
- ONLY provide code blocks (\`\`\`python, \`\`\`cpp, etc.) IF the lecture topic is specifically about programming, computer science, software engineering, or numerical coding algorithms that were actually taught or demonstrated.
- IF THE LECTURE IS A NON-CODING TOPIC (such as biology, history, physics/chemistry theory, economics, business, literature, philosophy, or pure mathematics without coding):
  * STRICTLY DO NOT FABRICATE OR FORCE CODE BLOCKS!
  * Never invent fake Python functions or artificial pseudocode for natural, biological, economic, or historical processes.
  * Instead, provide step-by-step conceptual mechanisms, analytical breakdowns, or theoretical derivations.
- WHEN A CODING TOPIC IS DISCUSSED:
  * Provide clean, runnable code in a standard fenced code box with line-by-line comments, sample inputs/outputs, and Time/Space complexity.
  * Follow the code box with an inline vector <svg> visual walkthrough diagram (e.g. array memory cells, recursion tree, pointer movements, or flowchart). Our viewer renders code and SVG side-by-side!

CRITICAL READABILITY DIRECTIVE: ZERO UNREADABLE AI DIFFUSION IMAGES:
1. ABSOLUTELY NEVER OUTPUT RASTER AI DIFFUSION IMAGES (e.g. ![...](ai-image:...)):
   Diffusion models cannot write legible text and create distorted, unreadable fake diagrams.
   DO NOT output any ![...](ai-image:...) image banners under Introduction or anywhere else.
2. TO GUARANTEE 100% READABLE VISUALS:
   All diagrams, flowcharts, architectures, concept maps, and plots MUST be written as inline vector <svg> diagrams:
   <svg width="100%" height="240" viewBox="0 0 650 240" xmlns="http://www.w3.org/2000/svg">
     <!-- Crisp vector elements, high-contrast text, clear nodes, distinct arrows -->
   </svg>
   Design rules for maximum legibility:
   a) High-contrast text: Use large, readable text (<text font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#f8fafc">...</text>) on dark surface cards (<rect rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>).
   b) Ample spacing: Ensure at least 25-30px spacing between nodes so text never overlaps or cramps.
   c) Explicit viewBox: Always specify viewBox="0 0 650 240" (or appropriate dimensions) so it scales crisply at any zoom level.
   d) Distinct colors: Use vibrant, accessible accents (Primary Blue #38bdf8, Emerald Green #34d399, Amber #fbbf24, Violet #a78bfa).

3. STRUCTURED ASCII FLOWCHARTS & BOX DIAGRAMS:
   For quick visual summaries, you may also include text flowcharts in \`\`\`ascii or \`\`\`text blocks (e.g. [ Input ] ──> [ Process ] ──> [ Output ]).

4. EXTRA INTUITION BOOSTERS & CALLOUT BOXES:
   - Provide deep-dive conceptual intuitions and real-world analogies:
     > 💡 **Core Intuition & Mental Model**: [Vivid real-world analogy or geometric intuition]
   - Highlight subtle traps and common misunderstandings:
     > ⚠️ **Common Mistakes & Edge Cases**: [Pitfalls students often make]
   - Add high-yield examination tips:
     > 🎯 **Exam Strategy & Key Takeaways**: [How this topic is tested in exams]

MATHEMATICAL NOTATION & SYMBOLS:
- Write all mathematical expressions using clean, readable symbols so they read naturally without raw LaTeX slashes:
  * Greek letters: α, β, γ, δ, ε, θ, λ, μ, π, σ, τ, φ, ω, Δ, Σ, Ω
  * Relations & Operators: ≤, ≥, ≠, ≈, ±, ×, ·, ÷, →, ⇒, ⇔, ∞, √, ∑, ∫
  * Sets & Logic: ∈, ∉, ⊂, ∪, ∩, ∀, ∃
  * Exponents & Subscripts: x², x³, xⁿ, xᵢ, x₀, vₖ
- Do NOT output raw LaTeX slash commands like \\delta, \\leq, \\frac{a}{b}, \\sum - write them as natural readable symbols: δ, ≤, (a / b), ∑.

LANGUAGE RULES:
- ENGLISH: Write natural academic English.
- HINDI: Explain in clear Hindi while preserving technical terminology in English (e.g., "Breadth-First Search (BFS)"). Do not translate mathematical notation.
- HINGLISH: Explain naturally using Hindi + English technical terminology, similar to how an Indian college student would explain the concept.

OUTPUT QUALITY:
- Clear headings and subheadings
- Markdown tables for comparisons and concept breakdown
- **Bold** for important terms
- Avoid emojis in text except designated callout badges: 💡, ⚠️, 🎯

At the end, always provide:
## Quick Revision
5–10 of the most critical takeaways from the lecture.`;

function getNoteLevelPrompt(level, lang, title, lectureFeed) {
  const levelNames = { overview: 'OVERVIEW', summary: 'SUMMARY', detailed: 'DETAILED NOTES' };
  const lvlName = levelNames[level.toLowerCase()] || 'SUMMARY';

  let structureGuide = '';
  if (level.toLowerCase() === 'overview') {
    structureGuide = `Create a Level 1 — OVERVIEW in ${lang.toUpperCase()}.
Target: 2-5 minute fast read with visual clarity and core intuition.
Structure:
# Lecture Overview: ${title}
## Main Idea & Visual Model
> 💡 **Core Intuition**: [High-level mental model]
[Include an inline SVG concept flowchart or roadmap. DO NOT output unreadable ai-image diffusion banners.]
## Key Concepts & Mechanism Flow (with [MM:SS] timestamps)
[Include a clean inline SVG flowchart or process diagram]
## Core Formulation / Mechanism Snapshot
(If this is a programming lecture, provide a clean code snippet. If this is a NON-CODING subject, provide the key formula, theorem, or conceptual principle instead — DO NOT force code if none exists.)
## Takeaway
***
## Quick Revision`;
  } else if (level.toLowerCase() === 'summary') {
    structureGuide = `Create a Level 2 — SUMMARY in ${lang.toUpperCase()}.
Target: 5-15 minute revision read with vector diagrams and comparison tables.
Structure:
# Lecture Summary: ${title}
## 1. Introduction & Overview [0:00]
[Provide a crisp introduction to the lecture's core themes. DO NOT output unreadable ai-image diffusion banners.]
## 2. Main Concepts (with [MM:SS] timestamps)
### Concept Breakdown & Visual Diagram
[Generate a self-contained inline SVG graph, curve plot, network, or workflow diagram]
> 💡 **Core Intuition**: [Mental model]
## 3. Implementation / Mechanism Walkthrough
[If the lecture is about programming/algorithms, provide a fully commented, runnable code implementation with test case. If the lecture is NON-CODING (e.g. biology, history, math theory, economics), provide the step-by-step analytical or biological/physical mechanism instead — STRICTLY DO NOT force code.]
## 4. Key Examples & Formulations (use readable symbols: δ, θ, ≤, ≥, O(n))
## 5. Important Traps & Edge Cases
> ⚠️ **Common Mistakes**: [Key traps]
## 6. Summary Comparison Table
| Feature / Concept | Primary Role | Key Property | Trade-offs / Insights |
## 7. Exam Strategy
> 🎯 **Exam Strategy**: [Exam pointers]
***
## Quick Revision`;
  } else {
    structureGuide = `Create a Level 3 — DETAILED COMPREHENSIVE NOTES in ${lang.toUpperCase()}.
CRITICAL REQUIREMENTS FOR DETAILED NOTES:
- Do NOT write a brief summary or skip sections.
- Provide exhaustive, deeply detailed academic notes that thoroughly cover every topic, concept, theorem, definition, and demonstration in the lecture from start to finish.
- Follow the lecture's chronological sequence faithfully. Create dedicated sections for EVERY topic covered in the video.
- For EVERY topic, provide:
  - Concept explanation, motivation, and intuition with timestamp [MM:SS]
  - > 💡 **Core Intuition & Mental Model** callout box
  - AI-GENERATED VECTOR DIAGRAM: Include a self-contained inline vector <svg viewBox="0 0 650 220" ...> diagram (e.g., coordinate graph, complexity curves, graph data structure, tree hierarchy, state machine, or workflow layout). DO NOT output unreadable ai-image diffusion banners.
  - Formal definitions and formulas using clean readable symbols (δ, θ, λ, ≤, ≥, ≠, →, x², √(n))
  - Step-by-step algorithms, mechanics, or proofs
  - Complete walkthroughs of all instructor examples (preserve specific numbers, examples, or demonstration points)
  - Implementation or Analytical Walkthrough: Include a runnable code block (Python or C++) ONLY if the lecture is genuinely teaching programming/software. If it is a non-coding topic (e.g. biology, history, general math, economics), explain the step-by-step analytical or physical process instead — DO NOT fabricate code.
  - > ⚠️ **Edge Cases & Common Traps**
- Include detailed comparison tables and key technical definitions.
- Write in full academic depth as if preparing an authoritative textbook chapter from this lecture.

Structure:
# Detailed Lecture Notes: ${title}
## 1. Introduction & Learning Goals [0:00]
[Provide a crisp introduction and learning roadmap. DO NOT output unreadable ai-image diffusion banners.]
## 2. [First Major Topic Name] [MM:SS]
### Concept Overview & Deep Intuition
> 💡 **Core Intuition**: [Intuitive explanation]
### Concept Visualization
[Insert self-contained inline SVG coordinate graph, tree, network graph, or workflow diagram]
### Formal Definitions & Equations (readable symbols)
### Step-by-Step Procedure / Mechanism
### Implementation / Analytical Walkthrough
[Provide code ONLY if this is a programming/coding lecture; otherwise explain the analytical steps/proof]
### Instructor Example Walkthrough (step-by-step)
### Traps & Nuances
> ⚠️ **Common Mistakes**: [Edge cases]
## 3. [Second Major Topic Name] [MM:SS]
... [Continue with a dedicated section for EVERY topic discussed in the lecture]
## Comprehensive Summary Comparison Table
| Topic / Concept | Primary Role | Key Property | Best For | Trade-offs |
## Exam-Focused Points & Essential Traps
> 🎯 **Exam Strategy**: [High yield examination pointers]
***
## Quick Revision (Key Takeaways)`;
  }


  return `${structureGuide}

LECTURE TITLE: "${title}"

SOURCE MATERIAL (Transcript & Board Observations):
==================================================
${lectureFeed}
==================================================

Generate beautifully formatted, academic study notes in ${lang.toUpperCase()} now:`;
}

// ── Timeline & Flashcards Generator ───────────────────────────────────────────
async function generateTimelineAndFlashcards(apiKey, title, feedText, preferredModel) {
  const prompt = `From the following lecture material for "${title}", generate:
1. A chapter timeline with start timestamps and topics.
2. 5-7 concise flashcard study notes (key definitions or formulas).

Return ONLY a valid JSON object matching this schema:
{
  "chapters": [
    { "timestamp": 0, "time_str": "0:00", "title": "Introduction" }
  ],
  "sticky": [
    { "text": "Key concept definition here", "color": "#fef08a" }
  ]
}

LECTURE SOURCE:
${feedText.slice(0, 8000)}`;

  try {
    const res = await callGeminiApi(apiKey, prompt, 'You are an educational curriculum assistant. Output strictly valid JSON.', preferredModel);
    if (res.ok && res.text) {
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
    }
  } catch (e) {
    console.warn('[RecallAI] Timeline/sticky generation notice:', e);
  }

  return { chapters: [], sticky: [] };
}

// ── Sync with Local Flask Web Platform (http://localhost:5000) ────────────────
async function syncToLocalFlaskPlatform(payload) {
  const urls = ['http://localhost:5000/api/sync-lecture', 'http://127.0.0.1:5000/api/sync-lecture'];

  for (const u of urls) {
    try {
      const res = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const d = await res.json();
        console.log('[RecallAI] ✅ Synced to local web platform:', d);
        return { ok: true, synced: true, url: u };
      }
    } catch (e) {
      // Local server might not be running or on different port - graceful degradation
    }
  }

  return { ok: true, synced: false, reason: 'Local platform offline or busy' };
}

// ── Background Transcript & Player Scrapers ──────────────────────────────────
async function fetchTranscriptInBackground(url) {
  try {
    const res = await fetch(url, {
      headers: { 'Accept': 'text/xml,application/json,*/*', 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function fetchPlayerResponseForVideo(videoId) {
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (!res.ok) return { ok: false, tracks: [] };
    const html = await res.text();
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*(?:var|const|let)\s+\w+\s*=|<\/script>)/s);
    if (!match) return { ok: false, tracks: [] };
    const playerResponse = JSON.parse(match[1]);
    const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    return { ok: true, tracks };
  } catch (e) {
    return { ok: false, tracks: [], error: e.message };
  }
}

async function verifyApiKey(apiKey) {
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, { method: 'GET' });
    const data = await res.json();
    if (res.ok && data.models) return { ok: true, count: data.models.length };
    if (data.error) return { ok: false, error: data.error.message || 'Invalid API Key' };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: 'Network error: ' + err.message };
  }
}

// ── Complete Pipeline Orchestrator ───────────────────────────────────────────
async function runFullLecturePipeline(data) {
  const {
    apiKey,
    videoId,
    title,
    rawTranscript,
    keyframes,
    currentLevel = 'overview',
    currentLang = 'english',
    model
  } = data;

  if (!apiKey) {
    return { ok: false, error: 'Gemini API key is required.' };
  }

  console.log(`[RecallAI Pipeline] Starting pipeline for "${title}" (${videoId})`);

  // Step 1: Clean & reconstruct transcript
  const cleanSentences = cleanAndReconstructTranscript(rawTranscript);
  console.log(`[RecallAI Pipeline] Step 1: Cleaned into ${cleanSentences.length} sentences`);

  // Step 2: Visual keyframe analysis via Gemini Vision
  let visualNotes = [];
  if (Array.isArray(keyframes) && keyframes.length > 0) {
    console.log(`[RecallAI Pipeline] Step 2: Analyzing ${keyframes.length} keyframes with Gemini Vision...`);
    visualNotes = await analyzeKeyframesWithVision(apiKey, keyframes, model);
    console.log(`[RecallAI Pipeline] Step 2 complete: ${visualNotes.length} frames analyzed`);
  }

  // Step 3: Combine lecture multimodal data
  let feedText = '';
  let combinedList = [];
  if (cleanSentences.length > 0) {
    const comb = combineLectureData(cleanSentences, visualNotes);
    combinedList = comb.combinedList;
    feedText = comb.feedText;
  } else {
    // Fallback if no transcript
    feedText = `LECTURE TITLE: ${title}\n(Visual or outline notes)\n` +
      visualNotes.map(v => `[${Math.floor(v.timestamp)}s]: ${v.visual_notes}`).join('\n');
  }

  // Step 4: Generate target notes with academic prompt
  console.log(`[RecallAI Pipeline] Step 3: Generating ${currentLevel} notes in ${currentLang}...`);
  const prompt = getNoteLevelPrompt(currentLevel, currentLang, title, feedText);
  const noteRes = await callGeminiApi(apiKey, prompt, SYSTEM_PROMPT, model);

  if (!noteRes.ok) {
    return { ok: false, error: noteRes.error };
  }

  const generatedNote = noteRes.text;
  const modelUsed = noteRes.modelUsed;

  // Step 5: Generate timeline chapters & sticky notes
  console.log(`[RecallAI Pipeline] Step 4: Generating chapter timeline & flashcards...`);
  const extraAssets = await generateTimelineAndFlashcards(apiKey, title, feedText, model);

  // Cache to chrome.storage.local
  const cachedNotes = {
    overview: {},
    summary: {},
    detailed: {}
  };
  cachedNotes[currentLevel][currentLang] = generatedNote;

  chrome.storage.local.set({
    rc_video_id: videoId,
    rc_video_title: title,
    rc_clean_transcript: cleanSentences,
    rc_combined_lecture: combinedList,
    rc_timeline: extraAssets.chapters,
    rc_sticky: extraAssets.sticky,
    rc_cached_notes: cachedNotes,
    rc_model_used: modelUsed
  });

  // Step 6: Sync with local Flask web platform if running
  const syncPayload = {
    title,
    notes: {
      [currentLevel]: {
        [currentLang]: generatedNote
      }
    },
    timeline: extraAssets.chapters,
    sticky: extraAssets.sticky,
    combined: combinedList,
    transcript: cleanSentences
  };

  syncToLocalFlaskPlatform(syncPayload);

  return {
    ok: true,
    note: generatedNote,
    modelUsed,
    timeline: extraAssets.chapters,
    sticky: extraAssets.sticky,
    cleanSentenceCount: cleanSentences.length,
    visualCount: visualNotes.length
  };
}

// ── Message Listener ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request.action === 'OPEN_SIDE_PANEL') {
    if (sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: err.message }));
      return true;
    }
  }

  if (request.action === 'RUN_LECTURE_PIPELINE') {
    runFullLecturePipeline(request)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'CALL_GEMINI') {
    const { apiKey, prompt, systemPrompt, model } = request;
    if (!apiKey) {
      sendResponse({ ok: false, error: 'No Gemini API key provided.' });
      return false;
    }
    callGeminiApi(apiKey, prompt, systemPrompt, model)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'FETCH_TRANSCRIPT_URL') {
    fetchTranscriptInBackground(request.url)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'FETCH_CAPTION_TRACKS') {
    fetchPlayerResponseForVideo(request.videoId)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, tracks: [], error: err.message }));
    return true;
  }

  if (request.action === 'TEST_GEMINI_KEY') {
    verifyApiKey(request.apiKey)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'SYNC_LOCAL_APP') {
    syncToLocalFlaskPlatform(request.payload)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (request.action === 'DOWNLOAD_FILE') {
    let downloadUrl = request.url;
    if (!downloadUrl && request.text) {
      const mimeType = request.mimeType || 'text/plain;charset=utf-8';
      const base64Content = btoa(unescape(encodeURIComponent(request.text)));
      downloadUrl = `data:${mimeType};base64,${base64Content}`;
    }

    chrome.downloads.download({
      url: downloadUrl,
      filename: request.filename || 'download',
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.warn('[RecallAI] chrome.downloads error:', chrome.runtime.lastError);
        sendResponse({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ ok: true, downloadId });
      }
    });
    return true;
  }
});
