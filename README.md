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

### Supported pages

| Store | Where X-Ray opens | Search buttons |
| --- | --- | --- |
| Amazon.com | Product pages and written-review pages | eBay used and Best Buy open-box on product pages |
| BestBuy.com | Product pages, including newer `/product/…/J39QHTC9S2` URLs | Amazon and eBay used |
| eBay.com | Product pages | Amazon and Best Buy open-box |

The sidebar reads structured product data (JSON-LD), then checks labeled specifications for brand, model, SKU, and GTIN. On Amazon, the storefront byline can supply the brand. If a store changes its layout, some fields may appear as unavailable.

### Prices and promotions

- **Local history.** Opening the sidebar on Amazon or Best Buy saves one price snapshot per product per day on this device. eBay offers stay in browser session memory.
- **Earlier Amazon prices.** Links open Keepa and camelcamelcamel charts. The sidebar chart uses local snapshots. Importing Keepa data would require a subscription key.
- **Promotions.** The sidebar shows coupons, deals, and claim codes visible on the product page. Eligibility and final discounts depend on checkout.

### Cross-store searches and used offers

Search buttons use a cleaned product name. An exact search is also available when the page supplies a model or GTIN.

- **Where offers come from.** On Amazon product pages, X-Ray checks eBay used and Best Buy open-box listings. It tries the local eBay API backend first and falls back to an eBay page lookup if the API is unavailable.
- **How matching works.** A lookup needs a model, GTIN, or brand with a distinctive numbered variant. When a specific model number is available, sellers who omit it can be missed. X-Ray checks for conflicting variants and speeds, filters accessory and parts listings, and deduplicates eBay offers by item ID.
- **How prices compare.** When the page price is known, a candidate’s item price must be below it and at least 30% of it. Offers with fixed USD shipping rank first. Savings compare the item plus quoted shipping with the current page price before tax. Delivery costs can vary by address.
- **If a lookup fails.** The sidebar reports blocked requests, unreadable pages, or searches with no confident match. Open the store search button to let X-Ray check visible listings in that tab and update the Amazon sidebar.

### Written reviews

**How the sample grows**

- Open the sidebar to analyze visible written reviews. On Amazon, X-Ray also requests one page each of one-, two-, three-, and five-star reviews. A page counts only when it adds unique reviews. On Best Buy and eBay, X-Ray may follow up to two review pages.
- For a larger Amazon sample, open the one-star or five-star link and use Amazon’s **view more** control. The review-page panel and any open sidebar for that product update as reviews appear.
- X-Ray keeps up to 500 captured Amazon reviews per product on this device for one day. The retailer’s rating total can include ratings without written text.

**How to read the results**

- **Reported pros and cons** group phrases about topics such as fit, setup, durability, delivery, and value. Expand a theme to read supporting excerpts. A mixed review can contribute to both sides.
- **Review signals** describe patterns in the sample. Star filters can skew the results, and a small or targeted sample receives no reliability verdict. Phrase rules can misread hypothetical praise, comparisons with an older product, or reviews of another variant.
- **Incentive mentions** quote a reviewer’s account of a possible incentive. The offer itself is unverified.
- **Retailer summaries** appear separately when readable. The retailer generates these summaries, and they can be inaccurate.
