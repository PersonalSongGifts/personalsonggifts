

## Install Amplitude Analytics + Session Replay

### Changes

**1. Install package**
- `npm install @amplitude/unified`

**2. `src/main.tsx`** — Initialize Amplitude once at app startup
- Import `@amplitude/unified`
- Call `amplitude.initAll()` with the provided API key before `createRoot().render()`
- Config: autocapture enabled, session replay sample rate 1

```typescript
import * as amplitude from '@amplitude/unified';

amplitude.initAll('c8af55590969b980a194dbf61f9ca6a3', {
  analytics: { autocapture: true },
  sessionReplay: { sampleRate: 1 },
});
```

No other files need changes. Autocapture handles page views, clicks, and form interactions automatically. Session Replay records at 100% sample rate.

