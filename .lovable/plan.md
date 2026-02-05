
# Comprehensive Audio Playback & Reliability Plan

## Summary

This plan addresses intermittent audio playback failures beyond just iOS Safari. It adds server-side validation, client-side error instrumentation, proper event-driven state management, and clear user fallbacks.

---

## Root Cause Analysis

| Issue | Current State | Risk |
|-------|---------------|------|
| iOS Safari requirements | No `playsInline`, `crossOrigin` attributes | Playback blocked on iOS |
| Play promise rejection | No error handling for `play()` promise | UI shows "playing" but no audio |
| No error feedback | Audio failures are silent | Users confused, no actionable steps |
| No playback instrumentation | We don't know WHY failures happen | Can't debug intermittent issues |
| Partial uploads | Song URL written before file is verified | Broken playback links possible |
| State not event-driven | `isPlaying` set immediately on click | Out of sync with actual playback |

---

## Implementation Phases

### Phase 1: Client-Side Player Fixes

**Files:** `src/pages/SongPlayer.tsx`, `src/pages/SongPreview.tsx`

#### 1.1 Add Required Audio Attributes

```html
<audio 
  ref={audioRef} 
  src={songData.song_url} 
  preload="metadata"
  playsInline
  crossOrigin="anonymous"
/>
```

#### 1.2 Event-Driven State Management

Replace immediate state toggle with event listeners:

```typescript
// Add to audio event listeners
audio.addEventListener("playing", () => setIsPlaying(true));
audio.addEventListener("pause", () => setIsPlaying(false));
audio.addEventListener("waiting", () => setIsBuffering(true));
audio.addEventListener("canplay", () => setIsBuffering(false));
audio.addEventListener("error", handleAudioError);
```

#### 1.3 Async Play with Error Handling

```typescript
const togglePlay = async () => {
  if (!audioRef.current) return;
  
  if (isPlaying) {
    audioRef.current.pause();
    return; // State will update via event listener
  }
  
  setIsBuffering(true);
  try {
    await audioRef.current.play();
    // Track play event only on success
    trackPlayEvent();
  } catch (error) {
    handlePlaybackError(error);
  } finally {
    setIsBuffering(false);
  }
};

const handlePlaybackError = (error: unknown) => {
  const err = error as Error;
  
  // Track the error for diagnostics
  trackPlaybackError(err.name, err.message);
  
  // User-friendly messages
  if (err.name === "NotAllowedError") {
    toast.error("Tap the play button to start playback");
  } else if (err.name === "NotSupportedError") {
    toast.error("Audio format not supported. Try downloading instead.");
  } else {
    toast.error("Playback failed. Try downloading the song.");
  }
  
  setIsPlaying(false);
};
```

#### 1.4 Audio Loading & Error States

Add new state variables:

```typescript
const [isBuffering, setIsBuffering] = useState(false);
const [audioError, setAudioError] = useState<string | null>(null);

const handleAudioError = (e: Event) => {
  const audio = e.target as HTMLAudioElement;
  const error = audio.error;
  
  let message = "Failed to load audio";
  if (error) {
    switch (error.code) {
      case MediaError.MEDIA_ERR_NETWORK:
        message = "Network error loading audio";
        break;
      case MediaError.MEDIA_ERR_DECODE:
        message = "Audio file is corrupted";
        break;
      case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
        message = "Audio format not supported";
        break;
    }
  }
  
  setAudioError(message);
  trackPlaybackError("MediaError", `${error?.code}: ${message}`);
};
```

#### 1.5 Always-Visible Download Button

Make download button more prominent when there's an error:

```typescript
{audioError && (
  <div className="bg-destructive/10 border border-destructive rounded-lg p-4 text-center mb-4">
    <p className="text-sm text-destructive mb-2">{audioError}</p>
    <Button onClick={downloadSong} className="gap-2">
      <Download className="h-4 w-4" />
      Download Song Instead
    </Button>
  </div>
)}
```

---

### Phase 2: Playback Error Instrumentation

**File:** `supabase/functions/track-song-engagement/index.ts`

#### 2.1 Extend Tracking Interface

```typescript
interface TrackRequest {
  type: "lead" | "order";
  action: "play" | "download" | "error";  // Add error
  token?: string;
  orderId?: string;
  errorDetails?: {
    errorName: string;
    errorMessage: string;
    userAgent: string;
    online: boolean;
    songUrlHost: string;
  };
}
```

#### 2.2 New Database Table for Error Tracking

```sql
CREATE TABLE playback_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_type TEXT NOT NULL, -- 'lead' or 'order'
  entity_id UUID NOT NULL,
  error_name TEXT NOT NULL,
  error_message TEXT,
  user_agent TEXT,
  is_online BOOLEAN,
  song_url_host TEXT
);

-- Index for analysis
CREATE INDEX idx_playback_errors_created ON playback_errors(created_at DESC);
CREATE INDEX idx_playback_errors_name ON playback_errors(error_name);
```

#### 2.3 Handle Error Tracking in Edge Function

```typescript
if (action === "error") {
  const { errorDetails } = body;
  
  await supabase.from("playback_errors").insert({
    entity_type: type,
    entity_id: type === "lead" ? lead?.id : orderId,
    error_name: errorDetails?.errorName || "Unknown",
    error_message: errorDetails?.errorMessage,
    user_agent: errorDetails?.userAgent,
    is_online: errorDetails?.online,
    song_url_host: errorDetails?.songUrlHost,
  });
  
  console.log(`Playback error tracked: ${errorDetails?.errorName}`);
  
  return new Response(JSON.stringify({ success: true }), { ... });
}
```

#### 2.4 Client-Side Error Tracking Helper

```typescript
// In SongPlayer.tsx
const trackPlaybackError = (errorName: string, errorMessage: string) => {
  if (!orderId) return;
  
  fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track-song-engagement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "order",
      action: "error",
      orderId,
      errorDetails: {
        errorName,
        errorMessage,
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        songUrlHost: new URL(songData.song_url).host,
      },
    }),
  }).catch(console.error);
};
```

---

### Phase 3: Server-Side Upload Validation

**File:** `supabase/functions/upload-song/index.ts`

#### 3.1 Add HEAD Verification After Upload

After uploading to storage, verify the file is accessible:

```typescript
// After storage upload succeeds, verify the file is readable
const verifyUrl = urlData.publicUrl; // Without cache buster for verification

const headResponse = await fetch(verifyUrl, { method: "HEAD" });

if (!headResponse.ok) {
  console.error(`Upload verification failed: ${headResponse.status}`);
  throw new Error("Upload verification failed - file not accessible");
}

// Verify headers
const contentType = headResponse.headers.get("content-type");
const contentLength = headResponse.headers.get("content-length");
const acceptRanges = headResponse.headers.get("accept-ranges");

// Log verification results
console.log(`Verification: status=${headResponse.status}, type=${contentType}, size=${contentLength}, ranges=${acceptRanges}`);

// Warn if content type is wrong (but don't fail)
if (contentType && !contentType.includes("audio/")) {
  console.warn(`Unexpected content type: ${contentType}`);
}

// Minimum size check (at least 10KB for a real audio file)
if (contentLength && parseInt(contentLength) < 10000) {
  console.warn(`Unusually small file: ${contentLength} bytes`);
}
```

#### 3.2 Return Verification Data

```typescript
return new Response(
  JSON.stringify({ 
    success: true, 
    url: publicUrl,
    orderId: targetId,
    fileName: storagePath,
    songTitle: songTitle,
    coverImageUrl: coverImageUrl,
    type: "order",
    verification: {
      status: headResponse.status,
      contentType,
      contentLength: parseInt(contentLength || "0"),
      supportsRanges: acceptRanges === "bytes",
    }
  }),
  { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

---

### Phase 4: Storage CORS Verification

Storage bucket CORS is configured at the Supabase level. The songs bucket is already public, but we should verify it serves correct headers.

**No code change needed** - but I will add documentation on how to verify this in the Admin panel.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/SongPlayer.tsx` | iOS attributes, async play, error handling, buffering state, error UI |
| `src/pages/SongPreview.tsx` | Same player fixes for lead preview page |
| `supabase/functions/track-song-engagement/index.ts` | Add error tracking action |
| `supabase/functions/upload-song/index.ts` | Add HEAD verification after upload |

## Database Changes

New table `playback_errors` for diagnostics (low priority, can skip if you prefer).

---

## Summary of Changes

| Fix | Impact |
|-----|--------|
| Add `playsInline` + `crossOrigin` | iOS Safari playback works |
| Async play with try/catch | No more silent failures |
| Event-driven state | UI matches actual playback state |
| Loading spinner | Users know audio is buffering |
| Error toast + download fallback | Users have a way forward when play fails |
| Error instrumentation | We can see WHY failures happen in admin |
| Upload verification | Prevents broken song URLs from being saved |

---

## Expected Outcomes

After implementation:
- iOS Safari users can play songs
- Any playback failure shows a clear error message
- Download button is always available as fallback
- We can analyze error patterns in the database
- No more "ghost" failures where nothing happens on tap
