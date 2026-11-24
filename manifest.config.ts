import { defineManifest } from '@crxjs/vite-plugin';

export default defineManifest({
  manifest_version: 3,
  name: 'Shopping X-Ray',
  description: 'See product details, review signals, used and open-box offers, and local price history.',
  version: '0.1.0',
  permissions: ['storage'],
  host_permissions: [
    'https://*.amazon.com/*',
    'https://*.bestbuy.com/*',
    'https://*.ebay.com/*',
    'http://127.0.0.1:8787/*',
  ],
  background: { service_worker: 'src/background.ts', type: 'module' },
  content_scripts: [
    {
      matches: [
        'https://*.amazon.com/*',
        'https://*.bestbuy.com/*',
        'https://*.ebay.com/*',
      ],
      js: ['src/content.tsx'],
      run_at: 'document_idle',
    },
  ],
});
