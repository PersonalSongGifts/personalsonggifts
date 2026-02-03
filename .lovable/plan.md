

## Fix Automated Preview Clips to Be Exactly 45 Seconds

### Problem
The automated song generation pipeline creates preview clips that are only ~35 seconds instead of 45 seconds. This happens because the byte-slicing logic assumes 128kbps MP3 files, but Suno outputs higher bitrate audio (~165-192kbps).

### Solution
Parse the MP3 file header to detect the actual bitrate, then calculate the correct number of bytes for a 45-second clip.

---

## Technical Changes

### File: `supabase/functions/automation-suno-callback/index.ts`

**Replace** the hardcoded `createPreviewClip` function with a smarter version that:

1. Reads the MP3 frame header to detect actual bitrate
2. Calculates bytes-per-second based on detected bitrate
3. Falls back to 192kbps if detection fails (safer default for high-quality audio)

```text
Current code (inaccurate):
  const estimatedBytesPerSecond = 16 * 1024; // ~128kbps (WRONG for Suno)

New code (accurate):
  1. Parse first MP3 frame header to get actual bitrate
  2. Calculate: bytesPerSecond = bitrate / 8
  3. Slice: previewBytes = 45 * bytesPerSecond
```

**MP3 Frame Header Parsing Logic:**
- MP3 frames start with sync word `0xFF 0xFB` (or `0xFF 0xFA`, `0xFF 0xF3`, etc.)
- Bits 12-15 contain the bitrate index
- Map index to actual bitrate (e.g., index 9 for MPEG1 Layer3 = 128kbps, index 11 = 192kbps)

**Implementation approach:**
```typescript
function detectMp3Bitrate(buffer: Uint8Array): number {
  // Find frame sync (0xFF followed by 0xF* or 0xE*)
  for (let i = 0; i < Math.min(buffer.length - 4, 4096); i++) {
    if (buffer[i] === 0xFF && (buffer[i + 1] & 0xE0) === 0xE0) {
      // Found sync word - parse header
      const header = (buffer[i] << 24) | (buffer[i + 1] << 16) | (buffer[i + 2] << 8) | buffer[i + 3];
      
      const versionBits = (header >> 19) & 0x03;
      const layerBits = (header >> 17) & 0x03;
      const bitrateIndex = (header >> 12) & 0x0F;
      
      // Lookup bitrate from standard MP3 tables
      // Return detected bitrate in kbps
    }
  }
  return 192; // Safe default for high-quality audio
}

function createPreviewClip(buffer: Uint8Array, durationSeconds = 45): Uint8Array {
  const bitrate = detectMp3Bitrate(buffer);
  const bytesPerSecond = (bitrate * 1024) / 8;
  const previewBytes = Math.min(durationSeconds * bytesPerSecond, buffer.length);
  
  if (previewBytes >= buffer.length * 0.9) {
    return buffer;
  }
  
  return buffer.slice(0, Math.floor(previewBytes));
}
```

---

## Why This Works

| Suno Bitrate | Old Code (assumes 128kbps) | New Code (detects actual) |
|--------------|---------------------------|---------------------------|
| 128kbps | 45 sec ✅ | 45 sec ✅ |
| 160kbps | 36 sec ❌ | 45 sec ✅ |
| 192kbps | 30 sec ❌ | 45 sec ✅ |
| 256kbps | 22.5 sec ❌ | 45 sec ✅ |
| 320kbps | 18 sec ❌ | 45 sec ✅ |

---

## Deployment

1. Update `supabase/functions/automation-suno-callback/index.ts` with the bitrate-aware clipping function
2. Deploy edge function
3. Test with a new automated lead generation

---

## Verification

After deployment, create a new test lead through automation and verify:
- The preview clip plays for exactly 45 seconds (or full song length if shorter)
- The preview URL works in the song preview page

