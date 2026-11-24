# Shopping X-Ray

A local-first Chrome extension prototype for Amazon, Best Buy, and eBay product pages.

## Run

1. Install Node.js 20.19+ and run `npm install`.
2. Run `npm run build`.
3. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist`.
4. Visit a supported product detail page and click the **X-Ray** tab on the right.

`npm run dev` starts CRXJS development mode. Reload the extension after changing the manifest.

Run `npm run check` to run the extension and backend tests, type-check the project, and build the unpacked extension. The backend tests use simulated eBay responses and require no credentials.

## Local eBay API backend

The production Browse API requires an enabled production keyset and Browse access. In a local PowerShell window, set the environment values below using your own production App ID and Cert ID, then start the backend. Keep the Cert ID private and do not commit it or share it in chat.

```powershell
$env:EBAY_APP_ID = 'your production App ID'
$env:EBAY_CERT_ID = 'your production Cert ID'
npm run ebay:local
```

Keep the terminal open, reload X-Ray in `chrome://extensions`, and open an Amazon product. The Used & open-box section reports eBay API results or an API error; store search links remain available. Stop the server with Ctrl+C. The backend listens only on `127.0.0.1:8787`, caches its eBay access token in process memory, and forwards only listing details needed for matching. It does not write listings, seller details, search queries, or credentials to disk. This server is for local development and is not prepared for public hosting.

Captured eBay offers and search contexts are kept in Chrome's memory-backed session storage, not local storage. eBay page price history is disabled. The extension clears its old persisted search captures, search contexts, and eBay price history when its background worker starts. Chrome session storage can persist while the browser runs and is cleared when the browser restarts; stale records are excluded from results. The exemption decision remains subject to eBay's interpretation.

## Current scope

The content script uses store adapters to identify product detail pages. It matches JSON-LD products to the active item when possible, then falls back to page selectors and labeled specifications for brand, model, SKU, and GTIN. It opens a Shadow DOM panel and stores one price snapshot per product per day in `chrome.storage.local` when opened.

When opened, X-Ray analyzes visible written reviews. On Amazon it also tries one page each of 1, 2, 3, and 5-star reviews. It counts a fetched page only when it adds new reviews; Amazon may return duplicate pages or block these requests. For more coverage, open the one-star or five-star review link and use Amazon's view-more control. The review page has its own X-Ray panel that updates as visible written reviews are added, and the product sidebar updates while it is open. X-Ray keeps up to 500 captured reviews per product on this device for one day. On other supported stores it may follow up to two review pages. Reported rating totals can include ratings without text, so the sample is not treated as the full set. Reported pros and reported cons use relevant phrases from the written reviews X-Ray actually read, including mixed reviews; star-filtered samples can be skewed. The phrase rules cover general issues such as fit, comfort, temperature, function, setup, durability, delivery, support, and value. They avoid hypothetical praise and complaints about a previous product when identifiable, but cannot fully understand every review or identify every unrelated variant. A retailer-generated review summary is shown separately when readable and is labeled as potentially inaccurate. A small or targeted sample receives no reliable fake-review verdict. Explicit mentions of review incentives are shown separately as reviewer statements, not proof of misconduct.

Every product page shows search buttons for the other two stores: Amazon pages link to eBay and Best Buy, eBay pages link to Amazon and Best Buy, and Best Buy pages link to Amazon and eBay. Search links use a cleaned product name, with exact-model alternatives when a model or GTIN is available. On Amazon product pages, the sidebar also tries live eBay used and Best Buy open-box searches when a model, GTIN, or a brand plus distinctive numbered variant is available. It uses the local eBay API backend when available and otherwise attempts a page lookup. Amazon storefront bylines can supply a missing brand. A specific model number must appear in an automatic match when available, so listings that omit it may be excluded. Prices appear only when a listing has a strong match and is at least 30% of the current price; accessory and parts listings are filtered. Numbered product variants and conflicting advertised speeds are checked, and eBay results are deduplicated by item ID. The sidebar distinguishes blocked stores, unreadable pages, and unmatched results. When a store blocks the background request, open an X-Ray search link in a tab: the extension can read visible listings there and return matching offers to the Amazon product sidebar. API offers with fixed USD shipping show an item-plus-shipping estimate and rank ahead of item-only prices. Percentage savings use that estimate against the current page price, before tax. Destination and checkout costs can vary.

The Promotions section reads coupons, deals, and claim codes visible in the active product page. It does not search coupon databases or verify a code at checkout.

For Amazon products, the price section links to Keepa and camelcamelcamel for older third-party history. Their charts are not imported into the local sparkline. Keepa's API requires a subscription key, which is not bundled into this extension.

Amazon review pages and product detail pages on `.amazon.com`, `.bestbuy.com`, and `.ebay.com` are matched. Best Buy's newer `/product/.../J39QHTC9S2` style URLs are supported. Site layouts can change; missing values are shown as unavailable.
