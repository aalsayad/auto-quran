# Auto Quran Setup Guide

Welcome to Auto Quran! This guide will help you set up the application with all required API credentials.

## 🚀 Quick Start

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up environment variables (see below)
4. Run the development server: `npm run dev`

---

## 🔑 Required API Credentials

### 1. Quran.com API (REQUIRED for Reader Page)

The application uses Quran.com API v4 to display the Quran with authentic Mushaf formatting (604 pages, exact line breaks).

**How to get credentials:**

1. Go to: https://api-docs.quran.com/docs/quickstart/
2. Fill out the API access request form
3. You'll receive `CLIENT_ID` and `CLIENT_SECRET` via email
4. Add them to your `.env.local` file:

```bash
NEXT_PUBLIC_QURAN_CLIENT_ID=your_client_id_here
NEXT_PUBLIC_QURAN_CLIENT_SECRET=your_client_secret_here
```

**Features enabled:**

- ✅ Authentic Mushaf page layout (15 lines per page)
- ✅ Exact Uthmani text as in printed Qurans
- ✅ Proper word positioning and line breaks
- ✅ Page navigation (1-604 Madani Mushaf)

---

### 2. Supabase (for Authentication)

**How to get credentials:**

1. Go to: https://supabase.com
2. Create a new project
3. Go to Settings > API
4. Copy your project URL and anon key
5. Add them to your `.env.local` file:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

**Features enabled:**

- ✅ User sign-in/sign-up
- ✅ Authentication state management

---

### 3. AWS S3 (for Audio File Storage)

**How to get credentials:**

1. Go to: https://aws.amazon.com/console/
2. Create an account or sign in
3. Go to IAM > Users > Create User
4. Attach the `AmazonS3FullAccess` policy
5. Create access keys
6. Create an S3 bucket in your preferred region
7. Add credentials to your `.env.local` file:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key_id_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_S3_BUCKET_NAME=your_bucket_name_here
```

**Features enabled:**

- ✅ Upload MP3 files to cloud storage
- ✅ Persistent audio file storage
- ✅ Automatic deletion on project removal

---

## 📝 Environment Variables

Create a `.env.local` file in the root directory with all the credentials above. You can use `.env.example` as a template:

```bash
cp .env.example .env.local
```

Then fill in your actual credentials.

---

## ⚠️ Important Notes

1. **Quran.com API**:

   - Free to use for non-commercial projects
   - MIT License
   - Access tokens expire after 1 hour (automatically refreshed)
   - Rate limits apply (reasonable usage expected)

2. **Environment Variables**:

   - Never commit `.env.local` to git
   - Use `NEXT_PUBLIC_` prefix for client-side variables
   - Server-side only variables (AWS) don't need the prefix

3. **AWS S3**:
   - Charges may apply based on storage and transfer
   - Configure bucket permissions for public read access
   - Enable CORS for file uploads from browser

---

## 🎯 Features

### Authentic Mushaf Display

- **604 pages** (Madani Mushaf standard)
- **Line-based layout** (15 lines per page)
- **Uthmani script** (exact text as printed Qurans)
- **Traditional verse markers** (﴿١﴾, ﴿٢﴾, etc.)
- **Page navigation** controls
- **Auto-scroll** to current ayah during playback

### Audio Segmentation

- **Upload MP3** Quran recitations
- **Auto-detect** surah from filename
- **Silence detection** for automatic ayah splitting
- **Waveform editor** with visual segments
- **Manual editing** (drag boundaries, add/delete segments)
- **Ayah assignment** with Quran API text

### Project Management

- **Save projects** to localStorage
- **Cloud storage** for audio files (AWS S3)
- **Library view** to manage all projects
- **Rename** and delete projects

### Audio Player

- **Synchronized highlighting** of current ayah
- **Playback controls** (play, pause, next, previous)
- **Speed adjustment** (0.5x to 1.5x)
- **Repeat modes** (surah or single ayah)
- **Keyboard shortcuts** (spacebar to play/pause)

---

## 🐛 Troubleshooting

### "Quran.com API credentials not found"

- Ensure you've added `NEXT_PUBLIC_QURAN_CLIENT_ID` and `NEXT_PUBLIC_QURAN_CLIENT_SECRET` to `.env.local`
- Restart the development server after adding credentials

### "Failed to get access token"

- Check that your credentials are correct
- Ensure you copied them exactly as received via email

### "Failed to load audio from cloud storage"

- Verify AWS S3 credentials are correct
- Check bucket permissions and CORS settings
- Ensure the audio file URL is accessible

### API Not Loading

- Clear your browser cache
- Check browser console for errors
- Verify all environment variables are set correctly

---

## 📚 Resources

- **Quran.com API Docs**: https://api-docs.quran.com/
- **Supabase Docs**: https://supabase.com/docs
- **AWS S3 Docs**: https://docs.aws.amazon.com/s3/
- **Next.js Docs**: https://nextjs.org/docs

---

## 🤝 Support

If you encounter any issues:

1. Check this setup guide
2. Review the troubleshooting section
3. Check browser console for error messages
4. Ensure all API credentials are correctly configured

---

## 📄 License

This project is for personal and educational use only.

**API Licenses:**

- Quran.com API: MIT License (non-commercial use)
- Quran text: Public domain

---

**May Allah accept this work and make it beneficial. Ameen.** 🤲
