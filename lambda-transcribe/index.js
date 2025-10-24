const { default: OpenAI } = require("openai");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { createClient } = require("@supabase/supabase-js");
const { spawn } = require("child_process");
const { writeFileSync, unlinkSync, readFileSync, readdirSync, existsSync } = require("fs");
const { randomUUID } = require("crypto");
const path = require("path");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "eu-north-1",
});

// Initialize Supabase client for JWT authentication
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ✅ FIXED: Simple headers (CORS handled by Function URL)
const responseHeaders = {
  "Content-Type": "application/json",
};

const MAX_FILE_SIZE = 24 * 1024 * 1024; // 24MB (Whisper limit)
const TARGET_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB target per chunk
const S3_BUCKET = process.env.S3_BUCKET || "quran-splitter";

/**
 * Clean up all old files in /tmp directory
 * This prevents memory buildup from previous Lambda invocations
 */
function cleanupTempDirectory() {
  const tempDir = "/tmp";
  try {
    const files = readdirSync(tempDir);
    let cleanedCount = 0;

    for (const file of files) {
      // Only clean up our files (audio and chunks), not Lambda system files
      if (file.includes("input-") || file.includes("chunk-")) {
        const filePath = path.join(tempDir, file);
        try {
          unlinkSync(filePath);
          cleanedCount++;
        } catch (err) {
          // File might be in use or already deleted, ignore
          console.log(`⚠️  Could not delete ${file}: ${err.message}`);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old temp files from /tmp`);
    }
  } catch (error) {
    console.error("⚠️  Error cleaning /tmp:", error.message);
    // Don't fail the request if cleanup fails
  }
}

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
    let errorOutput = "";

    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed (code ${code}): ${errorOutput}`));
      } else {
        resolve(parseFloat(output.trim()));
      }
    });
  });
}

/**
 * Calculate optimal chunk duration based on file size
 * Goal: minimize chunks while keeping each under 20MB
 */
function calculateOptimalChunkDuration(fileSize, totalDuration) {
  // Calculate minimum number of chunks needed
  const minChunks = Math.ceil(fileSize / TARGET_CHUNK_SIZE);

  // Calculate duration per chunk to achieve minimum chunks
  const chunkDuration = totalDuration / minChunks;

  console.log(`📊 File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`⏱️  Total duration: ${totalDuration.toFixed(2)} seconds`);
  console.log(
    `🎯 Optimal chunks: ${minChunks} (${(chunkDuration / 60).toFixed(
      2
    )} min each)`
  );

  return { numChunks: minChunks, chunkDuration };
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

  try {
    // Get audio duration
    const duration = await getAudioDuration(inputPath);

    // Calculate optimal chunking
    const { numChunks, chunkDuration } = calculateOptimalChunkDuration(
      audioBuffer.length,
      duration
    );

    const chunkPaths = [];

    // Split audio using ffmpeg
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkDuration;
      const chunkPath = path.join(tempDir, `${chunkPrefix}-${i}.mp3`);

      await new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
          "-i",
          inputPath,
          "-ss",
          startTime.toString(),
          "-t",
          chunkDuration.toString(),
          "-acodec",
          "copy",
          "-y",
          chunkPath,
        ]);

        let errorOutput = "";

        ffmpeg.stderr.on("data", (data) => {
          errorOutput += data.toString();
        });

        ffmpeg.on("close", (code) => {
          if (code !== 0) {
            reject(new Error(`ffmpeg failed for chunk ${i}: ${errorOutput}`));
          } else {
            const chunkSize = readFileSync(chunkPath).length;
            console.log(
              `✅ Created chunk ${i + 1}/${numChunks}: ${(
                chunkSize /
                1024 /
                1024
              ).toFixed(2)} MB`
            );
            chunkPaths.push(chunkPath);
            resolve();
          }
        });
      });
    }

    return { chunkPaths, duration, chunkDuration };
  } finally {
    // Always clean up input file, even on error
    try {
      if (existsSync(inputPath)) {
        unlinkSync(inputPath);
        console.log(`🗑️  Cleaned up input file: ${inputPath}`);
      }
    } catch (error) {
      console.error(`⚠️  Could not delete input file: ${error.message}`);
    }
  }
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

  const { chunkPaths, duration, chunkDuration } = await splitAudioIntoChunks(
    audioBuffer,
    fileName
  );

  const tempS3Keys = []; // Track S3 keys for cleanup
  const localChunkPaths = [...chunkPaths]; // Track local files for cleanup
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

      // Clean up local chunk file immediately after use
      try {
        unlinkSync(chunkPath);
        console.log(`🗑️  Deleted local chunk: ${chunkPath}`);
      } catch (err) {
        console.error(`⚠️  Could not delete ${chunkPath}:`, err.message);
      }

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
    // GUARANTEED CLEANUP: Delete all temp chunks from S3 and local files
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

    // Also clean up any remaining local chunk files (in case of error)
    console.log(`🗑️  Cleaning up local chunk files...`);
    for (const chunkPath of localChunkPaths) {
      try {
        if (existsSync(chunkPath)) {
          unlinkSync(chunkPath);
          console.log(`🗑️  Deleted local chunk: ${chunkPath}`);
        }
      } catch (error) {
        console.error(`⚠️  Could not delete ${chunkPath}:`, error.message);
      }
    }

    console.log("✅ Cleanup complete!");
  }
}

/**
 * Main Lambda handler with API KEY authentication
 * ALWAYS RETURNS 200 WITH ERROR IN BODY
 */
exports.handler = async (event) => {
  console.log("📥 Received request");

  // 🧹 CRITICAL: Clean up /tmp from previous invocations to prevent memory buildup
  cleanupTempDirectory();

  // Handle CORS preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({ ok: true }),
    };
  }

  try {
    // 🔐 JWT AUTHENTICATION with Supabase
    const authHeader =
      event.headers?.authorization || event.headers?.Authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("❌ Missing or invalid authorization header");
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          success: false,
          error: "Missing authentication token. Please log in.",
          errorType: "AuthError",
        }),
      };
    }

    const token = authHeader.replace("Bearer ", "");

    // Validate JWT token with Supabase
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.log("❌ Invalid or expired token:", error?.message);
      return {
        statusCode: 200,
        headers: responseHeaders,
        body: JSON.stringify({
          success: false,
          error: "Unauthorized. Please log in again.",
          errorType: "AuthError",
        }),
      };
    }

    console.log(`✅ Authenticated user: ${user.email} (${user.id})`);

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
    let audioBuffer = await downloadAudioFromS3(audioUrl);
    const fileSize = audioBuffer.length; // Save size before nulling buffer

    // Step 2: Transcribe (with automatic chunking if needed)
    const transcriptionResult = await transcribeWithChunking(
      audioBuffer,
      audioUrl.split("/").pop() || "audio.mp3"
    );

    // 🧹 Help garbage collection: Clear large buffer reference
    audioBuffer = null;

    // Step 3: Return result
    console.log(
      `🎉 Success! Total segments: ${transcriptionResult.segments.length}`
    );

    const response = {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        success: true,
        transcription: transcriptionResult,
        metadata: {
          surahNumber,
          fileSize: fileSize,
          segmentCount: transcriptionResult.segments.length,
        },
      }),
    };

    console.log("📤 Returning response to client");
    return response;
  } catch (error) {
    console.error("❌ Transcription error:", error);
    console.error("❌ Error stack:", error.stack);

    return {
      statusCode: 200,
      headers: responseHeaders,
      body: JSON.stringify({
        success: false,
        error: error.message || "Transcription failed",
        errorType: error.name || "Error",
        stack: error.stack,
        details: {
          message: error.message,
          name: error.name,
          cause: error.cause,
        },
      }),
    };
  } finally {
    // 🧹 Final cleanup before Lambda exits (whether success or error)
    console.log("🧹 Final cleanup before Lambda exit...");
    cleanupTempDirectory();
  }
};
