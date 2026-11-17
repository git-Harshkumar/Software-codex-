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
  'gemini-2.5-flash',        // Primary high quality
  'gemini-2.5-flash-lite',   // High speed, separate capacity pool
  'gemini-flash-latest',     // Latest flash
  'gemini-flash-lite-latest',// Latest flash lite
  'gemini-3-flash-preview',  // Next-gen flash preview
  'gemini-2.5-pro',          // Pro tier fallback
  'gemini-pro-latest'        // Latest pro
];

const sleepMs = ms => new Promise(resolve => setTimeout(resolve, ms));

// ── Gemini API Caller with Fallback, Retry & Multimodal Vision Support ────────
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
    // Up to 2 attempts per model to ride out temporary 503/429 spikes
    for (let attempt = 1; attempt <= 2; attempt++) {
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
          const errMsg = data.error?.message || `HTTP ${res.status}`;
          lastError = errMsg;
          console.warn(`[RecallAI] ${model} (attempt ${attempt}) notice:`, errMsg);

          // If high demand or rate limit, wait briefly and retry or cascade
          if (res.status === 503 || res.status === 429 || /high demand|capacity|rate limit|quota|busy/i.test(errMsg)) {
            if (attempt === 1) {
              await sleepMs(1200);
              continue;
            }
          }
          break; // Move to next model
        }

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          return { ok: true, text, modelUsed: model };
        }

        lastError = 'Empty response from Gemini.';
      } catch (err) {
        lastError = err.message;
        console.warn(`[RecallAI] Network error with ${model}:`, err);
        break;
      }
    }
  }

  return { ok: false, error: lastError || 'All Gemini models failed. Please try again.' };
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
     > **Core Intuition & Mental Model**: [Vivid real-world analogy or geometric intuition]
   - Highlight subtle traps and common misunderstandings:
     > **Common Mistakes & Edge Cases**: [Pitfalls students often make]
   - Add high-yield examination tips:
     > **Exam Strategy & Key Takeaways**: [How this topic is tested in exams]

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
- STRICT: DO NOT use any emojis anywhere in the notes. Maintain a clean, human-crafted academic tone.

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
> **Core Intuition**: [High-level mental model]
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
> **Core Intuition**: [Mental model]
## 3. Implementation / Mechanism Walkthrough
[If the lecture is about programming/algorithms, provide a fully commented, runnable code implementation with test case. If the lecture is NON-CODING (e.g. biology, history, math theory, economics), provide the step-by-step analytical or biological/physical mechanism instead — STRICTLY DO NOT force code.]
## 4. Key Examples & Formulations (use readable symbols: δ, θ, ≤, ≥, O(n))
## 5. Important Traps & Edge Cases
> **Common Mistakes**: [Key traps]
## 6. Summary Comparison Table
| Feature / Concept | Primary Role | Key Property | Trade-offs / Insights |
## 7. Exam Strategy
> **Exam Strategy**: [Exam pointers]
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
  - > **Core Intuition & Mental Model** callout box
  - AI-GENERATED VECTOR DIAGRAM: Include a self-contained inline vector <svg viewBox="0 0 650 220" ...> diagram (e.g., coordinate graph, complexity curves, graph data structure, tree hierarchy, state machine, or workflow layout). DO NOT output unreadable ai-image diffusion banners.
  - Formal definitions and formulas using clean readable symbols (δ, θ, λ, ≤, ≥, ≠, →, x², √(n))
  - Step-by-step algorithms, mechanics, or proofs
  - Complete walkthroughs of all instructor examples (preserve specific numbers, examples, or demonstration points)
  - Implementation or Analytical Walkthrough: Include a runnable code block (Python or C++) ONLY if the lecture is genuinely teaching programming/software. If it is a non-coding topic (e.g. biology, history, general math, economics), explain the step-by-step analytical or physical process instead — DO NOT fabricate code.
  - > **Edge Cases & Common Traps**
- Include detailed comparison tables and key technical definitions.
- Write in full academic depth as if preparing an authoritative textbook chapter from this lecture.

Structure:
# Detailed Lecture Notes: ${title}
## 1. Introduction & Learning Goals [0:00]
[Provide a crisp introduction and learning roadmap. DO NOT output unreadable ai-image diffusion banners.]
## 2. [First Major Topic Name] [MM:SS]
### Concept Overview & Deep Intuition
> **Core Intuition**: [Intuitive explanation]
### Concept Visualization
[Insert self-contained inline SVG coordinate graph, tree, network graph, or workflow diagram]
### Formal Definitions & Equations (readable symbols)
### Step-by-Step Procedure / Mechanism
### Implementation / Analytical Walkthrough
[Provide code ONLY if this is a programming/coding lecture; otherwise explain the analytical steps/proof]
### Instructor Example Walkthrough (step-by-step)
### Traps & Nuances
> **Common Mistakes**: [Edge cases]
## 3. [Second Major Topic Name] [MM:SS]
... [Continue with a dedicated section for EVERY topic discussed in the lecture]
## Comprehensive Summary Comparison Table
| Topic / Concept | Primary Role | Key Property | Best For | Trade-offs |
## Exam-Focused Points & Essential Traps
> **Exam Strategy**: [High yield examination pointers]
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
function parseChaptersFallback(text) {
  if (!text) return [];
  const results = [];
  const seenSecs = new Set();

  // Pattern: [01:23] or 01:23 or 1:23:45 followed by title
  const regex = /(?:^|\n)\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?)\s*[-–—:]?\s*(.+?)(?=\n|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const timeStr = match[1];
    const title = match[2].trim().replace(/^[-–—:]\s*/, '');
    const parts = timeStr.split(':').map(Number);
    let sec = 0;
    if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) sec = parts[0] * 60 + parts[1];

    if (!seenSecs.has(sec) && title.length > 1) {
      seenSecs.add(sec);
      results.push({
        timestamp: sec,
        time_str: timeStr,
        title: title,
        summary: `Lecture section starting at ${timeStr}`
      });
    }
  }

  return results.sort((a, b) => a.timestamp - b.timestamp);
}

async function generateTimelineAndFlashcards(apiKey, title, feedText, existingChapters, preferredModel) {
  let chaptersHint = '';
  if (existingChapters && String(existingChapters).trim().length > 0) {
    chaptersHint = `\nExisting Video Chapters/Markers detected:\n${String(existingChapters).slice(0, 3000)}\nUse these timestamps and topics to make the timeline accurate.`;
  }

  const prompt = `From the following lecture material for "${title}", generate:
1. An important chapter timeline with accurate start timestamps (in seconds and MM:SS) and clear, descriptive topic titles covering the entire lecture.
2. 5-7 concise flashcard study notes (key definitions, theorems, or formulas).

Return ONLY a valid JSON object matching this schema:
{
  "chapters": [
    { "timestamp": 0, "time_str": "00:00", "title": "Introduction & Goals", "summary": "Core questions and overview" },
    { "timestamp": 255, "time_str": "04:15", "title": "Main Topic / Theorem", "summary": "Detailed concept explanation" }
  ],
  "sticky": [
    { "text": "Key concept definition here", "color": "#fef08a" }
  ]
}
${chaptersHint}

LECTURE SOURCE:
${feedText.slice(0, 9000)}`;

  try {
    const res = await callGeminiApi(apiKey, prompt, 'You are an educational curriculum assistant. Output strictly valid JSON.', preferredModel);
    if (res.ok && res.text) {
      const match = res.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
          // Normalize timestamps
          parsed.chapters = parsed.chapters.map(c => {
            const sec = typeof c.timestamp === 'number' ? c.timestamp : 0;
            const m = Math.floor(sec / 60);
            const s = sec % 60;
            const time_str = c.time_str || `${m}:${s < 10 ? '0' : ''}${s}`;
            return {
              timestamp: sec,
              time_str: time_str,
              title: c.title || 'Topic Segment',
              summary: c.summary || `Lecture concept at ${time_str}`
            };
          });
          return parsed;
        }
      }
    }
  } catch (e) {
    console.warn('[RecallAI] Timeline/sticky generation notice:', e);
  }

  // Fallback: parse from existing chapters or feed text
  let fallbackChapters = parseChaptersFallback(existingChapters);
  if (fallbackChapters.length === 0) {
    fallbackChapters = parseChaptersFallback(feedText);
  }
  if (fallbackChapters.length === 0) {
    fallbackChapters = [
      { timestamp: 0, time_str: "00:00", title: title || "Lecture Start", summary: "Introduction to the lecture" }
    ];
  }

  return { chapters: fallbackChapters, sticky: [] };
}

// ── Sync with Web Platform (AWS Cloud & Local Flask) ────────────────
async function syncToLocalFlaskPlatform(payload) {
  const urls = [
    'http://100.58.169.40/api/sync-lecture',
    'http://127.0.0.1:5000/api/sync-lecture',
    'http://localhost:5000/api/sync-lecture'
  ];

  for (const u of urls) {
    try {
      const res = await fetch(u, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const d = await res.json();
        console.log('[RecallAI] Synced to web platform:', d);
        return { ok: true, synced: true, url: u };
      }
    } catch (e) {
      // Server might not be running or on different port - graceful degradation
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
  if (!videoId) return { ok: false, tracks: [] };

  // Strategy 1: YouTube InnerTube Web client (Direct API — completely bypasses HTML scraping and CSP)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'X-YouTube-Client-Name': '1',
        'X-YouTube-Client-Version': '2.20240101.00.00'
      },
      body: JSON.stringify({
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: 'WEB',
            clientVersion: '2.20240101.00.00'
          }
        },
        videoId: videoId
      })
    });
    if (res.ok) {
      const data = await res.json();
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        console.log(`[RecallAI BG] InnerTube WEB found ${tracks.length} caption tracks for ${videoId}`);
        return { ok: true, tracks };
      }
    }
  } catch (e) {
    console.warn('[RecallAI BG] InnerTube WEB notice:', e);
  }

  // Strategy 2: YouTube InnerTube Android client (lightweight fallback)
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 14; en_US)'
      },
      body: JSON.stringify({
        context: {
          client: {
            hl: 'en',
            gl: 'US',
            clientName: 'ANDROID',
            clientVersion: '19.09.37',
            androidSdkVersion: 34
          }
        },
        videoId: videoId
      })
    });
    if (res.ok) {
      const data = await res.json();
      const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        console.log(`[RecallAI BG] InnerTube ANDROID found ${tracks.length} caption tracks for ${videoId}`);
        return { ok: true, tracks };
      }
    }
  } catch (e) {
    console.warn('[RecallAI BG] InnerTube ANDROID notice:', e);
  }

  // Strategy 3: Watch page HTML scrape & InnerTube API Key extraction
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8'
      }
    });
    if (res.ok) {
      const html = await res.text();

      // Check if page contains INNERTUBE_API_KEY
      const keyMatch = html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/);
      if (keyMatch && keyMatch[1]) {
        try {
          const apiRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${keyMatch[1]}&prettyPrint=false`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify({
              context: { client: { hl: 'en', gl: 'US', clientName: 'WEB', clientVersion: '2.20240101.00.00' } },
              videoId: videoId
            })
          });
          if (apiRes.ok) {
            const apiData = await apiRes.json();
            const tracks = apiData.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length > 0) {
              console.log(`[RecallAI BG] InnerTube with extracted API key found ${tracks.length} caption tracks for ${videoId}`);
              return { ok: true, tracks };
            }
          }
        } catch (e2) {}
      }

      // Regex matching on unescaped HTML
      const cleanHtml = html.replace(/\\"/g, '"').replace(/\\\//g, '/');
      let m = cleanHtml.match(/"captionTracks"\s*:\s*(\[\s*\{[\s\S]*?\}\s*\])/);
      if (!m) {
        m = cleanHtml.match(/"captionTracks"\s*:\s*(\[[^\]]+\])/);
      }
      if (m) {
        const tracks = JSON.parse(m[1]);
        if (Array.isArray(tracks) && tracks.length > 0) {
          console.log(`[RecallAI BG] HTML scrape found ${tracks.length} caption tracks for ${videoId}`);
          return { ok: true, tracks };
        }
      }
    }
  } catch (e) {
    console.warn('[RecallAI BG] HTML fetch notice:', e);
  }

  return { ok: false, tracks: [] };
}

function parseTranscriptRaw(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  const trimmed = rawText.trim();

  // 1. JSON3 format
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed);
      if (Array.isArray(data.events)) {
        const lines = [];
        for (const ev of data.events) {
          if (!ev.segs || ev.segs.length === 0) continue;
          const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim();
          if (text) {
            lines.push({
              start: (ev.tStartMs || 0) / 1000,
              duration: (ev.dDurationMs || 0) / 1000,
              text: text
            });
          }
        }
        if (lines.length > 0) return lines;
      }
    } catch (e) {}
  }

  // 2. XML timedtext format
  if (trimmed.includes('<text')) {
    const items = [];
    const regex = /<text\s+start="([\d\.]+)"(?:\s+dur="([\d\.]+)")?[^>]*>([\s\S]*?)<\/text>/gi;
    let m;
    while ((m = regex.exec(trimmed)) !== null) {
      const start = parseFloat(m[1] || '0');
      const duration = parseFloat(m[2] || '3');
      const text = m[3]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n/g, ' ')
        .trim();
      if (text) {
        items.push({ start, duration, text });
      }
    }
    if (items.length > 0) return items;
  }

  return [];
}

async function fetchFullTranscriptForVideo(videoId) {
  if (!videoId) return [];
  const trackRes = await fetchPlayerResponseForVideo(videoId);
  const tracks = trackRes?.tracks || [];
  if (tracks.length === 0) return [];

  // Prioritize: English manual, English ASR, Hindi manual, Hindi ASR, then any
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
        const res = await fetch(u, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });
        if (!res.ok) continue;
        const text = await res.text();
        const parsed = parseTranscriptRaw(text);
        if (parsed.length > 0) {
          console.log(`[RecallAI BG] Retrieved ${parsed.length} caption lines for ${videoId} (${track.name?.simpleText || track.languageCode})`);
          return parsed;
        }
      } catch (e) {}
    }
  }

  return [];
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
    chapters = '',
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
  const extraAssets = await generateTimelineAndFlashcards(apiKey, title, feedText, chapters, model);

  // Cache to chrome.storage.local (per-video isolation)
  let videoCachedNotes = {
    overview: {},
    summary: {},
    detailed: {}
  };
  try {
    const existing = await chrome.storage.local.get([`rc_cached_notes_${videoId}`]);
    if (existing && existing[`rc_cached_notes_${videoId}`]) {
      videoCachedNotes = existing[`rc_cached_notes_${videoId}`];
    }
  } catch (e) {}
  if (!videoCachedNotes[currentLevel]) videoCachedNotes[currentLevel] = {};
  videoCachedNotes[currentLevel][currentLang] = generatedNote;

  chrome.storage.local.set({
    rc_video_id: videoId,
    rc_video_title: title,
    rc_clean_transcript: cleanSentences,
    rc_combined_lecture: combinedList,
    rc_timeline: extraAssets.chapters,
    rc_sticky: extraAssets.sticky,
    rc_cached_notes: videoCachedNotes,
    [`rc_cached_notes_${videoId}`]: videoCachedNotes,
    [`rc_timeline_${videoId}`]: extraAssets.chapters,
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

  if (request.action === 'GET_VIDEO_TRANSCRIPT') {
    fetchFullTranscriptForVideo(request.videoId)
      .then(transcript => sendResponse({ ok: true, transcript }))
      .catch(err => sendResponse({ ok: false, transcript: [], error: err.message }));
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

  if (request.action === 'OPEN_PRINT_PAGE') {
    chrome.storage.local.set({ rc_print_data: request.data, rc_studio_data: request.data }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('print.html') }, (tab) => {
        sendResponse({ ok: true, tabId: tab?.id });
      });
    });
    return true;
  }

  if (request.action === 'OPEN_STUDIO_PAGE' || request.action === 'OPEN_NOTES_STUDIO') {
    const data = request.data || {};
    chrome.storage.local.set({ rc_studio_data: data, rc_print_data: data }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('studio.html') }, (tab) => {
        sendResponse({ ok: true, tabId: tab?.id });
      });
    });
    return true;
  }

  // ── Practice Session: Score MCQ + Fill-in-Blank ───────────────────────────
  if (request.action === 'SCORE_MCQ_FIB') {
    (async () => {
      try {
        const { mcqAnswers, fibAnswers } = request;
        const sessionData = await chrome.storage.session.get(['rc_practice_answers']);
        const stored = sessionData.rc_practice_answers;

        if (!stored) {
          sendResponse({ ok: false, error: 'No practice session found. Please start a new session.' });
          return;
        }

        // Score MCQ
        const mcqResults = (mcqAnswers || []).map((userAns, i) => {
          const correctIdx = stored.mcq[i] ?? -1;
          return { correct: userAns === correctIdx, selectedIdx: userAns, correctIdx };
        });

        // Score Fill-in-blank (case-insensitive, trimmed, partial match allowed)
        const fibResults = (fibAnswers || []).map((userAns, i) => {
          const correctAns = stored.fill_blanks[i] || '';
          const normalizedUser = (userAns || '').toLowerCase().trim();
          const normalizedCorrect = correctAns.toLowerCase().trim();
          const correct = normalizedUser === normalizedCorrect ||
            normalizedUser.includes(normalizedCorrect) ||
            normalizedCorrect.includes(normalizedUser);
          return { correct, userAns, correctAns };
        });

        sendResponse({ ok: true, mcqResults, fibResults });
      } catch (err) {
        sendResponse({ ok: false, error: err.message });
      }
    })();
    return true;
  }

  // ── Practice Session: Generate Questions ──────────────────────────────────
  if (request.action === 'GENERATE_PRACTICE_QUESTIONS') {
    (async () => {
      try {
        const { notesMarkdown, level, lang } = request;
        const stored = await chrome.storage.local.get(['gemini_api_key']);
        const apiKey = stored.gemini_api_key;
        if (!apiKey) {
          sendResponse({ ok: false, error: 'No Gemini API key configured.' });
          return;
        }

        const systemPrompt = `You are an expert exam question setter for university students.
Generate a comprehensive practice quiz from the provided lecture notes.
Return ONLY a valid JSON object — no markdown fences, no explanation, no extra text.
The JSON must follow this EXACT schema:
{
  "mcq": [
    { "q": "Question text?", "options": ["Option A", "Option B", "Option C", "Option D"], "answer": 0 }
  ],
  "fill_blanks": [
    { "sentence": "The ___ is the basic unit of life.", "answer": "cell", "before": "The ", "after": " is the basic unit of life." }
  ],
  "long_answer": [
    { "q": "Explain the concept in detail...", "hint": "Think about...", "rubric": "A good answer should cover: key point 1, key point 2, key point 3", "model_answer": "Complete, comprehensive, and accurate model solution answering the question with all critical concepts, steps, and explanations." }
  ]
}
Rules:
- mcq: exactly 10 questions, 4 options each, answer = index (0-3) of correct option
- fill_blanks: exactly 5 sentences, each with one blank (___), answer = the missing word/phrase, before/after = sentence parts split at blank
- long_answer: exactly 3 open-ended questions requiring 200-400 word answers. Each question MUST provide both a 'rubric' (key points to check) and a detailed 'model_answer' (the complete, correct, high-scoring answer)
- Questions must be directly based on the provided notes content
- Do NOT invent information not present in the notes
- Make questions progressively more challenging`;

        const userPrompt = `Generate a practice quiz from these ${level.toUpperCase()} lecture notes (${lang}):\n\n${notesMarkdown}`;

        const result = await callGeminiApi(apiKey, userPrompt, systemPrompt);
        if (!result.ok) {
          sendResponse({ ok: false, error: result.error });
          return;
        }

        // Parse JSON, strip markdown fences if Gemini added them despite instructions
        let jsonText = result.text.trim();
        jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
        const parsed = JSON.parse(jsonText);

        // Validate structure
        if (!parsed.mcq || !parsed.fill_blanks || !parsed.long_answer) {
          throw new Error('Invalid question structure returned from AI.');
        }

        // Store full data (with answers) securely in session storage
        await chrome.storage.session.set({
          rc_practice_answers: {
            mcq: parsed.mcq.map(q => q.answer),
            fill_blanks: parsed.fill_blanks.map(q => q.answer.toLowerCase().trim()),
            long_rubrics: parsed.long_answer.map(q => q.rubric),
            long_answers: parsed.long_answer.map(q => q.model_answer || q.rubric)
          }
        });

        // Strip answers before sending to sidepanel (pass model_answer so UI can show it in results or study peek)
        const questionsForUI = {
          mcq: parsed.mcq.map(q => ({ q: q.q, options: q.options })),
          fill_blanks: parsed.fill_blanks.map(q => ({ before: q.before, after: q.after })),
          long_answer: parsed.long_answer.map(q => ({
            q: q.q,
            hint: q.hint,
            rubric: q.rubric,
            model_answer: q.model_answer || q.rubric
          }))
        };

        sendResponse({ ok: true, questions: questionsForUI });
      } catch (err) {
        console.error('[RecallAI Practice] Generate error:', err);
        sendResponse({ ok: false, error: err.message || 'Failed to generate practice questions.' });
      }
    })();
    return true;
  }

  // ── Practice Session: Evaluate Long Answers via Gemini Vision ─────────────
  if (request.action === 'EVALUATE_LONG_ANSWERS') {
    (async () => {
      try {
        const { questions, images } = request; // questions: [{q, hint}], images: [base64DataUrl]
        const stored = await chrome.storage.local.get(['gemini_api_key']);
        const apiKey = stored.gemini_api_key;
        if (!apiKey) {
          sendResponse({ ok: false, error: 'No Gemini API key configured.' });
          return;
        }

        // Retrieve rubrics & model answers from session storage
        const sessionData = await chrome.storage.session.get(['rc_practice_answers']);
        const rubrics = sessionData.rc_practice_answers?.long_rubrics || [];
        const modelAnswers = sessionData.rc_practice_answers?.long_answers || [];

        const evaluations = [];
        for (let i = 0; i < questions.length; i++) {
          const q = questions[i];
          const imageDataUrl = images[i];
          const rubric = rubrics[i] || q.rubric || 'Evaluate based on clarity, accuracy, and depth.';
          const modelAnswer = modelAnswers[i] || q.model_answer || rubric;

          if (!imageDataUrl) {
            evaluations.push({
              score: 0,
              feedback: 'No answer image uploaded for this question.',
              key_points_found: [],
              model_answer: modelAnswer
            });
            continue;
          }

          // Extract base64 data and mime type
          const mimeMatch = imageDataUrl.match(/^data:(image\/[a-z]+);base64,/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
          const base64Data = imageDataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

          const evalPrompt = `You are a university professor evaluating a student's handwritten answer.

Question: ${q.q}
Rubric (key points that should be covered): ${rubric}

The student's handwritten answer is in the attached image. Please:
1. Read the handwritten text carefully
2. Evaluate the answer based on the rubric
3. Score it from 0 to 10
4. Provide 2-3 lines of constructive feedback

Return ONLY valid JSON with no markdown fences:
{"score": <number 0-10>, "feedback": "<2-3 lines of feedback>", "key_points_found": ["<point1>", "<point2>"]}`;

          const contents = [{
            role: 'user',
            parts: [
              { text: evalPrompt },
              { inlineData: { mimeType, data: base64Data } }
            ]
          }];

          try {
            const result = await callGeminiApi(apiKey, contents, null);
            if (!result.ok) {
              evaluations.push({
                score: 0,
                feedback: `AI evaluation failed: ${result.error}`,
                model_answer: modelAnswer
              });
              continue;
            }
            let jsonText = result.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
            const evalData = JSON.parse(jsonText);
            evaluations.push({
              score: Math.min(10, Math.max(0, Number(evalData.score) || 0)),
              feedback: evalData.feedback || 'No feedback provided.',
              key_points_found: evalData.key_points_found || [],
              model_answer: modelAnswer
            });
          } catch (e) {
            evaluations.push({
              score: 0,
              feedback: 'Could not parse AI evaluation response.',
              model_answer: modelAnswer
            });
          }
        }

        sendResponse({ ok: true, evaluations });
      } catch (err) {
        console.error('[RecallAI Practice] Evaluate error:', err);
        sendResponse({ ok: false, error: err.message || 'Failed to evaluate answers.' });
      }
    })();
    return true;
  }

  if (request.action === 'DOWNLOAD_FILE') {
    let downloadUrl = request.url;
    if (!downloadUrl && request.text) {
      const mimeType = request.mimeType || 'text/plain;charset=utf-8';
      // Always use base64 encoding to reliably handle large HTML/MD files
      // encodeURIComponent hits URL length limits for large note documents
      try {
        const base64Content = btoa(unescape(encodeURIComponent(request.text)));
        downloadUrl = `data:${mimeType};base64,${base64Content}`;
      } catch (e) {
        // Last resort: plain encodeURIComponent (may fail for very large files)
        try {
          downloadUrl = `data:${mimeType},${encodeURIComponent(request.text)}`;
        } catch (e2) {
          sendResponse({ ok: false, error: 'Content too large to encode for download.' });
          return true;
        }
      }
    }

    chrome.downloads.download({
      url: downloadUrl,
      filename: request.filename || 'RecallAI_Notes.html',
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

  // ── AWS Cloud DB & In-Extension Search Handlers ───────────────────────────
  if (request.action === 'SAVE_NOTE_TO_AWS') {
    (async () => {
      try {
        const payload = request.payload || {};

        // Always cache chunks in chrome.storage.local for offline search
        try {
          const chunks = chunkNoteLocally(payload);
          if (chunks.length > 0) {
            const s = await chrome.storage.local.get(['rc_note_chunks']);
            const existing = s.rc_note_chunks || {};
            for (const c of chunks) existing[c.chunk_id] = c;
            await chrome.storage.local.set({ rc_note_chunks: existing });
            console.log(`[RecallAI] Cached ${chunks.length} chunks locally for offline search.`);
          }
        } catch (cacheErr) {
          console.warn('[RecallAI] Could not cache chunks locally:', cacheErr);
        }

        const res = await sendToCloudBackend('/api/cloud/save-note', 'POST', payload);
        sendResponse(res);
      } catch (err) {
        console.error('[RecallAI Cloud] Save note error:', err);
        sendResponse({ ok: false, error: err.message || 'Failed to save note to cloud.' });
      }
    })();
    return true;
  }

  if (request.action === 'SEARCH_AWS_NOTES') {
    (async () => {
      try {
        const payload = request.payload || {};
        const stored = await chrome.storage.local.get(['gemini_api_key']);
        if (stored.gemini_api_key && !payload.apiKey) {
          payload.apiKey = stored.gemini_api_key;
        }

        // Try cloud server first
        const res = await sendToCloudBackend('/api/cloud/search', 'POST', payload);
        if (res.ok) {
          sendResponse(res);
          return;
        }

        // Server unreachable — fall back to chrome.storage.local cached chunks
        console.log('[RecallAI] Cloud unreachable, searching local chunk cache...');
        const localRes = await searchLocalChunks(payload.query, payload.videoId || null);
        sendResponse(localRes);
      } catch (err) {
        console.error('[RecallAI Cloud] Search notes error:', err);
        // Last resort: try local search
        try {
          const localRes = await searchLocalChunks((request.payload || {}).query, null);
          sendResponse(localRes);
        } catch (e2) {
          sendResponse({ ok: false, error: err.message || 'Failed to search notes.' });
        }
      }
    })();
    return true;
  }

  if (request.action === 'GET_SAVED_LECTURES') {
    (async () => {
      try {
        const res = await sendToCloudBackend('/api/cloud/saved-lectures', 'GET');
        sendResponse(res);
      } catch (err) {
        console.error('[RecallAI Cloud] Get saved lectures error:', err);
        sendResponse({ ok: false, error: err.message || 'Failed to list saved lectures.' });
      }
    })();
    return true;
  }
});

// ── AWS Cloud / Backend Communication Helper ──────────────────────────────
const DEFAULT_AWS_EC2_URL = 'http://100.58.169.40';

async function sendToCloudBackend(endpoint, method = 'GET', body = null) {
  let preferredBase = '';
  try {
    const stored = await chrome.storage.local.get(['aws_backend_url']);
    if (stored?.aws_backend_url) {
      preferredBase = stored.aws_backend_url.replace(/\/+$/, '');
    }
  } catch (e) {}

  const candidateBases = [];
  if (preferredBase) candidateBases.push(preferredBase);
  if (!candidateBases.includes(DEFAULT_AWS_EC2_URL)) candidateBases.push(DEFAULT_AWS_EC2_URL);
  if (!candidateBases.includes('http://127.0.0.1:5000')) candidateBases.push('http://127.0.0.1:5000');
  if (!candidateBases.includes('http://localhost:5000')) candidateBases.push('http://localhost:5000');

  let lastError = null;
  for (const base of candidateBases) {
    try {
      const url = `${base}${endpoint}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal
      };
      if (body && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(body);
      }

      const res = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        let errorMsg = `HTTP ${res.status}`;
        try {
          const errJson = JSON.parse(errorText);
          if (errJson.error) errorMsg = errJson.error;
        } catch (e) {
          if (errorText) errorMsg = errorText.slice(0, 100);
        }
        lastError = new Error(errorMsg);
        continue;
      }
      const data = await res.json();
      return { ok: true, ...data };
    } catch (err) {
      lastError = err;
      console.warn(`[RecallAI Cloud] Request to ${base}${endpoint} failed:`, err.message);
      // Try next base candidate
    }
  }

  return {
    ok: false,
    error: lastError ? lastError.message : 'Could not reach backend server. Make sure the server is running.'
  };
}

// ── Local Note Chunker (mirrors cloud_db.py logic for offline use) ────────────
function chunkNoteLocally(payload) {
  const videoId  = payload.videoId || payload.video_id || 'unknown';
  const title    = payload.title   || 'Lecture Video';
  const channel  = payload.channel || '';
  const level    = (payload.level  || 'overview').toLowerCase();
  const lang     = (payload.lang   || 'english').toLowerCase();
  const markdown = payload.note    || payload.markdown || '';

  if (!markdown.trim()) return [];

  const chunks   = [];
  const lines    = markdown.split('\n');
  const headerRe = /^(#{1,3})\s+(.+)$/;
  const tsRe     = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]|\b(\d{1,2}:\d{2})\b/;

  function parseTs(text) {
    const m = text.match(tsRe);
    if (!m) return [0, '00:00'];
    const ts = m[1] || m[2];
    const parts = ts.split(':').map(Number);
    let sec = 0;
    if (parts.length === 2) sec = parts[0] * 60 + parts[1];
    else if (parts.length === 3) sec = parts[0] * 3600 + parts[1] * 60 + parts[2];
    return [sec, ts];
  }

  let heading  = 'Overview & Introduction';
  let curLines = [];
  let curSec   = 0;
  let curTsStr = '00:00';
  let chunkIdx = 0;

  function flushChunk() {
    const content = curLines.join('\n').trim();
    if (content && content.length > 30) {
      const chunkId = `${videoId}_${level}_${lang}_chunk_${chunkIdx}`;
      chunks.push({
        chunk_id: chunkId,
        note_id:  `${videoId}_${level}_${lang}`,
        video_id: videoId, video_title: title, channel,
        topic_heading: heading,
        content, timestamp_sec: curSec, timestamp_str: curTsStr,
        level, lang,
        created_at: new Date().toISOString()
      });
      chunkIdx++;
    }
    curLines = [];
  }

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      flushChunk();
      heading = m[2].trim();
      const [sec, ts] = parseTs(heading);
      if (sec > 0 || ts !== '00:00') { curSec = sec; curTsStr = ts; }
    } else {
      curLines.push(line);
    }
  }
  flushChunk();
  return chunks;
}

// ── Local Chunk Search Engine (searches chrome.storage.local rc_note_chunks) ──
async function searchLocalChunks(query, filterVideoId) {
  if (!query || !query.trim()) return { ok: false, error: 'Query cannot be empty.' };

  const s = await chrome.storage.local.get(['rc_note_chunks']);
  const allChunks = Object.values(s.rc_note_chunks || {});

  if (!allChunks.length) {
    return {
      ok: true, in_context: false, results: [],
      message: 'No notes cached locally yet. Click the ☁️ Save button on any generated note to enable offline search.'
    };
  }

  const stopWords = new Set(['the','a','an','is','are','in','on','at','to','for','of','and','or','what','how']);
  const qLow  = query.trim().toLowerCase();
  const terms = (qLow.match(/\w+/g) || []).filter(w => !stopWords.has(w) && w.length > 2);
  if (!terms.length) terms.push(qLow);

  const scored = [];
  for (const c of allChunks) {
    if (filterVideoId && c.video_id !== filterVideoId) continue;
    const hd = (c.topic_heading || '').toLowerCase();
    const bd = (c.content       || '').toLowerCase();
    let score = 0;
    if (hd.includes(qLow)) score += 15;
    if (bd.includes(qLow)) score += 8;
    for (const t of terms) {
      if (hd.includes(t)) score += 4;
      const cnt = (bd.match(new RegExp('\\b' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g')) || []).length;
      if (cnt > 0) score += Math.min(cnt * 1.5, 6);
    }
    if (score < 1.0) continue;

    let snippet = (c.content || '').slice(0, 240).replace(/\n+/g, ' ');
    for (const t of terms) {
      const idx = bd.indexOf(t);
      if (idx !== -1) {
        const start = Math.max(0, idx - 60);
        const end   = Math.min((c.content || '').length, idx + 200);
        snippet = (start > 0 ? '...' : '') + c.content.slice(start, end).replace(/\n+/g, ' ') + (end < c.content.length ? '...' : '');
        break;
      }
    }
    scored.push({
      chunk_id: c.chunk_id, video_id: c.video_id, video_title: c.video_title,
      channel: c.channel, topic_heading: c.topic_heading,
      timestamp_sec: c.timestamp_sec || 0, timestamp_str: c.timestamp_str || '00:00',
      snippet, full_content: c.content,
      score: Math.round(score * 100) / 100,
      level: c.level, lang: c.lang
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 8);

  if (!top.length) {
    return {
      ok: true, in_context: false, results: [],
      message: `"${query}" was not found in your cached lecture notes.`
    };
  }

  return { ok: true, in_context: true, results: top, total_matches: top.length };
}
