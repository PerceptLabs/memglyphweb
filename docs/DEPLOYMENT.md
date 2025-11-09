# 🚀 MemGlyph PWA Deployment Guide

This guide covers deploying MemGlyph to various hosting platforms with the required security headers for optimal performance and security.

## 📋 Table of Contents

- [Required Headers](#-required-headers)
- [Platform-Specific Configuration](#-platform-specific-configuration)
  - [Vercel](#vercel)
  - [Netlify](#netlify)
  - [Cloudflare Pages](#cloudflare-pages)
  - [Nginx](#nginx)
  - [Apache](#apache)
- [Security Best Practices](#-security-best-practices)
- [Testing Your Deployment](#-testing-your-deployment)

---

## 🔒 Required Headers

MemGlyph requires specific HTTP headers for full functionality and security:

### 1. Cross-Origin Isolation Headers (Required for SQLite WASM)

SQLite WASM with multi-threading requires `SharedArrayBuffer`, which needs cross-origin isolation:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

**Why these are required:**
- `COOP: same-origin` isolates your browsing context from other origins
- `COEP: require-corp` ensures all resources are explicitly marked as shareable
- Together, they enable `SharedArrayBuffer` for multi-threaded SQLite WASM performance

**Without these headers:**
- SQLite WASM will fall back to single-threaded mode
- Performance may be degraded for large capsules
- Some features may not work optimally

### 2. Content Security Policy (Recommended)

Protect against XSS attacks with a strict CSP:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:
```

**Breakdown:**
- `default-src 'self'` - Only load resources from same origin by default
- `script-src 'self' 'wasm-unsafe-eval'` - Allow scripts from same origin + WASM
- `style-src 'self' 'unsafe-inline'` - Allow inline styles (required for dynamic styling)
- `worker-src 'self' blob:` - Allow web workers (required for SQLite worker)
- `connect-src 'self' blob: data:` - Allow fetch/XHR to same origin, blob, and data URLs
- `img-src 'self' data: blob:` - Allow images from same origin, data URLs, and blobs

### 3. Additional Security Headers (Recommended)

```
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## 🌐 Platform-Specific Configuration

### Vercel

Create or update `vercel.json` in your project root:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "Cross-Origin-Opener-Policy",
          "value": "same-origin"
        },
        {
          "key": "Cross-Origin-Embedder-Policy",
          "value": "require-corp"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:"
        },
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "SAMEORIGIN"
        },
        {
          "key": "Referrer-Policy",
          "value": "strict-origin-when-cross-origin"
        }
      ]
    }
  ]
}
```

**Deploy:**
```bash
npm run build
vercel --prod
```

---

### Netlify

Create or update `netlify.toml` in your project root:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Cross-Origin-Opener-Policy = "same-origin"
    Cross-Origin-Embedder-Policy = "require-corp"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "SAMEORIGIN"
    Referrer-Policy = "strict-origin-when-cross-origin"

[build]
  publish = "dist"
  command = "npm run build"
```

**Deploy:**
```bash
npm run build
netlify deploy --prod
```

---

### Cloudflare Pages

Create `_headers` file in your `public/` directory:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin
```

**Deploy:**
```bash
npm run build
# Deploy through Cloudflare Pages dashboard or Wrangler CLI
```

---

### Nginx

Add to your site configuration (`/etc/nginx/sites-available/your-site`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    root /var/www/memglyph/dist;
    index index.html;

    # Security Headers
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # SPA fallback - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|wasm)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

**Reload Nginx:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

---

### Apache

Create or update `.htaccess` in your `dist/` directory:

```apache
# Enable mod_headers
<IfModule mod_headers.c>
    # Cross-Origin Isolation Headers
    Header set Cross-Origin-Opener-Policy "same-origin"
    Header set Cross-Origin-Embedder-Policy "require-corp"

    # Content Security Policy
    Header set Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' data: blob:"

    # Additional Security Headers
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# SPA Routing - Rewrite all requests to index.html
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /
    RewriteRule ^index\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
</IfModule>

# Cache Control for Static Assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType application/javascript "access plus 1 year"
    ExpiresByType application/wasm "access plus 1 year"
    ExpiresByType text/css "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
</IfModule>
```

---

## 🛡️ Security Best Practices

### 1. XSS Prevention

MemGlyph includes built-in XSS protection via DOMPurify sanitization:

- ✅ All user-generated content is sanitized before rendering
- ✅ Markdown rendering uses strict allowlists
- ✅ Search result snippets are sanitized
- ✅ LLM-generated content is sanitized

**Additional recommendations:**
- Always use HTTPS in production
- Keep dependencies updated (`npm audit`)
- Review capsule content before deployment

### 2. Query Safety

MemGlyph includes query safety limits:

- Max 10,000 results per general query
- Max 1,000 results per FTS query
- Prevents resource exhaustion attacks

### 3. Capsule Integrity

When deploying capsules:
- Verify capsule integrity with checksum validation
- Use trusted sources for capsule files
- Implement file size limits on uploads (if allowing user uploads)

### 4. HTTPS Only

Always deploy with HTTPS. Many features (Service Workers, Web Workers, etc.) require secure contexts:

```nginx
# Nginx: Redirect HTTP to HTTPS
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}
```

---

## ✅ Testing Your Deployment

### 1. Check Headers

Use browser DevTools or command line:

```bash
curl -I https://your-domain.com
```

Verify these headers are present:
- ✅ `Cross-Origin-Opener-Policy: same-origin`
- ✅ `Cross-Origin-Embedder-Policy: require-corp`
- ✅ `Content-Security-Policy: ...`

### 2. Test SharedArrayBuffer

Open browser console and run:

```javascript
typeof SharedArrayBuffer
// Should return: "function"
```

If it returns `"undefined"`, cross-origin isolation headers are not working.

### 3. Test SQLite WASM

1. Open your deployed MemGlyph site
2. Load a capsule
3. Check console for errors
4. Verify search functionality works

### 4. Security Headers Check

Use online tools:
- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Security Headers](https://securityheaders.com/)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)

### 5. PWA Functionality

Test offline functionality:
1. Load the site
2. Load a capsule
3. Disconnect from internet
4. Verify search and browsing still work

---

## 🐛 Troubleshooting

### SharedArrayBuffer is undefined

**Cause:** Missing COOP/COEP headers

**Fix:**
1. Verify headers are configured correctly
2. Check headers with `curl -I`
3. Clear browser cache and try again

### CSP violations in console

**Cause:** Resources blocked by Content Security Policy

**Fix:**
1. Check which resources are blocked
2. Update CSP to allow necessary resources
3. Ensure all external resources use HTTPS

### Service Worker not registering

**Cause:** Not served over HTTPS or wrong scope

**Fix:**
1. Ensure deployment uses HTTPS
2. Check Service Worker scope in registration
3. Verify `service-worker.js` is accessible

### CORS errors when loading capsules

**Cause:** Capsule served from different origin without CORS headers

**Fix:**
1. Serve capsules from same origin, OR
2. Add CORS headers to capsule server:
   ```
   Access-Control-Allow-Origin: *
   Cross-Origin-Resource-Policy: cross-origin
   ```

---

## 📚 Additional Resources

- [MDN: Cross-Origin Isolation](https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated)
- [web.dev: COOP and COEP](https://web.dev/coop-coep/)
- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [SQLite WASM Requirements](https://sqlite.org/wasm/doc/trunk/index.md)

---

## 🤝 Support

If you encounter deployment issues:

1. Check this guide's troubleshooting section
2. Review browser console for errors
3. Verify headers with `curl -I`
4. Open an issue on GitHub with deployment details

---

**Happy Deploying! 🚀**
