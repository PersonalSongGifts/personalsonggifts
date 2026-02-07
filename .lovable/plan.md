

## Force Re-publish with Trivial Change

The Cloudflare deployment got stuck due to a rate limit error, and the system thinks it already published successfully. To fix this, we just need to make a tiny harmless change to trigger a new build.

### What will happen

1. Add a single comment to `src/pages/Checkout.tsx` (e.g., `// force rebuild`)
2. This will trigger a fresh build and deployment attempt
3. Once the build succeeds, click **Share > Publish** to push the latest code (including the stackable promo code logic) live

### Files changed

| File | Change |
|------|--------|
| `src/pages/Checkout.tsx` | Add one comment line at the top of the file |

No logic changes -- just enough to kick off a new deployment.

