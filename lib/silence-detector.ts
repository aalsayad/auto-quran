interface SilenceSegment {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface SilenceDetectionOptions {
  minSilenceDuration: number; // Minimum silence duration to consider (in seconds)
  silenceThreshold: number; // Volume threshold (0-1, default 0.01)
}

export async function detectSilenceSegments(
  audioFile: File,
  options: SilenceDetectionOptions = {
    minSilenceDuration: 0.3,
    silenceThreshold: 0.01,
  }
): Promise<SilenceSegment[]> {
  // Create audio context
  const AudioContextClass =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const audioContext = new AudioContextClass();

  // Read and decode audio file
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  // Get audio data from first channel
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Find silence periods
  const silencePeriods: { start: number; end: number }[] = [];
  let silenceStart: number | null = null;

  const samplesPerCheck = Math.floor(sampleRate * 0.01); // Check every 10ms

  for (let i = 0; i < channelData.length; i += samplesPerCheck) {
    // Calculate RMS (Root Mean Square) for this window
    let sum = 0;
    const windowSize = Math.min(samplesPerCheck, channelData.length - i);

    for (let j = 0; j < windowSize; j++) {
      sum += channelData[i + j] * channelData[i + j];
    }

    const rms = Math.sqrt(sum / windowSize);
    const time = i / sampleRate;

    // Check if this is silence
    if (rms < options.silenceThreshold) {
      if (silenceStart === null) {
        silenceStart = time;
      }
    } else {
      if (silenceStart !== null) {
        const silenceDuration = time - silenceStart;
        if (silenceDuration >= options.minSilenceDuration) {
          silencePeriods.push({
            start: silenceStart,
            end: time,
          });
        }
        silenceStart = null;
      }
    }
  }

  // Handle silence at the end
  if (silenceStart !== null) {
    const endTime = channelData.length / sampleRate;
    const silenceDuration = endTime - silenceStart;
    if (silenceDuration >= options.minSilenceDuration) {
      silencePeriods.push({
        start: silenceStart,
        end: endTime,
      });
    }
  }

  // Convert silence periods to audio segments
  const segments: SilenceSegment[] = [];
  let segmentStart = 0;

  for (const silence of silencePeriods) {
    if (silence.start > segmentStart) {
      segments.push({
        start: segmentStart,
        end: silence.start,
        text: "", // No text available from silence detection
        confidence: 0, // Silence detection has no confidence score
      });
    }
    // Next segment starts after this silence
    segmentStart = silence.end;
  }

  // Add final segment if there's audio after the last silence
  const totalDuration = channelData.length / sampleRate;
  if (segmentStart < totalDuration) {
    segments.push({
      start: segmentStart,
      end: totalDuration,
      text: "",
      confidence: 0, // Silence detection has no confidence score
    });
  }

  // Filter out segments shorter than 1 second (likely false detections)
  const filteredSegments = segments.filter((segment) => {
    const duration = segment.end - segment.start;
    return duration >= 1.0; // Minimum 1 second
  });

  return filteredSegments;
}
