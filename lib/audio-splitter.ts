import JSZip from "jszip";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

interface Segment {
  start: number;
  end: number;
  text: string;
}

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) {
    return ffmpegInstance;
  }

  ffmpegInstance = new FFmpeg();

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

  await ffmpegInstance.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegLoaded = true;
  return ffmpegInstance;
}

export async function splitAudioIntoAyahs(
  audioFile: File,
  segments: Segment[],
  surahNumber: number
): Promise<Blob> {
  // Load FFmpeg
  const ffmpeg = await loadFFmpeg();

  // Write input file to FFmpeg virtual filesystem
  await ffmpeg.writeFile("input.mp3", await fetchFile(audioFile));

  // Create ZIP file
  const zip = new JSZip();

  // Split each segment
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const ayahNumber = i + 1;

    const startTime = segment.start;
    const duration = segment.end - segment.start;

    const outputFileName = `surah_${surahNumber
      .toString()
      .padStart(3, "0")}_ayah_${ayahNumber.toString().padStart(3, "0")}.mp3`;

    // Use ffmpeg to extract the segment
    // -i input.mp3: input file
    // -ss: start time in seconds
    // -t: duration in seconds
    // -c copy: copy codec (fast, no re-encoding)
    await ffmpeg.exec([
      "-i",
      "input.mp3",
      "-ss",
      startTime.toString(),
      "-t",
      duration.toString(),
      "-c",
      "copy",
      outputFileName,
    ]);

    // Read the output file
    const data = await ffmpeg.readFile(outputFileName);

    // Add to ZIP
    zip.file(outputFileName, data);

    // Clean up
    await ffmpeg.deleteFile(outputFileName);
  }

  // Clean up input file
  await ffmpeg.deleteFile("input.mp3");

  // Generate ZIP file
  const zipBlob = await zip.generateAsync({ type: "blob" });
  return zipBlob;
}
