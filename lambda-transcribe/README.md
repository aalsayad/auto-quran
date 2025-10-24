# AWS Lambda - Quran Audio Transcription (with Internal Chunking)

This Lambda function handles Whisper transcription for Quran audio files with **automatic internal chunking** for large files.

## Features

- ✅ **No Vercel Timeout**: 15-minute Lambda timeout (vs. 10s on Vercel Hobby)
- ✅ **Handles Large Files**: Downloads from S3, chunks internally if > 24MB
- ✅ **Smart Chunking**: Uses ffmpeg to split large files into 10-minute chunks
- ✅ **Automatic Cleanup**: Temp chunks uploaded to S3, then deleted after transcription
- ✅ **CORS Enabled**: Works with client-side calls
- ✅ **Full Logging**: CloudWatch logs for debugging

## How It Works

1. **Client** uploads full audio to S3, sends S3 URL to Lambda
2. **Lambda** downloads audio from S3
3. **Lambda** checks file size:
   - If ≤ 24MB: Transcribes directly
   - If > 24MB:
     - Splits into 10-min chunks using ffmpeg
     - Uploads chunks to S3 temporarily (`whisper-temp-chunks/`)
     - Transcribes each chunk with time offset
     - Merges all segments into one JSON
     - **Deletes temp chunks from S3**
4. **Lambda** returns complete transcription

## Deployment

### 1. Install Dependencies

```bash
cd lambda-transcribe
npm install openai @aws-sdk/client-s3
```

### 2. Add FFmpeg Layer to Lambda

Lambda needs ffmpeg to split audio files. Use this public Lambda layer:

**FFmpeg Layer ARN** (for `eu-north-1`):

```
arn:aws:lambda:eu-north-1:580247275435:layer:LambdaAdaptedFFmpeg:8
```

**How to add:**

1. Go to AWS Lambda Console
2. Select your function: `auto-quran-transcribe-chunk`
3. Scroll down to **"Layers"**
4. Click **"Add a layer"**
5. Select **"Specify an ARN"**
6. Paste: `arn:aws:lambda:eu-north-1:580247275435:layer:LambdaAdaptedFFmpeg:8`
7. Click **"Add"**

> **Note**: If you're in a different region, find the appropriate ARN here:
> https://github.com/serverlesspub/ffmpeg-aws-lambda-layer

### 3. Create Deployment Package

```bash
cd lambda-transcribe
chmod +x deploy.sh
./deploy.sh
```

This creates `function.zip` (~2.5 MB with AWS SDK).

### 4. Upload to AWS Lambda

1. Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda)
2. Select function: `auto-quran-transcribe-chunk`
3. Click **"Upload from"** → **".zip file"**
4. Upload `function.zip`
5. Click **"Save"**

### 5. Configure Lambda

**Runtime**: Node.js 18.x or higher

**Handler**: `index.handler`

**Memory**: 1024 MB (recommended for chunking, 512 MB min)

**Timeout**: 15 minutes (900 seconds)

**Environment Variables**:

- `OPENAI_API_KEY`: Your OpenAI API key
- `AWS_REGION`: Your AWS region (e.g., `eu-north-1`)
- `S3_BUCKET`: Your S3 bucket name (e.g., `quran-splitter`)

**Execution Role Permissions**:
Make sure your Lambda execution role has these permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::quran-splitter/*"
    }
  ]
}
```

### 6. API Gateway Setup

Your existing API Gateway endpoint:

```
https://hzmc716qdh.execute-api.eu-north-1.amazonaws.com/default/auto-quran-transcribe-chunk/auto-quran-transcribe-chunk-api
```

Make sure:

- **CORS** is enabled for all methods
- **POST** method is configured
- **Lambda Proxy Integration** is enabled

## Request Format

```json
{
  "audioUrl": "https://quran-splitter.s3.amazonaws.com/audio-123.mp3",
  "surahNumber": 1
}
```

## Response Format

### Success (200)

```json
{
  "success": true,
  "transcription": {
    "segments": [
      {
        "start": 0.0,
        "end": 3.5,
        "text": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ"
      }
    ],
    "text": "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ..."
  },
  "metadata": {
    "surahNumber": 1,
    "fileSize": 52428800,
    "segmentCount": 286
  }
}
```

### Error (500)

```json
{
  "success": false,
  "error": "Error message",
  "details": "Stack trace..."
}
```

## Testing

### Test in AWS Lambda Console

Use this test event:

```json
{
  "body": "{\"audioUrl\":\"https://quran-splitter.s3.amazonaws.com/your-test-file.mp3\",\"surahNumber\":1}"
}
```

### Test via API Gateway

```bash
curl -X POST \
  https://hzmc716qdh.execute-api.eu-north-1.amazonaws.com/default/auto-quran-transcribe-chunk/auto-quran-transcribe-chunk-api \
  -H 'Content-Type: application/json' \
  -d '{"audioUrl":"https://quran-splitter.s3.amazonaws.com/your-test-file.mp3","surahNumber":1}'
```

## Monitoring

View logs in AWS CloudWatch:

1. Go to CloudWatch Console
2. Navigate to Log Groups
3. Find `/aws/lambda/auto-quran-transcribe-chunk`
4. View recent log streams

You'll see detailed logs:

- `📥 Downloading audio from S3`
- `📊 File size: XX MB`
- `✅ File size OK, transcribing directly...` (for small files)
- `⚠️  File exceeds 24MB, will chunk and transcribe...` (for large files)
- `📦 Will split into X chunks`
- `✅ Created chunk X/Y`
- `☁️  Uploading chunk X to S3`
- `🎤 Transcribing: chunk-X.mp3`
- `🗑️  Cleaning up X temp chunks from S3...`
- `🎉 Success! Total segments: X`

## Cost Optimization

### Lambda Costs

- **Free Tier**: 1M requests + 400,000 GB-seconds/month
- **After Free Tier**: ~$0.20 per 1GB-hour
- **Typical 10-min transcription**: ~$0.01-0.03

### S3 Costs (Temp Chunks)

- **PUT requests**: $0.005 per 1,000 (minimal)
- **DELETE requests**: Free
- **Storage**: ~$0 (chunks deleted immediately)

### Total Cost

- **Much cheaper than Vercel Pro** ($20/month)
- **Pay-per-use**: Only pay when transcribing

## Troubleshooting

### "Cannot find module 'openai'" or "@aws-sdk/client-s3"

- **Cause**: Lambda doesn't have the packages
- **Fix**: Upload the new `function.zip` that includes `node_modules/`

### "ffmpeg: command not found"

- **Cause**: FFmpeg layer not added
- **Fix**: Add the FFmpeg Lambda layer (see step 2 above)

### "audioUrl is undefined"

- **Cause**: Request format issue
- **Fix**: Check that you're sending JSON with `audioUrl` field
- **Debug**: Check CloudWatch logs to see parsed body

### "Failed to fetch audio from S3"

- **Cause**: Lambda can't access your S3 bucket
- **Fix**: Add S3 permissions to Lambda execution role

### "AccessDenied" when uploading/deleting chunks

- **Cause**: Lambda execution role lacks S3 permissions
- **Fix**: Add `s3:PutObject` and `s3:DeleteObject` permissions

### Timeout on large files

- **Cause**: Lambda timeout too short
- **Fix**: Increase Lambda timeout to 900 seconds (15 min)
- **Also**: Increase memory to 1024 MB for faster processing

### CORS errors

- **Cause**: API Gateway CORS not configured
- **Fix**: Ensure Lambda returns `corsHeaders` in response
- **Fix**: Enable CORS in API Gateway settings

## Architecture

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │ 1. Upload full audio to S3
       ▼
┌─────────────┐
│   AWS S3    │
│ audio-file  │
└──────┬──────┘
       │ 2. Send S3 URL
       ▼
┌────────────────────────────────────────────┐
│          AWS Lambda Function               │
│  ┌──────────────────────────────────────┐  │
│  │ 1. Download from S3                  │  │
│  │ 2. Check size                        │  │
│  │ 3a. If small: Transcribe directly    │  │
│  │ 3b. If large:                        │  │
│  │    - Split with ffmpeg (10min each)  │  │
│  │    - Upload chunks to S3 temp        │  │
│  │    - Transcribe each chunk           │  │
│  │    - Merge segments                  │  │
│  │    - Delete temp chunks from S3      │  │
│  │ 4. Return transcription              │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────┐
│   AWS S3 (Temp)     │
│ whisper-temp-chunks/│
│ (auto-deleted)      │
└─────────────────────┘
```

## Updates

To update the function:

```bash
# 1. Make code changes in index.js
# 2. Re-install dependencies if needed
npm install
# 3. Re-zip
./deploy.sh
# 4. Upload to Lambda
# 5. Test
```

## Example CloudWatch Logs

**Small file (< 24MB):**

```
📥 Downloading audio from S3: https://...
✅ Downloaded: 18.45 MB
📊 File size: 18.45 MB
✅ File size OK, transcribing directly...
🎤 Transcribing: audio.mp3 (18.45 MB)
✅ Transcription complete: 142 segments
🎉 Success! Total segments: 142
```

**Large file (> 24MB):**

```
📥 Downloading audio from S3: https://...
✅ Downloaded: 48.23 MB
📊 File size: 48.23 MB
⚠️  File exceeds 24MB, will chunk and transcribe...
📁 Writing audio to temp: /tmp/input-...
⏱️  Audio duration: 3623.45 seconds
📦 Will split into 7 chunks (600s each)
✅ Created chunk 1/7: /tmp/chunk-...-0.mp3
✅ Created chunk 2/7: /tmp/chunk-...-1.mp3
...
🔄 Processing chunk 1/7
⏱️  Time offset: 0.00s
☁️  Uploading chunk 0 to S3: whisper-temp-chunks/...
✅ Uploaded chunk 0: https://...
📥 Downloading audio from S3: https://...
✅ Downloaded: 7.12 MB
🎤 Transcribing: chunk-0.mp3 (7.12 MB)
✅ Transcription complete: 48 segments
✅ Chunk 1/7 complete (48 segments)
...
🎉 All chunks transcribed! Total segments: 286
🗑️  Cleaning up 7 temp chunks from S3...
🗑️  Deleting temp chunk from S3: whisper-temp-chunks/...
✅ Cleanup complete!
🎉 Success! Total segments: 286
```
