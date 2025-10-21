# Auto Quran - Ayah Segmentation & Mushaf Reader

A Next.js application for splitting Quran recitation MP3 files into individual ayahs and displaying the Quran in authentic Mushaf format.

## ✨ Features

### 📖 Authentic Mushaf Display

- **604 pages** (Madani Mushaf standard)
- **Line-based layout** with exact word positioning
- **Uthmani script** as in printed Qurans
- **Traditional Arabic-Indic numerals** (﴿١﴾, ﴿٢﴾, etc.)
- **Page navigation** between Mushaf pages
- **Synchronized highlighting** during audio playback

### 🎵 Audio Segmentation

- **Upload MP3** Quran recitations
- **Auto-detect** surah from filename
- **Silence detection** for automatic ayah splitting
- **Visual waveform editor** with draggable segments
- **Manual segment editing** (add, delete, adjust boundaries)
- **Ayah assignment** with Quran API text verification

### 💾 Project Management

- **Save projects** with localStorage
- **Cloud storage** for audio files (AWS S3)
- **Project library** view
- **Rename** and delete projects
- **Audio caching** for fast loading

### 🎧 Audio Player

- **Synchronized highlighting** of current ayah
- **Playback controls** (play, pause, next, previous)
- **Speed adjustment** (0.5x to 1.5x)
- **Repeat modes** (full surah or single ayah)
- **Keyboard shortcuts** (spacebar to play/pause)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Quran.com API credentials (see setup below)

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd quran-splitter
```

2. Install dependencies:

```bash
npm install
```

3. Create `.env.local` file with required credentials (see below)

4. Run the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000)

---

## 🔑 Required API Credentials

### 1. Quran.com API (REQUIRED)

The application uses Quran.com API v4 for authentic Mushaf display.

**Get credentials:**

1. Visit: https://api-docs.quran.com/docs/quickstart/
2. Fill out the API access request form
3. Receive `CLIENT_ID` and `CLIENT_SECRET` via email

**Add to `.env.local`:**

```bash
NEXT_PUBLIC_QURAN_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_QURAN_CLIENT_SECRET=your_client_secret_here
```

### 2. Supabase (for Authentication)

**Get credentials:**

1. Create account at https://supabase.com
2. Create new project
3. Go to Settings > API
4. Copy URL and anon key

**Add to `.env.local`:**

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 3. AWS S3 (for Audio Storage)

**Get credentials:**

1. Create AWS account: https://aws.amazon.com
2. Create IAM user with S3 access
3. Create S3 bucket
4. Generate access keys

**Add to `.env.local`:**

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_S3_BUCKET_NAME=your_bucket_name_here
```

---

## 📝 Complete .env.local Template

Create a `.env.local` file in the root directory:

```bash
# Quran.com API (REQUIRED for Mushaf display)
# Request at: https://api-docs.quran.com/docs/quickstart/
NEXT_PUBLIC_QURAN_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_QURAN_CLIENT_SECRET=your_client_secret_here

# Supabase (for authentication)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here

# AWS S3 (for audio file storage)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_S3_BUCKET_NAME=your_bucket_name_here
```

---

## 🎯 How to Use

### Creating a New Project

1. Click **"Create New Project"** on the library page
2. **Upload MP3 file** of Quran recitation
3. **Select surah** (auto-detected from filename)
4. **Name your project**
5. Click **"Create Project"**

### Editing Segments

1. Choose detection method:

   - **Silence Detection**: Automatic ayah splitting based on silence
   - **Manual**: Create segments manually

2. Adjust segments:

   - **Drag boundaries** to adjust timing
   - **Right-click** to add/delete segments
   - **Click segment** to assign ayah number
   - **Fetch Quran text** to verify ayahs

3. **Save** your project

### Reading & Listening

1. Click **"Reader"** on a project
2. Navigate through **Mushaf pages** (1-604)
3. **Play audio** with synchronized highlighting
4. Use **playback controls** for navigation
5. Enable **repeat modes** as needed

---

## 🏗️ Tech Stack

- **Next.js 14** (App Router)
- **React 18**
- **TypeScript**
- **Tailwind CSS**
- **shadcn/ui** components
- **WaveSurfer.js** for waveform visualization
- **FFmpeg.wasm** for audio processing
- **Quran.com API v4** for Mushaf text
- **Supabase** for authentication
- **AWS S3** for audio storage
- **React Icons** (Feather icons)

---

## 📚 API Information

### Quran.com API

- **License**: MIT (non-commercial use)
- **Documentation**: https://api-docs.quran.com/
- **Features Used**:
  - Verses by page endpoint
  - Word-by-word positioning
  - Line number metadata
  - Uthmani text script

### Rate Limits

- Quran.com API: Reasonable usage expected
- Supabase: Free tier limits apply
- AWS S3: Pay-as-you-go pricing

---

## ⚠️ Troubleshooting

### "Quran.com API credentials not found"

- Ensure credentials are in `.env.local`
- Restart development server
- Check for typos in variable names

### "Failed to get access token"

- Verify credentials are correct
- Check you requested access from Quran.com
- Ensure credentials haven't expired

### Audio Upload Failing

- Check AWS S3 credentials
- Verify bucket permissions
- Configure CORS for browser uploads

### Page Not Loading

- Clear browser cache
- Check browser console for errors
- Verify all environment variables

---

## 📖 Additional Resources

- **Quran.com API Docs**: https://api-docs.quran.com/
- **Quick Start Guide**: See `SETUP.md` for detailed setup instructions
- **Next.js Documentation**: https://nextjs.org/docs

---

## 🤝 Contributing

This is a personal project for educational purposes. Feel free to fork and modify for your own use.

---

## 📄 License

**Project**: Personal/Educational use only

**APIs & Content**:

- Quran.com API: MIT License (non-commercial)
- Quranic text: Public domain

---

## 🤲 Du'a

**May Allah accept this work and make it a means of benefit for those who seek to recite and understand His Book. Ameen.**

---

**Built with ❤️ for the sake of Allah**
