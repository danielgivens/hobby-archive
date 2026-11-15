// @ts-check
import { defineConfig } from 'astro/config';

// Static output deploys straight to Cloudflare (Workers static assets, see wrangler.jsonc).
// When a CMS that needs a server (e.g. EmDash) is added, install @astrojs/cloudflare
// and switch to `adapter: cloudflare()`.
export default defineConfig({
  site: 'https://archive.hobbyhotsauce.com',
  output: 'static',
});
