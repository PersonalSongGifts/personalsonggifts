

# Fix Custom Domain 404 on /admin Route

## Problem Summary

You're seeing a **404 error on personalsonggifts.com/admin** (your custom domain). This is a **client-side routing issue**, not an edge function issue. When someone directly navigates to `/admin` on the published site, the server doesn't know about React Router routes and returns a 404 instead of serving `index.html`.

The `public/_redirects` file exists with the correct content:
```
/*    /index.html   200
```

However, this configuration is only being recognized on the Lovable-hosted URLs, not your custom domain.

---

## Root Cause

Your custom domain (personalsonggifts.com) is likely hosted separately from the Lovable published URL. The `_redirects` file is a Netlify/Lovable-specific configuration. If your custom domain is:

1. **A CNAME pointing to a different host** - The redirects may not be applied
2. **Behind a CDN or proxy** - The CDN needs to be configured for SPA routing
3. **Not yet republished** - The latest `_redirects` may not be deployed

---

## Solution

### Option A: Republish the Site

The simplest fix is to **publish the site again** from Lovable. This ensures the `_redirects` file and all recent changes are deployed to the published URL.

**Steps:**
1. Click the "Publish" button in the Lovable interface
2. Wait for the deployment to complete
3. Try accessing personalsonggifts.com/admin again

### Option B: Verify Custom Domain Configuration

If republishing doesn't work, the issue is how your custom domain is configured:

1. **Check DNS settings**: Ensure personalsonggifts.com is properly CNAME'd to the Lovable published URL
2. **Clear CDN cache**: If using Cloudflare or another CDN, purge the cache
3. **Check for conflicting configuration**: Some hosting providers override redirect rules

---

## What This Fix Does

- Ensures the server returns `index.html` for all routes (including `/admin`)
- React Router then handles the routing client-side
- This is the standard pattern for Single Page Applications (SPAs)

---

## Immediate Action

**Republish your site from Lovable to apply the `_redirects` configuration to your custom domain.**

---

## Note

The edge functions we fixed earlier are working correctly - this 404 is a static hosting/routing issue, not an API issue. Once the SPA routing is fixed, your admin login should work properly with the new health check and improved error messages.

