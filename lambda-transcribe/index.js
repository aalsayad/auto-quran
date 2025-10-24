const { default: OpenAI } = require("openai");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { spawn } = require("child_process");
const { writeFileSync, unlinkSync, readFileSync } = require("fs");
const { randomUUID } = require("crypto");
const path = require("path");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
});

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
  "Access-Control-Allow-Headers":
    "Content-Type,Accept,Origin,X-Requested-With,Authorization",
};

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB (leaving margin below Whisper's 25MB limit)
const CHUNK_DURATION_SECONDS = 600; // 10 minutes per chunk
const S3_BUCKET = process.env.S3_BUCKET || "quran-splitter";

/**
 * Downloads audio from S3 and returns buffer
 */
async function downloadAudioFromS3(audioUrl) {
  console.log(`📥 Downloading audio from S3: ${audioUrl}`);

  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(
      `Failed to fetch audio from S3: ${audioResponse.status} ${audioResponse.statusText}`
    );
  }

  const arrayBuffer = await audioResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  console.log(`✅ Downloaded: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
  return buffer;
}

/**
 * Get audio duration using ffprobe
 */
async function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ]);

    let output = "";
    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error("Failed to get audio duration"));
      } else {
        resolve(parseFloat(output.trim()));
      }
    });
  });
}

/**
 * Split audio file into chunks using ffmpeg
 */
async function splitAudioIntoChunks(audioBuffer, fileName) {
  const tempDir = "/tmp";
  const inputPath = path.join(tempDir, `input-${randomUUID()}.mp3`);
  const chunkPrefix = `chunk-${randomUUID()}`;

  console.log(`📁 Writing audio to temp: ${inputPath}`);
  writeFileSync(inputPath, audioBuffer);

  // Get audio duration
  const duration = await getAudioDuration(inputPath);
  console.log(`⏱️  Audio duration: ${duration.toFixed(2)} seconds`);

  // Calculate number of chunks needed
  const numChunks = Math.ceil(duration / CHUNK_DURATION_SECONDS);
  console.log(
    `📦 Will split into ${numChunks} chunks (${CHUNK_DURATION_SECONDS}s each)`
  );

  const chunkPaths = [];

  // Split audio using ffmpeg
  for (let i = 0; i < numChunks; i++) {
    const startTime = i * CHUNK_DURATION_SECONDS;
    const chunkPath = path.join(tempDir, `${chunkPrefix}-${i}.mp3`);

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        inputPath,
        "-ss",
        startTime.toString(),
        "-t",
        CHUNK_DURATION_SECONDS.toString(),
        "-acodec",
        "copy",
        "-y",
        chunkPath,
      ]);

      ffmpeg.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`ffmpeg failed for chunk ${i}`));
        } else {
          console.log(`✅ Created chunk ${i + 1}/${numChunks}: ${chunkPath}`);
          chunkPaths.push(chunkPath);
          resolve();
        }
      });

      ffmpeg.stderr.on("data", (data) => {
        // Suppress ffmpeg output unless there's an error
      });
    });
  }

  // Clean up input file
  unlinkSync(inputPath);

  return { chunkPaths, duration };
}

/**
 * Upload chunk to S3 and return URL
 */
async function uploadChunkToS3(chunkPath, index) {
  const chunkBuffer = readFileSync(chunkPath);
  const key = `whisper-temp-chunks/${randomUUID()}-chunk-${index}.mp3`;

  console.log(`☁️  Uploading chunk ${index} to S3: ${key}`);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: chunkBuffer,
      ContentType: "audio/mpeg",
    })
  );

  const url = `https://${S3_BUCKET}.s3.${
    process.env.AWS_REGION || "eu-north-1"
  }.amazonaws.com/${key}`;
  console.log(`✅ Uploaded chunk ${index}: ${url}`);

  return { url, key };
}

/**
 * Delete temp chunk from S3
 */
async function deleteChunkFromS3(key) {
  console.log(`🗑️  Deleting temp chunk from S3: ${key}`);
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  );
}

/**
 * Transcribes a single audio file/chunk with Whisper
 */
async function transcribeAudioBuffer(buffer, fileName, timeOffset = 0) {
  console.log(
    `🎤 Transcribing: ${fileName} (${(buffer.length / 1024 / 1024).toFixed(
      2
    )} MB)`
  );

  // Convert buffer to File object for OpenAI API
  const file = new File([buffer], fileName, { type: "audio/mpeg" });

  const transcription = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    language: "ar",
    response_format: "verbose_json",
    timestamp_granularities: ["segment", "word"],
    prompt: "آية. جملة قصيرة. توقف. فاصل.",
    temperature: 0,
  });

  const adjustedSegments = (transcription.segments || []).map((seg) => ({
    start: seg.start + timeOffset,
    end: seg.end + timeOffset,
    text: seg.text,
  }));

  console.log(`✅ Transcription complete: ${adjustedSegments.length} segments`);

  return {
    segments: adjustedSegments,
    text: transcription.text,
  };
}

/**
 * Transcribe audio with automatic chunking if needed
 */
async function transcribeWithChunking(audioBuffer, fileName) {
  const fileSize = audioBuffer.length;
  console.log(`📊 File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

  // If file is small enough, transcribe directly
  if (fileSize <= MAX_FILE_SIZE) {
    console.log("✅ File size OK, transcribing directly...");
    return await transcribeAudioBuffer(audioBuffer, fileName);
  }

  // File is too large, need to chunk
  console.log("⚠️  File exceeds 24MB, will chunk and transcribe...");

  const { chunkPaths, duration } = await splitAudioIntoChunks(
    audioBuffer,
    fileName
  );
  const chunkDuration = duration / chunkPaths.length;

  const tempS3Keys = []; // Track S3 keys for cleanup
  const allSegments = [];
  let fullText = "";

  try {
    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];
      const timeOffset = i * chunkDuration;

      console.log(`\n🔄 Processing chunk ${i + 1}/${chunkPaths.length}`);
      console.log(`⏱️  Time offset: ${timeOffset.toFixed(2)}s`);

      // Read chunk
      const chunkBuffer = readFileSync(chunkPath);

      // Upload to S3 (temporary)
      const { url, key } = await uploadChunkToS3(chunkPath, i);
      tempS3Keys.push(key);

      // Download from S3 (to ensure it's accessible)
      const s3ChunkBuffer = await downloadAudioFromS3(url);

      // Transcribe chunk
      const result = await transcribeAudioBuffer(
        s3ChunkBuffer,
        `chunk-${i}.mp3`,
        timeOffset
      );

      allSegments.push(...result.segments);
      fullText += (fullText ? " " : "") + result.text;

      // Clean up local chunk file
      unlinkSync(chunkPath);

      console.log(
        `✅ Chunk ${i + 1}/${chunkPaths.length} complete (${
          result.segments.length
        } segments)`
      );
    }

    console.log(
      `\n🎉 All chunks transcribed! Total segments: ${allSegments.length}`
    );

    return {
      segments: allSegments,
      text: fullText,
    };
  } finally {
    // GUARANTEED CLEANUP: Delete all temp chunks from S3
    console.log(
      `\n🗑️  Cleaning up ${tempS3Keys.length} temp chunks from S3...`
    );
    for (const key of tempS3Keys) {
      try {
        await deleteChunkFromS3(key);
      } catch (error) {
        console.error(`⚠️  Failed to delete ${key}:`, error.message);
      }
    }
    console.log("✅ Cleanup complete!");
  }
}

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
  console.log("📥 Received event:", JSON.stringify(event, null, 2));

  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true }),
    };
  }

  try {
    // Parse request body
    let body;
    if (event.body) {
      body =
        typeof event.body === "string" ? JSON.parse(event.body) : event.body;
    } else {
      body = event;
    }

    console.log("📦 Parsed body:", JSON.stringify(body, null, 2));

    const { audioUrl, surahNumber } = body;

    // Validate inputs
    if (!audioUrl) {
      throw new Error("audioUrl is required");
    }

    console.log(`🎧 Processing audio for Surah ${surahNumber || "Unknown"}`);
    console.log(`🔗 Audio URL: ${audioUrl}`);

    // Step 1: Download audio from S3
    const audioBuffer = await downloadAudioFromS3(audioUrl);

    // Step 2: Transcribe (with automatic chunking if needed)
    const transcriptionResult = await transcribeWithChunking(
      audioBuffer,
      audioUrl.split("/").pop() || "audio.mp3"
    );

    // Step 3: Return result
    console.log(
      `🎉 Success! Total segments: ${transcriptionResult.segments.length}`
    );

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        transcription: transcriptionResult,
        metadata: {
          surahNumber,
          fileSize: audioBuffer.length,
          segmentCount: transcriptionResult.segments.length,
        },
      }),
    };
  } catch (error) {
    console.error("❌ Transcription error:", error);
    console.error("❌ Error stack:", error.stack);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || "Transcription failed",
        details: error.stack,
      }),
    };
  }
};
