

## Add Amplitude CDN Scripts to index.html

### Problem
Session Replay isn't registering in Amplitude despite the npm SDK being installed. The CDN snippet loads earlier and more reliably than the dynamic import approach.

### Plan

**1. `index.html`** — Add the three Amplitude script tags in the `<head>`, after the TikTok pixel and before the fonts section.

**2. `src/main.tsx`** — Remove the existing dynamic `import('@amplitude/unified')` block to avoid double-initialization.

Two files changed, no new dependencies.

