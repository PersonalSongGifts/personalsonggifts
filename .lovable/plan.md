

# Fix 404 on Published `/admin` Route

## What's Happening

You're seeing a **404 Page not found** when you go directly to `www.personalsonggifts.com/admin` on your published site. The same route works fine on the Lovable preview.

This is a **common issue with Single Page Applications (SPAs)**. Your app uses React Router, which handles all navigation in the browser. But when you type `/admin` directly into the address bar on a published site:

1. The browser asks the web server for a file at `/admin`
2. The server looks for an actual folder or file named "admin"
3. No such file exists — the server returns 404
4. React never gets a chance to load and handle the route

## The Fix

I'll add a **`_redirects`** file to the `public/` folder. This file tells the hosting server: "For any URL that doesn't match a real file, serve `index.html` instead and let React handle it."

### Changes

**Create `public/_redirects`:**
```text
/*    /index.html   200
```

This single line instructs the hosting platform to:
- Match any path (`/*`)
- Serve `index.html` with a 200 status
- Allow React Router to take over and display the correct page

## After the Fix

Once deployed:
1. Navigate to `www.personalsonggifts.com/admin`
2. You'll see the **Admin Dashboard** login screen
3. Enter the password you set earlier
4. Access the Analytics and Orders tabs

## Important Notes

- This fix works for Lovable's built-in hosting and most static hosts (Netlify, Cloudflare Pages, etc.)
- If you're using a custom domain with a different host (like Vercel), a similar approach applies but the file format may differ
- All existing routes (`/create`, `/checkout`, `/confirmation`, etc.) will also benefit from this fix

