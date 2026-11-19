# Browser example (no build step)

This example loads `@gaballahtech/seba/browser` directly in the browser through an
[import map](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap),
so there is no bundler and no build step.

## Run it

Serve this directory over HTTP (the browser needs a secure context for Web Crypto and
IndexedDB; `localhost` counts as secure):

```bash
npx serve examples/browser
```

Then open the printed URL and complete a login.

## Configure it

The `client-id` attribute on `<seba-login>` must point at a published Solid Client ID
Document whose `redirect_uris` contains the exact callback URL you serve. A template is
in [`../clientid.jsonld`](../clientid.jsonld).

## Self-hosting (recommended for production)

The import map in `index.html` fetches `jose` and `idb` from a CDN. In production, download
those files and point the import map at your own origin so the page does not depend on a
third-party CDN:

```html
<script type="importmap">
  {
    "imports": {
      "@gaballahtech/seba/browser": "/vendor/seba-browser.js",
      "jose": "/vendor/jose.js",
      "idb": "/vendor/idb.js"
    }
  }
</script>
```

If your bundler cannot resolve bare imports from a CDN script at all, install the package
and import `@gaballahtech/seba/browser` through your bundler instead.