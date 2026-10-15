# 🐳 ANiii STORE - Premium Anime Merchandise E-Commerce Platform

Welcome to **ANiii STORE**, a high-end, responsive, and visually stunning e-commerce web platform dedicated to authentic anime figures, keychains, posters, apparel, and accessories.

Built with **modern HTML5, CSS3, and vanilla ECMAScript 2026**, this project demonstrates how to construct a professional multipage e-commerce application with a unified state controller, fault-tolerant client persistence, real-time catalog filtering, comprehensive automated unit tests, and accessible glassmorphic UI micro-interactions without heavy frontend framework overhead.

---

## 🌟 1. Main Features

* **Multipage Architecture**: Seamlessly linked multi-page structure consisting of the **Home Page** (`web2.html`) and the **Products Catalog** (`product.html`).
* **Centered Glassmorphic Navigation**: Sticky 100% viewport-width navbar featuring blur filters (`backdrop-filter: blur(15px)`), live cart badge indicators, and dynamic active menu indicators.
* **Persistent Cross-Page Shopping Cart**: State is managed via `CartService` and synchronized across all browser tabs and pages using a resilient `SafeStorage` adapter.
* **Slide-Out Cart Drawer UI**: Premium slide-over cart drawer with animated transitions, quantity stepper (+/-), item removal, subtotal calculation, and keyboard accessibility (`Escape` key close, focus traps).
* **Instant Catalog Search & Category Filtering**:
  * Real-time search by title and description on the product catalog.
  * URL query parameter synchronization (`?search=...` and `?category=...`).
  * Seamless cross-navigation from Home page category cards directly to filtered catalog views.
  * Informative empty search state with one-click filter resets.
* **Multi-Variant Toast Notifications**: Accessible floating notifications (`success`, `error`, `warning`, `info`) with XSS protection and auto-cleanup.
* **Interactive Micro-Interactions**: Visual bounce animations on the navbar cart badge upon adding items, hover elevations, and dynamic gradient movement.
* **Viewport Scroll Reveals**: Native `IntersectionObserver` triggering smooth fade-ins and slide-ups as the user scrolls.
* **Image Error Resilience**: Automatic fallback to themed inline SVG graphics if remote CDN images fail to load or are blocked.

---

## 🛠️ 2. Technologies Used

* **Core Structure**: HTML5 Semantic markup (`<header>`, `<main>`, `<section>`, `<nav>`, `<aside>`, `<footer>`) with ARIA accessibility roles.
* **Styling & Design System**: Modern Vanilla CSS3:
  * CSS Custom Properties (Design Tokens for colors, fonts, transitions).
  * Glassmorphism with `backdrop-filter: blur()`.
  * CSS Grid & Flexbox layouts.
  * Keyframe animations (`bgmove`, `cartBounce`, `fade-in`).
  * Typography: Google Fonts ([Outfit](https://fonts.google.com/specimen/Outfit)).
* **Client Logic & State Management**: Vanilla JavaScript (ES2026):
  * Object-Oriented Domain Service (`CartService`).
  * Presentation layer with event delegation (`CartUI`).
  * Fault-tolerant persistent storage adapter (`SafeStorage`).
* **Testing & Quality Assurance**:
  * Node.js Built-in Test Runner (`node:test` and `node:assert/strict`).
  * Native Code Coverage Engine (`--experimental-test-coverage`).
* **Environment & Package Management**: Node.js & npm (compatible with zero third-party production dependencies).

---

## 📂 3. Project Folder Structure

```text
bankaiii-main/
├── docs/
│   ├── API_DOCUMENTATION.md      # Comprehensive API & integration guide
│   └── STORAGE_SCHEMA.md         # Client storage specification & future DB schema
├── tests/
│   ├── cart-service.test.js      # CartService domain logic & boundary tests
│   ├── safe-storage.test.js      # Storage resilience, quota & privacy tests
│   ├── security-sanitization.test.js # XSS protection & currency formatting tests
│   └── integration-api.test.js   # Global API & backward compatibility tests
├── .env.example                  # Safe environment variable configuration template
├── .gitignore                    # Git exclusions for dependencies, coverage, and OS metadata
├── cart.js                       # Core cart domain service, UI presenter, and error boundary
├── package.json                  # Project manifest, test scripts, and metadata
├── product.html                  # Product catalog page with live filtering & category tags
├── README.md                     # Comprehensive project documentation (This file)
├── style.css                     # Centralized stylesheet (Tokens, glassmorphism, responsive)
└── web2.html                     # Home page (Hero header, categories, features, footer)
```

---

## 📋 4. Prerequisites

To view and interact with the store:
* Any modern web browser (**Chrome**, **Safari**, **Firefox**, **Edge**).

To run the automated unit test suite or development server:
* **Node.js**: v18.0.0 or higher (v26+ recommended).
* **npm**: v9.0.0 or higher.
* *(Optional)* **Python 3**: For running a local HTTP static server.

---

## 🚀 5. Installation Instructions

1. Clone or download the repository to your local workspace:
   ```bash
   git clone https://github.com/Gopi-31/bankaiii.git
   cd bankaiii-main
   ```

2. Review the project dependencies:
   > [!NOTE]
   > The application utilizes vanilla JavaScript and Node's built-in test runner. There are **zero external npm runtime dependencies required**, ensuring lightning-fast setup and zero bloat!

3. Copy the environment configuration template:
   ```bash
   cp .env.example .env
   ```

---

## ⚙️ 6. Environment Variable Configuration

The project includes a safe `.env.example` file specifying configuration options for development, testing, and future backend integration:

```ini
# Local Static Web Server Port
PORT=3000

# Environment Mode
NODE_ENV=development

# Application Base URL
APP_URL=http://localhost:3000

# Client Storage Prefix
STORAGE_KEY_PREFIX=aniii_

# Feature Flags
ENABLE_ANALYTICS=false
ENABLE_DEBUG_LOGGING=true
ENABLE_OFFLINE_STORAGE=true
```

---

## 💻 7. How to Run the Application Locally

You can launch and explore ANiii STORE using any of the methods below:

### Option A: Local Python Web Server (Recommended)
```bash
npm run serve
# Or directly:
python3 -m http.server 3000
```
Open your browser and navigate to:
* **Home Page**: [http://localhost:3000/web2.html](http://localhost:3000/web2.html)
* **Products Catalog**: [http://localhost:3000/product.html](http://localhost:3000/product.html)

### Option B: Node.js Serve
```bash
npx serve . -p 3000
```

### Option C: Direct Browser Opening (No Server Required)
Simply double-click `web2.html` or `product.html` in your file manager to open directly via the `file://` protocol. All cart features and storage operate seamlessly.

---

## 🧪 8. Testing Instructions & Test Commands

The project includes an automated unit test suite covering initialization, input validation, boundary conditions, arithmetic precision, QuotaExceeded fallbacks, and XSS sanitization.

### Available Test Commands

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm test` | Run Test Suite | Executes all 45 automated unit tests across `tests/` using Node's native test runner. |
| `npm run test:watch` | Watch Mode | Automatically re-runs test suites when source files change. |
| `npm run test:coverage` | Coverage Report | Outputs line, branch, and function coverage statistics. |

### Running Tests
Execute:
```bash
npm test
```

Sample output:
```text
▶ CartService - Initialization & Storage Recovery
  ✔ initializes with an empty cart when storage has no data
  ✔ loads valid existing items from storage
  ✔ recovers gracefully from corrupted JSON in storage without crashing
  ✔ filters out invalid item objects from stored array while keeping valid ones
▶ CartService - Adding Items (Positive Cases)
  ✔ successfully adds a valid new item
  ✔ increments quantity when adding an existing item
▶ CartService - Input Validation & Boundary Checks (Negative Cases)
  ✔ rejects empty product name with CartValidationError
  ✔ rejects negative price values
  ✔ caps item quantity at maximum allowed limit (99)
...
ℹ tests 45
ℹ pass 45
ℹ fail 0
```

---

## 📡 9. API Documentation

ANiii STORE currently operates as a client-side architecture without a custom backend server. Product listings and cart management are handled client-side.

* For complete details on external integrations (Google Fonts, CDN image assets) and the full **v2.0 REST API Specification** (`GET /api/v1/products`, `POST /api/v1/cart/validate`, `POST /api/v1/orders/checkout`), please refer to [docs/API_DOCUMENTATION.md](file:///Users/gopi/Downloads/bankaiii-main/docs/API_DOCUMENTATION.md).

---

## 🗄️ 10. Database & Storage Schema Documentation

* **Client Storage**: Cart state is serialized under the `cart` key in `localStorage` as an array of validated `CartItem` objects (`name`, `price`, `quantity`, `image`).
* **Resilience**: Managed by `SafeStorage`, which automatically catches corrupted JSON, handles Safari private browsing restrictions, and degrades to in-memory caching upon `QuotaExceededError`.
* **Future Relational Schema**: A complete PostgreSQL/MySQL schema proposal featuring an Entity-Relationship (ER) diagram, tables, foreign keys, indexes, and SQL migration scripts is documented in [docs/STORAGE_SCHEMA.md](file:///Users/gopi/Downloads/bankaiii-main/docs/STORAGE_SCHEMA.md).

---

## 🛡️ 11. Error-Handling Approach & Error Boundaries

1. **Centralized Error Boundary**:
   * Global listeners (`window.addEventListener('error')` and `unhandledrejection`) catch unexpected client runtime errors.
   * Logs technical diagnostics to the developer console while surfacing friendly, non-intrusive warning toasts to users instead of crashing page interactivity.
2. **Safe Storage Adapter (`SafeStorage`)**:
   * Protects against `JSON.parse` crashes from corrupted or externally modified storage data.
   * Recovers from storage quota restrictions and sandbox security barriers by falling back to in-memory key-value maps.
3. **Input Validation (`CartValidationError`)**:
   * All cart additions undergo strict schema validation (rejecting negative prices, non-string names, empty values, or excessive quantities).
4. **XSS Protection**:
   * Untrusted product strings are escaped via `escapeHtml()`, and notification messages are injected via `textContent`, eliminating script injection attack surfaces.
5. **Image Failure Fallback**:
   * The `setupImageFallbacks()` subsystem detects broken or blocked remote image URLs and swaps them with an inline SVG placeholder.

---

## 🔧 12. Troubleshooting Guide

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| **Cart items do not persist after restart** | Browser is in strict Private/Incognito mode with storage disabled, or storage cookies are blocked. | The app automatically uses an in-memory fallback. To preserve items permanently across sessions, enable cookies/storage or use normal browsing mode. |
| **`npm test` fails with `node: command not found`** | Node.js is not installed or not in your system `$PATH`. | Install Node.js v18+ via Homebrew (`brew install node`) or from [nodejs.org](https://nodejs.org). |
| **Product images show placeholder graphics** | Remote third-party image URLs are blocked by an ad-blocker or offline network. | The application has gracefully fallen back to the built-in SVG placeholder. Check internet connectivity. |
| **Search returns no items** | Search keywords do not match product titles or descriptions. | Click "View All Products" on the empty state banner to clear search filters. |

---

## 🔮 13. Known Limitations & Future Improvements

1. **Client-Side Only Checkout**: The checkout flow currently simulates order placement. Connecting a real payment gateway (Stripe or Razorpay) and order database is planned for v2.0.
2. **User Authentication**: The current version operates with a "Guest Collector" session. Full user accounts, password hashing, and saved delivery addresses will be added with the backend API release.
3. **Product Pagination**: Currently, 16 products are rendered in a responsive grid. As the merchandise catalog grows beyond 50 items, infinite scrolling or server-side pagination will be introduced.
4. **Localization & Currency Conversion**: Prices are presently formatted in Indian Rupees (₹ INR). Multi-currency support (USD, EUR, JPY) with real-time conversion rates is slated for v2.1.

---

## 📄 License & Attribution

* **License**: MIT License. Open for educational and commercial merchandise use.
* **Merchandise Rights**: Anime character artwork and trademarks belong to their respective creators and animation studios (Eiichiro Oda/Toei Animation, Masashi Kishimoto/Studio Pierrot, Akira Toriyama/Toei Animation, Gege Akutami/MAPPA, Koyoharu Gotouge/Ufotable).
