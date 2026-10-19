# AI Lecture Notes Platform

Automatically generates multilingual study notes, short video clips,
and a full web platform from any lecture video.

## Project Structure

```
video2/
├── extension/         RecallAI Chrome Extension (Manifest V3)
├── pipeline/          Processing scripts (frames, transcript, OCR)
├── generators/        Note generation, PDF, translation, shorts
├── notes/
│   ├── json/          JSON note files (input/output)
│   ├── markdown/      Generated markdown notes
│   └── pdf/           Generated PDF notes
├── data/              Transcript & analysis JSON files
├── shorts/            Topic video clips
├── keyframes_final/   Selected lecture keyframes
├── templates/         Flask HTML templates
├── videos/            Source lecture video (not in git)
├── app.py             Web platform (Flask)
├── .env               API keys (never commit!)
├── requirements.txt
└── README.md
```

## ⚡ Chrome Extension (YouTube Parallel Lecture Notes)

You can run the Chrome Extension independently without running any local backend!

1. Open `chrome://extensions` in Chrome, Edge, or Brave.
2. Enable **Developer mode** (top-right corner).
3. Click **Load unpacked** and select the [`extension/`](extension/) directory.
4. Pin RecallAI in your toolbar, enter your free Gemini API key, and open any YouTube video to generate live notes!
5. See [extension/README.md](extension/README.md) for full features & documentation.


## Setup

```bash
pip install -r requirements.txt
cp .env.example .env   # add your GEMINI_API_KEY
```

## Usage

### 1. Generate Notes

```bash
# Quick overview in English
python generators/generate_notes_v2.py --level 1

# Summary in Hindi with exam tips
python generators/generate_notes_v2.py --level 2 --lang Hindi --exam

# Full detailed notes in Hinglish
python generators/generate_notes_v2.py --level 3 --lang Hinglish --examples --formulas
```

### 2. Translate Notes

```bash
python generators/translate_notes.py --input notes/json/notes.json --lang Hindi Spanish French
```

### 3. Generate PDF

```bash
python generators/generate_pdf.py --input notes/json/notes.json
```

### 4. Create Short Clips

```bash
python generators/generate_shorts.py --notes notes/json/notes.json
```

### 5. Run Web Platform

```bash
python app.py
# Open http://localhost:5000
```

## Environment Variables

Create a `.env` file:

```
GEMINI_API_KEY=your_api_key_here
```

## Deploy to AWS (100% Free Tier with Terraform)

You can deploy this platform to an AWS EC2 `t2.micro` instance completely free using the included Terraform configuration:

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform apply
.\deploy.ps1   # On Windows (or ./deploy.sh on Mac/Linux)
```

See the full [Terraform Deployment Guide](file:///c:/Users/harsh/OneDrive/Desktop/notes_gen/video2/terraform/README.md) for details on zero-cost setup, SSH management, and teardown.

## Tech Stack

- **AI**: Google Gemini (gemini-3.6-flash)
- **PDF**: Chrome headless + MathJax
- **Video**: ffmpeg
- **Web**: Flask + vanilla JS
- **Infrastructure**: Terraform + AWS EC2 Free Tier (t2.micro) + Nginx + Gunicorn
- **Transcript**: OpenAI Whisper

