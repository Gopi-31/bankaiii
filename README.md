# 🐳 ANiii STORE — Premium Anime Merchandise E-Commerce Platform

Welcome to **ANiii STORE**, a high-end, responsive, and visually immersive e-commerce web platform engineered for authentic anime figures, keychains, posters, apparel, and accessories.

Built using **modern HTML5, CSS3, and vanilla ECMAScript 2026 standards**, this project demonstrates how to build a production-grade multipage e-commerce application featuring an Object-Oriented Domain Model, Observable state management, fault-tolerant client persistence, real-time catalog filtering, multi-tier error boundaries, comprehensive automated unit testing, and accessible glassmorphic UI micro-interactions without third-party frontend framework bloat.

---

## 📑 Table of Contents

1. [Project Overview & Objectives](#-1-project-overview--objectives)
2. [Architecture & Application Data Flow](#-2-architecture--application-data-flow)
3. [Features & Technology Stack](#-3-features--technology-stack)
4. [Complete Project Directory Structure](#-4-complete-project-directory-structure)
5. [Prerequisites & Installation](#-5-prerequisites--installation)
6. [How to Run the Website Locally](#-6-how-to-run-the-website-locally)
7. [Cart State Management & Persistence](#-7-cart-state-management--persistence)
8. [Automated Testing Commands & Test Suites](#-8-automated-testing-commands--test-suites)
9. [Test Coverage Instructions & Actual Results](#-9-test-coverage-instructions--actual-results)
10. [Error-Handling Architecture & Recovery Strategies](#-10-error-handling-architecture--recovery-strategies)
11. [API Documentation (Implemented vs. Planned)](#-11-api-documentation-implemented-vs-planned)
12. [Storage Schema Documentation](#-12-storage-schema-documentation)
13. [Security Considerations & Accessibility](#-13-security-considerations--accessibility)
14. [Troubleshooting Guide](#-14-troubleshooting-guide)
15. [Known Limitations & Future Roadmap](#-15-known-limitations--future-roadmap)
16. [License & Attribution](#-license--attribution)

---

## 🌟 1. Project Overview & Objectives

ANiii STORE was designed with three core engineering objectives:
1. **Performance & Lightweight Footprint**: Deliver an app-like experience with 60fps animations, instant catalog search, and slide-out cart drawer using vanilla web standards—completely free of heavy JavaScript frontend frameworks.
2. **Defensive Architecture & Multi-Tier Resilience**: Implement browser-native error isolation, safe component initialization, automatic in-memory fallback for private browsing / quota restrictions, and safe image fallbacks.
3. **Rigorous Quality Assurance & Documentation**: Provide a comprehensive automated unit test suite with 77+ tests using Node.js built-in test runner (`node:test`), high coverage, and granular technical documentation.

---

## 🏗️ 2. Architecture & Application Data Flow

ANiii STORE follows a **Model-View-Presenter (MVP)** pattern combined with an **Observable Event Bus** and a **4-Tier Error Boundary Architecture**:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                             USER INTERFACE LAYER                            │
│   web2.html (Storefront Landing)         product.html (Merchandise Catalog) │
│       │                                      │                              │
│       └──────────────────────┬───────────────────────┘                      │
│                              │ Button Click / Keydown (Enter/Space)         │
│                              ▼                                              │
│                  Global API Wrapper Functions                               │
│       (addToCart, changeQty, removeFromCart, clearCart, checkoutCart)       │
└──────────────────────────────┬──────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DOMAIN LAYER (cart.js)                             │
│                           CartService                                       │
│    - Schema Validation (_validateItem: name, price, qty, image)             │
│    - Quantity Bounds Capping (Max 99) & Epsilon Arithmetic Precision        │
│    - In-Memory State Array                                                  │
└──────────────┬───────────────────────────────────────────────┬──────────────┘
               │                                               │
    State Save │                                Notify Changes │ (Observable)
               ▼                                               ▼
┌──────────────────────────────┐              ┌───────────────────────────────┐
│      PERSISTENCE LAYER       │              │      PRESENTATION LAYER       │
│         SafeStorage          │              │            CartUI             │
│  - Browser localStorage      │              │  - Cart Drawer Rendering      │
│  - In-Memory Map Fallback    │              │  - Navbar Badge Counter       │
│  - QuotaExceeded Recovery    │              │  - Accessible Live Regions    │
│  - Corrupted Data Cleansing  │              │  - ToastManager Notifications │
│  - Cross-Tab Synchronization │              │  - Focus Management           │
└──────────────────────────────┘              └───────────────────────────────┘
```

### Data Flow Lifecycle

1. **Trigger**: Customer clicks "Add to Cart" on `product.html` or presses Enter/Space on `.cart-icon`.
2. **Delegation**: Inline `onclick="addToCart(...)"` or event delegation invokes global wrapper.
3. **Domain Validation**: `CartService._validateItem` validates product title, non-negative price, integer quantity, and safe image URL protocol.
4. **State Mutation**: If item exists, quantity is incremented (clamped at 99); if new, item is appended.
5. **Persistence**: `_saveToStorage()` serializes array to `SafeStorage`. If `localStorage` is restricted or quota exceeded, it seamlessly falls back to memory.
6. **Subscription Notification**: `_notify()` informs all registered subscribers (`CartUI`).
7. **Rendering & Accessibility**: `CartUI.render()` safely interpolates escaped HTML, updates `#cart-count` badge, re-calculates subtotal, and triggers CSS bounce animations.
8. **Cross-Tab Sync**: When storage updates, other open tabs catch the `storage` event and synchronize their badge and drawer in real time.

---

## 🛠️ 3. Features & Technology Stack

### Features
* **Multipage Seamless Architecture**: Clean navigation between Storefront (`web2.html`) and Catalog (`product.html`).
* **Centered Glassmorphic Sticky Navbar**: Backdrop blur (`backdrop-filter: blur(15px)`), live badge counter, and dynamic menu state.
* **Persistent Cross-Page & Cross-Tab Shopping Cart**: Cart state persists across sessions and synchronizes in real time across browser tabs.
* **Accessible Slide-Over Cart Drawer**: Quantity steppers (+/-), item removal, order subtotal, empty state, keyboard dismissal (`Escape`), and focus restoration.
* **Live Catalog Search & Category Deep-Linking**:
  * Real-time search by title and description without page reloads.
  * URL query parameter synchronization (`?search=...` and `?category=...`).
  * Seamless cross-page category card deep-linking.
  * Informative empty search state with one-click filter reset.
* **Multi-Variant Toast Notifications**: Accessible status banners (`success`, `error`, `warning`, `info`) with XSS immunity.
* **Scroll Reveal Animations**: Progressive enhancement via `IntersectionObserver` triggering smooth fade-in effects.
* **Image Error Resilience**: Automatic fallback to themed inline SVG placeholder preventing broken graphics or recursive error loops.

### Technology Stack
* **Structure**: HTML5 Semantic markup (`<header>`, `<main>`, `<section>`, `<nav>`, `<aside>`, `<footer>`) with WAI-ARIA roles.
* **Styling**: Vanilla CSS3 (Custom Properties / Design Tokens, Glassmorphism, CSS Grid & Flexbox, Keyframe Animations, Google Font [Outfit](https://fonts.google.com/specimen/Outfit)).
* **Client Logic**: Vanilla ECMAScript 2026 (Object-Oriented Architecture, Observable State Pattern, Zero Framework Dependencies).
* **Testing & QA**: Node.js Built-In Test Runner (`node:test` and `node:assert/strict`), Native Code Coverage Engine (`--experimental-test-coverage`).
* **Zero Production Dependencies**: Zero external npm runtime dependencies required.

---

## 📂 4. Complete Project Directory Structure

```text
bankaiii-main/
├── docs/
│   ├── API_DOCUMENTATION.md          # Granular client JS API reference & planned REST specs
│   └── STORAGE_SCHEMA.md             # Active localStorage schema & proposed relational DB
├── tests/
│   ├── cart-service.test.js          # CartService domain logic, calculations & boundary tests
│   ├── error-boundaries.test.js      # Component isolation, image fallback & sync tests
│   ├── integration-api.test.js       # Backward compatibility global API & presentation tests
│   ├── safe-storage.test.js          # Storage resilience, quota & privacy fallback tests
│   └── security-sanitization.test.js # XSS protection, URI schemes & currency formatting tests
├── .env.example                      # Safe environment configuration template
├── .gitignore                        # Git exclusions for OS metadata, logs, and coverage
├── cart.js                           # Core domain service, UI presenter, and error boundaries
├── package.json                      # Project manifest, npm test scripts, and metadata
├── product.html                      # Product catalog page with live filtering & category tags
├── README.md                         # Comprehensive project documentation (This file)
├── style.css                         # Centralized stylesheet (Design tokens, glassmorphism, responsive)
└── web2.html                         # Home page (Hero header, categories, features, footer)
```

---

## 📋 5. Prerequisites & Installation

### Prerequisites
* Any modern web browser (**Chrome**, **Safari**, **Firefox**, **Edge**).
* **Node.js**: v18.0.0 or higher (v26+ recommended) to execute automated unit tests.
* **npm**: v9.0.0 or higher.
* *(Optional)* **Python 3**: For running a local HTTP static web server.

### Installation Instructions
1. Clone or download the repository:
   ```bash
   git clone https://github.com/Gopi-31/bankaiii.git
   cd bankaiii-main
   ```
2. Inspect the project dependencies:
   > [!NOTE]
   > The application utilizes vanilla JavaScript and Node.js native testing modules. There are **zero external production dependencies to install**, ensuring zero supply-chain risk and instantaneous startup.
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

---

## 💻 6. How to Run the Website Locally

### Option A: Local Python Server (Recommended)
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

### Option C: Direct File Opening (No Server Required)
Double-click `web2.html` or `product.html` in your file explorer to open via `file://`. All cart operations, animations, and local storage function identically.

---

## 🛒 7. Cart State Management & Persistence

1. **State Isolation**: Cart items are managed centrally in `CartService` as an array of validated objects:
   ```typescript
   {
       name: string;      // 1 to 120 characters, non-empty, trimmed
       price: number;     // Finite non-negative float, 2 decimals
       quantity: number;  // Integer 1 to 99
       image: string;     // Verified URL or inline SVG fallback
   }
   ```
2. **Defensive Mutation**:
   * Adding an existing product increments its quantity up to the maximum ceiling of 99 (`CONFIG.MAX_ITEM_QTY`).
   * Decrementing quantity to `<= 0` removes the product automatically.
   * Removing non-existent items safely returns `false` without throwing.
3. **Epsilon Math**: Floating-point price calculations use epsilon arithmetic (`Math.round((sum + Number.EPSILON) * 100) / 100`), preventing binary precision glitches (e.g. `0.10 + 0.20 = 0.3`).
4. **Observable Subscriptions**: `cartService.subscribe(listener)` automatically dispatches state updates to UI presenters.
5. **Cross-Tab Synchronization**: Changes in one window/tab trigger a `storage` event in all other open tabs, keeping counters and drawers synchronized.

---

## 🧪 8. Automated Testing Commands & Test Suites

The test suite runs on Node.js's native test runner (`node:test`) and strict assertions (`node:assert/strict`).

### Available NPM Scripts

| Command | Action | Description |
| :--- | :--- | :--- |
| `npm test` | Run Complete Test Suite | Executes all 77 automated unit and integration tests across 5 test suites. |
| `npm run test:watch` | Watch Mode | Automatically re-runs test suites on source file modifications. |
| `npm run test:coverage` | Code Coverage Report | Executes test runner with native V8 code coverage engine. |
| `npm run serve` | Local Static Server | Launches Python HTTP web server on port 3000. |

### Test Suites Breakdown

1. **`tests/cart-service.test.js`** (32 tests):
   * Storage initialization and corrupted JSON recovery.
   * Granular item cleansing and non-array payload handling.
   * Positive item additions, duplicate quantity increments, price string coercions, and free promotional items (`price: 0`).
   * Input validations: empty titles, whitespace titles, non-string types, title length boundaries (120 vs 121 chars), negative prices, non-finite numbers, and zero quantities.
   * Quantity modifications (+/-), auto-removal on zero, bounds capping at 99, and idempotent `clear()`.
   * Floating-point precision, epsilon rounding, Indian currency formatting, and state immutability.
   * Subscriber notification resilience (ensuring a throwing subscriber does not break other subscribers).
2. **`tests/safe-storage.test.js`** (8 tests):
   * In-memory CRUD operations and non-string type coercions.
   * Backend write-through with healthy storage.
   * `QuotaExceededError` handling and automatic memory mode transition.
   * `SecurityError` handling during private browsing mode.
   * Exception catching during `removeItem` and `clear` with automatic memory fallback.
3. **`tests/security-sanitization.test.js`** (12 tests):
   * HTML entity escaping against standard script tags, attribute delimiters, and quotes.
   * Inline event handler vectors (`onerror`, `onload`), SVG payloads, and nested tags.
   * `sanitizeImageUrl` protocol verification blocking `javascript:`, `vbscript:`, and `data:text/html`.
   * Currency formatting edge cases: Lakhs/Crores grouping, floats, zeros, negatives, and invalid inputs.
4. **`tests/integration-api.test.js`** (8 tests):
   * Export validation for all global API helpers and classes.
   * `addToCart` handling valid inputs, bounds capping, and catching `CartValidationError` gracefully.
   * Global `changeQty`, `removeFromCart`, `clearCart`, and `checkoutCart` execution in headless mode.
   * `ToastManager` and `CartUI` state transitions without browser DOM.
5. **`tests/error-boundaries.test.js`** (8 tests):
   * `safeInitComponent` success execution and error catching.
   * Multi-component sequential failure isolation (Component 1 error does not prevent Component 2 & 3).
   * Cross-tab `storage` event dispatching and key filtering.
   * Image fallback loop prevention (`data-fallback-applied`).
   * Global unhandled error and rejection listener registration.

---

## 📊 9. Test Coverage Instructions & Actual Results

### Running Coverage
```bash
npm run test:coverage
```

### Actual Verified Coverage Metrics

```text
ℹ tests 77
ℹ suites 15
ℹ pass 77
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms ~86ms
ℹ start of coverage report
ℹ ------------------------------------------------------------------------------
ℹ file      | line % | branch % | funcs % | uncovered lines
ℹ ------------------------------------------------------------------------------
ℹ cart.js   |  65.65 |    77.97 |   71.79 | 114-120 241-251 445-447 467-468 ...
ℹ ------------------------------------------------------------------------------
ℹ all files |  65.65 |    77.97 |   71.79 | 
ℹ ------------------------------------------------------------------------------
ℹ end of coverage report
```

> [!NOTE]
> All remaining uncovered lines in `cart.js` represent browser-only DOM listeners (e.g. interactive `DOMContentLoaded`, live `IntersectionObserver`, and window `keydown` listeners) that only execute inside a real graphical browser window.

---

## 🛡️ 10. Error-Handling Architecture & Recovery Strategies

The project implements a **4-Tier Error Boundary Architecture**:

| Tier | Scope | Mechanism | Recovery Behavior |
| :--- | :--- | :--- | :--- |
| **Tier 1: Local try/catch** | Operational functions | Focused blocks around JSON parsing, input parsing, and arithmetic. | Caught immediately; logs diagnostics and returns safe defaults (`[]`, `0`, or SVG fallback). |
| **Tier 2: Component-Level Isolation** | Subsystem bootstrap | `safeInitComponent(name, fn)` | An exception in an optional feature (e.g. ScrollReveal) is isolated, preventing disruption of essential features (e.g. CartUI). |
| **Tier 3: Global Error Telemetry** | Uncaught exceptions | `setupGlobalErrorBoundary()` listening to `error` and `unhandledrejection`. | Logs error context to console without revealing internal stack traces to users; displays non-intrusive toast. |
| **Tier 4: Storage Degradation** | Persistence adapters | `SafeStorage` automatic in-memory fallback | Switches to in-memory `Map` upon `QuotaExceededError` or `SecurityError`, allowing browsing and cart additions to continue seamlessly. |

---

## 📡 11. API Documentation (Implemented vs. Planned)

For complete technical specifications:
* Refer to the comprehensive [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md).

### Summary of Status
* **Implemented Frontend API**:
  * Classes: `CartService`, `SafeStorage`, `CartUI`, `ToastManager`, `SearchAndFilterController`.
  * Utilities: `escapeHtml`, `sanitizeImageUrl`, `formatCurrency`, `safeInitComponent`.
  * Backward-Compatible Globals: `addToCart`, `changeQty`, `removeFromCart`, `clearCart`, `checkoutCart`, `openCartDrawer`, `closeCartDrawer`.
* **Planned Backend REST API (v2.0)**:
  * `GET /api/v1/products`: Paginated catalog retrieval with filtering.
  * `GET /api/v1/products/:id`: Single product metadata.
  * `POST /api/v1/cart/validate`: Inventory and price verification.
  * `POST /api/v1/orders/checkout`: Order processing and payment gateway initiation.

---

## 🗄️ 12. Storage Schema Documentation

For detailed schema documentation:
* Refer to [docs/STORAGE_SCHEMA.md](docs/STORAGE_SCHEMA.md).

### Summary of Storage Architecture
* **Active Client Storage**: Persisted in browser `localStorage` under key `'cart'` as an array of validated `CartItem` objects with 99-quantity ceilings and epsilon decimal rounding.
* **Resilience**: Handled by `SafeStorage` with automatic in-memory `Map` fallback on quota limits or privacy restrictions.
* **Proposed Relational Database (v2.0)**: Documented with a Mermaid ER diagram and PostgreSQL/MySQL SQL DDL migration scripts covering `categories`, `products`, `users`, `orders`, and `order_items`.

---

## 🔒 13. Security Considerations & Accessibility

### Security Hardening
1. **HTML Entity Escaping**: `escapeHtml()` sanitizes all untrusted strings before insertion into DOM HTML strings, neutralizing stored and reflected XSS.
2. **DOM Injection Immunity**: `ToastManager` injects notifications exclusively via `textContent`, completely preventing script execution.
3. **URL Protocol Verification**: `sanitizeImageUrl()` blocks dangerous script protocols (`javascript:`, `vbscript:`, `data:text/html`), preventing URI-based exploits.
4. **Strict Schema Validation**: Product titles, numeric prices, and positive quantities are strictly verified; negative prices and non-finite numbers are rejected with `CartValidationError`.

### Accessibility (WCAG 2.1 AA)
1. **Semantic HTML**: Proper heading hierarchy (`<h1>` through `<h4>`), `<main>`, `<nav>`, `<header>`, and `<footer>` elements.
2. **WAI-ARIA Attributes**:
   * Slide-out cart drawer marked with `role="dialog"`, `aria-modal="true"`, and `aria-label="Shopping Cart Drawer"`.
   * Navbar cart count badge configured with `aria-live="polite"`.
   * Floating toasts configured with `role="status"` or `role="alert"`.
3. **Keyboard Navigation**:
   * Cart icon is focusable (`tabindex="0"`, `role="button"`) and activates via `Enter` or `Space`.
   * Cart drawer closes immediately on `Escape` key press.
   * Focus is moved to the close button when the drawer opens and restored to the trigger element when it closes.
   * Visible focus indicators (`:focus-visible`) across all interactive buttons, inputs, and links.

---

## 🔧 14. Troubleshooting Guide

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **Cart items do not persist after restart** | Browser is in strict Private/Incognito mode or third-party cookies/storage are blocked. | The app automatically uses an in-memory fallback. To preserve items permanently across sessions, enable cookies/storage or use normal browsing mode. |
| **`npm test` fails with `node: command not found`** | Node.js is not installed or not in your system `$PATH`. | Install Node.js v18+ via Homebrew (`brew install node`) or from [nodejs.org](https://nodejs.org). |
| **Product images display placeholder graphics** | Remote third-party CDN URLs are blocked by network firewalls, ad-blockers, or offline mode. | The application has gracefully fallen back to the built-in SVG placeholder. Check network connectivity. |
| **Search returns "No products found"** | Search keywords do not match product titles or descriptions. | Click "View All Products" on the empty state banner to reset search filters. |

---

## 🔮 15. Known Limitations & Future Roadmap

1. **Simulated Checkout**: Current checkout confirms orders client-side. Integrating a live payment gateway (Stripe or Razorpay) and order database is planned for v2.0.
2. **User Authentication**: Operates in "Guest Collector" mode. Multi-tenant customer accounts and JWT authentication will arrive with the backend release.
3. **Catalog Pagination**: Currently displays 16 curated anime items in a responsive grid. Server-side pagination or infinite scroll will be added when expanding beyond 50 products.
4. **Multi-Currency Support**: Prices are currently denominated in Indian Rupees (₹ INR). Real-time exchange rate conversion (USD, EUR, JPY) is planned for v2.1.

---

## 📄 License & Attribution

* **License**: MIT License. Open for educational and commercial merchandise development.
* **Anime Character Trademarks**: Anime character names and artwork are property of their respective creators and animation studios (Eiichiro Oda / Toei Animation, Masashi Kishimoto / Studio Pierrot, Akira Toriyama / Toei Animation, Gege Akutami / MAPPA, Koyoharu Gotouge / Ufotable).
