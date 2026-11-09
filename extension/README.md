# ⚡ RecallAI — YouTube Parallel Lecture Notes Chrome Extension

An AI-powered browser extension that generates structured lecture notes **in parallel while you watch YouTube videos**, matching the exact format and design of the RecallAI learning platform.

---

## ✨ Features

- 🔴 **Live Parallel Mode**: Real-time note generation synchronized to your video timestamp as you watch.
- 🎯 **3 Note Depth Levels**:
  - **Overview (Level 1)**: 2–5 min quick overview (Main Idea, Key Concepts, Takeaways).
  - **Summary (Level 2)**: 5–15 min revision summary (Core explanations, definitions, formulas).
  - **Detailed (Level 3)**: Comprehensive lecture notes following the lecture's sequence.
- 🌐 **3 Languages**:
  - English
  - हिन्दी (Hindi)
  - Hinglish
- ✍️ **Handwritten View**: Toggle handwritten font mode with ruled notebook paper aesthetics.
- ⏱️ **Interactive Timestamps**: Click any `[MM:SS]` timestamp inside the notes to immediately jump the YouTube video to that moment!
- 📌 **Dual Experience**:
  - **In-Page Companion Sidebar**: Clean docked companion directly inside YouTube watch pages.
  - **Chrome Native Side Panel**: Docked alongside the browser window using Chrome's Side Panel API.
- 🎨 **Scope 2: Student Ownership Notes Studio (Notion • Obsidian • Google Docs • Digital Whiteboard)**:
  - **Inline Rich-Text Editing**: Direct Google Docs / Notion block editing for definitions, explanations, formulas, examples, and summaries.
  - **Drag-and-Drop Section Rearranging**: Notion-style modular cards with drag handles (`⋮⋮`), move up/down controls, and live table of contents sync.
  - **Obsidian Concept Highlighting**: Floating multi-color highlighter toolbar (🟡 Key Concept, 🟢 Exam Yield, 🌸 Definition, 🔷 Formula, 🟠 Doubt) with margin notes and live concept index.
  - **Digital Whiteboard & Handwritten Diagrams**: High-precision HTML5 canvas with pen, marker, eraser, geometric shapes (arrows, lines, rectangles, circles), grid patterns, and 1-click diagram embedding into notes.
  - **Classmate Collaboration & Sharing**: Export self-contained standalone `.html` notebooks (openable in any browser without dependencies), study pack `.json`, copy Markdown summaries, and academic PDF printing.
- 📋 **Export Options**: 1-click copy to clipboard, interactive HTML, JSON study pack, and `.md` file download.
- 🔑 **Direct Gemini Integration**: Note generation, visual analysis, practice tools, and note Q&A use your Gemini API key.

---

## 🚀 How to Install in Chrome / Edge / Brave

1. Open your browser and navigate to the Extensions page:
   - **Google Chrome**: `chrome://extensions`
   - **Microsoft Edge**: `edge://extensions`
   - **Brave Browser**: `brave://extensions`
2. Turn ON **"Developer mode"** in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the `extension` folder from this repository (or the folder where you cloned/downloaded this repo).
5. The **RecallAI — YouTube Parallel Lecture Notes** extension is now installed! 🎉
6. *(Optional)* Click the puzzle piece icon in Chrome's toolbar and **pin** RecallAI for 1-click access.

---

## 🔑 Setup Your Gemini API Key

1. Click the **RecallAI** extension icon in your toolbar, or click the **🔑 icon** in the sidebar.
2. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in.
3. Click **"Create API Key"**, enter a name, and create the key.
4. Copy the key immediately. Gemini keys usually start with `AIza` and may only be shown in full once.
5. Paste it into RecallAI and click **"Verify & Save"**. The key is stored locally in your browser.

## 💬 Ask AI About Your Notes

After generating notes, click **"Ask AI"** in the side panel. The assistant automatically uses the currently selected level and language as its reference, so you can ask for explanations, examples, or clarification without pasting the notes.

- **Gemini** is used for note generation, visual analysis, practice tools, and note Q&A. The key is stored locally in the extension.
- Answers are instructed to stay grounded in the selected notes and to say when the notes do not contain enough information.

---

## 🎬 How to Use

1. Open any lecture, tutorial, or educational video on [YouTube](https://www.youtube.com).
2. Look for the floating **"⚡ RecallAI Notes"** badge in the bottom-right corner of the screen and click it.
3. Choose your desired:
   - **Depth**: `Overview`, `Summary`, or `Detailed`
   - **Language**: `English`, `हिन्दी`, or `Hinglish`
4. **Choose your mode**:
   - Click **"✨ Generate Notes for Video"** for instant structured notes.
   - Click **"🔴 Live Parallel Mode"** to take notes section-by-section as the video plays!
5. Toggle **✍️ Handwritten** to see the notes rendered in handwriting style.
6. Click any timestamp like `⏱️ 04:15` to seek the video to that exact second.
7. Click **"📋 Copy"** or **"💾 Save .md"** to export your study notes.
8. Click **"Ask AI"** to discuss the generated note with Gemini.
