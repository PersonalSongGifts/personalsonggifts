/**
 * Client-side audio clipping utility
 * Creates a 45-second preview clip from an audio file
 */

const PREVIEW_DURATION_SECONDS = 45;

export async function createAudioPreview(file: File): Promise<Blob> {
  const arrayBuffer = await file.arrayBuffer();
  
  // Create audio context
  const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  
  // Decode the audio file
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // Calculate preview duration (minimum of file duration or 45 seconds)
  const previewDuration = Math.min(audioBuffer.duration, PREVIEW_DURATION_SECONDS);
  const previewSamples = Math.floor(previewDuration * audioBuffer.sampleRate);
  
  // Create a new buffer for the preview
  const previewBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    previewSamples,
    audioBuffer.sampleRate
  );
  
  // Copy the first 45 seconds of audio
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const sourceData = audioBuffer.getChannelData(channel);
    const destData = previewBuffer.getChannelData(channel);
    
    for (let i = 0; i < previewSamples; i++) {
      destData[i] = sourceData[i];
    }
    
    // Apply a short fade out at the end (0.5 seconds)
    const fadeOutSamples = Math.floor(0.5 * audioBuffer.sampleRate);
    const fadeOutStart = previewSamples - fadeOutSamples;
    for (let i = fadeOutStart; i < previewSamples; i++) {
      const fadeProgress = (i - fadeOutStart) / fadeOutSamples;
      destData[i] *= 1 - fadeProgress;
    }
  }
  
  // Encode to WAV (simpler than MP3, works in all browsers)
  const wavBlob = audioBufferToWav(previewBuffer);
  
  // Close the audio context
  audioContext.close();
  
  return wavBlob;
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Interleave channels and write audio data
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      // Clamp and convert to 16-bit
      const s = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Generate a random preview token (16 characters)
 */
export function generatePreviewToken(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let token = '';
  for (let i = 0; i < 16; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}
