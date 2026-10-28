# 📡 ANiii STORE — Technical API & Integration Reference

**Document Version**: 2.0.0  
**Target Architecture**: Front-End Multi-Page Application (ES2026)  
**Status**: Active Client API & Planned Backend Specifications  

---

## 1. Architectural Overview & Implementation Status

ANiii STORE is built as a high-performance, client-side front-end e-commerce application. All cart state management, catalog searching, price calculations, and UI micro-interactions execute client-side in the user's browser, persisting state via `SafeStorage` (a fault-tolerant `localStorage` wrapper).

> [!IMPORTANT]
> **Active Implementation vs. Planned Specifications**:
> * **ACTIVE & FULLY IMPLEMENTED (Section 2 & 3)**: The Client-Side JavaScript API (`CartService`, `SafeStorage`, `CartUI`, `ToastManager`, `safeInitComponent`, `SearchAndFilterController`, and global helper functions) and external CDN integrations.
> * **PLANNED SPECIFICATION ONLY (Section 4)**: The REST API endpoints (`/api/v1/*`) are design specifications reserved for future backend development (v2.0). There is **no active backend web server** in the current repository.

---

## 2. Implemented Client-Side JavaScript API

All functions and classes below are implemented in [cart.js](file:///Users/gopi/Downloads/bankaiii-main/cart.js) and exposed globally on the browser `window` object as well as exported via `module.exports` for headless Node.js testing.

### 2.1 Configuration Tokens (`CONFIG`)

An immutable, frozen configuration object defining operational limits and default assets:

| Property | Type | Value | Purpose |
| :--- | :--- | :--- | :--- |
| `STORAGE_KEY` | `string` | `'cart'` | LocalStorage key name used for serialized cart data. |
| `MAX_ITEM_QTY` | `number` | `99` | Maximum allowed quantity per product line-item. |
| `MIN_ITEM_QTY` | `number` | `1` | Minimum allowable quantity for an active cart item. |
| `MAX_NAME_LENGTH`| `number` | `120` | Maximum character length for product titles. |
| `CURRENCY_SYMBOL`| `string` | `'₹'` | Currency prefix applied to monetary displays. |
| `DEFAULT_FALLBACK_IMAGE` | `string` | `data:image/svg+xml;...` | Inline SVG data URI rendered when remote images fail. |

---

### 2.2 Custom Error Types

```javascript
class CartValidationError extends Error {
    constructor(message, field = null)
}

class StorageError extends Error {
    constructor(message, cause = null)
}

class ComponentInitError extends Error {
    constructor(componentName, originalError)
}
```

* **`CartValidationError`**: Thrown when product inputs fail validation rules (`name`, `price`, `quantity`). Contains a `field` property identifying the invalid field.
* **`StorageError`**: Encapsulates persistence and quota errors with the underlying system `cause`.
* **`ComponentInitError`**: Thrown or logged by `safeInitComponent` when an individual UI subsystem fails startup.

---

### 2.3 `SafeStorage` Class (Fault-Tolerant Storage Adapter)

Provides hardware- and privacy-resilient key-value persistence. Automatically detects Safari private browsing restrictions and `QuotaExceededError`, falling back to an in-memory `Map` so the user interface never crashes.

```javascript
const storage = new SafeStorage(customBackend = null);
```

#### Methods

* **`getItem(key: string): string|null`**
  * Reads value from backend storage. Falls back to in-memory store if backend throws a `SecurityError` or is restricted.
* **`setItem(key: string, value: unknown): boolean`**
  * Coerces value to string and persists to storage.
  * If backend throws `QuotaExceededError`, automatically switches to memory mode, saves to memory store, and returns `false`.
  * Returns `true` on successful backend write.
* **`removeItem(key: string): void`**
  * Deletes key from both backend and in-memory store. Switches to memory mode if backend throws.
* **`clear(): void`**
  * Purges all keys from both backend and in-memory store.
* **`isInMemoryMode(): boolean`**
  * Returns `true` if adapter has degraded to in-memory fallback mode.

---

### 2.4 `CartService` Class (Domain Model & Observable State)

Pure business logic service decoupled from direct DOM bindings. Enforces validation rules, caps quantities, handles arithmetic precision, and manages subscriber notifications.

```javascript
const cartService = new CartService(storageAdapter = new SafeStorage());
```

#### Methods

* **`addItem(name: string, price: number|string, image?: string|null, quantity?: number): { item: Object, added: boolean, capped: boolean }`**
  * Validates inputs via `_validateItem()`.
  * If item already exists, increments quantity up to `CONFIG.MAX_ITEM_QTY` (99).
  * If new, appends item. Persists state and notifies subscribers.
  * Throws `CartValidationError` on invalid inputs.
* **`updateQuantity(name: string, delta: number): { removed: boolean, item: Object|null }`**
  * Adjusts item quantity by positive or negative integer delta.
  * Automatically removes line item if quantity drops to 0 or below.
  * Clamps quantity at 99. Persists and notifies subscribers.
* **`removeItem(name: string): boolean`**
  * Removes product completely by name. Returns `true` if removed, `false` if not found.
* **`clear(): void`**
  * Clears all items from cart and storage adapter. Notifies subscribers.
* **`getItems(): Array<{ name: string, price: number, image: string, quantity: number }>`**
  * Returns an isolated clone array of current cart items to protect domain immutability.
* **`getTotals(): { totalItems: number, totalPrice: number, formattedTotalPrice: string }`**
  * Calculates cumulative item count and total price using epsilon rounding arithmetic (`Math.round((sum + Number.EPSILON) * 100) / 100`) to prevent IEEE-754 precision bugs.
* **`subscribe(listener: Function): Function`**
  * Subscribes a callback `(items, totals) => void` to state changes.
  * Wraps listener execution in `try/catch` boundaries so a faulty subscriber cannot disrupt state mutations.
  * Returns an unsubscribe closure.
* **`syncFromStorage(): void`**
  * Re-loads state from `storageAdapter` and triggers subscribers. Used during cross-tab storage synchronization.

---

### 2.5 `CartUI` Class (Presentation Controller & DOM Bindings)

Manages slide-over drawer rendering, event delegation, focus trapping, and animations.

```javascript
const cartUI = new CartUI(cartService, toastManager);
```

#### Methods

* **`init(): void`**
  * Injects drawer into DOM (`_injectCartDrawer`), attaches event listeners, configures Escape key listeners, renders initial state, and subscribes to `CartService`.
* **`open(): void`**
  * Captures `document.activeElement` as `triggerElement`.
  * Adds `.open` class to drawer and overlay. Sets `aria-hidden="false"`. Moves focus to drawer close button.
* **`close(): void`**
  * Removes `.open` class. Sets `aria-hidden="true"`. Restores focus to original `triggerElement`.
* **`isOpen(): boolean`**
  * Returns boolean indicating if drawer is currently open.
* **`render(): void`**
  * Wrapped in an error boundary. Updates `#cart-count` navbar badge, subtotal display, and drawer list.
  * Displays `.cart-empty-msg` if empty, and `.cart-error-msg` with Retry button if rendering fails.
* **`triggerBounce(): void`**
  * Triggers CSS micro-animation bounce on `.cart-icon` elements.
* **`handleClearCart(): void`**
  * Prompts confirmation before purging items and showing toast.
* **`handleCheckout(): void`**
  * Validates non-empty cart, prompts order confirmation, and triggers success notification.

---

### 2.6 `ToastManager` Class (Accessible Notification Subsystem)

Creates accessible, multi-variant notification banners with XSS protection.

```javascript
const toastManager = new ToastManager();
toastManager.show(message, type = 'success', duration = 3000);
```

* **`show(message: string, type?: 'success'|'error'|'warning'|'info', duration?: number): void`**
  * Uses DOM `textContent` (eliminating HTML/script injection).
  * Sets `role="alert"` for error and `role="status"` with `aria-live="polite"` for others.
  * Automatically dismisses after `duration` ms.

---

### 2.7 Security & Sanitization Utilities

* **`escapeHtml(input: unknown): string`**
  * Sanitizes untrusted strings by converting `&`, `<`, `>`, `"`, and `'` into entity equivalents.
* **`sanitizeImageUrl(url: unknown): string`**
  * Blocks active script schemes (`javascript:`, `vbscript:`, `data:text/html`). Returns input if safe, or `CONFIG.DEFAULT_FALLBACK_IMAGE` if unsafe or invalid.
* **`formatCurrency(amount: unknown): string`**
  * Formats numeric price into Indian currency grouping (`en-IN`). Handles floating-point arithmetic with epsilon rounding and safely defaults invalid/negative inputs to `'0'`.

---

### 2.8 Component Failure Isolation & Error Boundaries

* **`safeInitComponent(componentName: string, initFn: Function, options?: Object): { success: boolean, error: Error|null }`**
  * Executes `initFn` inside an isolated `try/catch` boundary.
  * If `initFn` throws, logs the error, optionally displays a user-facing toast, and returns `{ success: false, error }`.
  * Guarantees that an error in one component does not abort the startup of subsequent components.
* **`setupStorageSync(cartService: CartService): void`**
  * Listens to the `window` `'storage'` event. When `event.key === CONFIG.STORAGE_KEY`, invokes `cartService.syncFromStorage()` to synchronize state across multiple tabs.
* **`setupImageFallbacks(): void`**
  * Attaches `'error'` listeners to all `<img>` tags on the page, replacing broken sources with `CONFIG.DEFAULT_FALLBACK_IMAGE`.
  * Utilizes `data-fallback-applied="true"` to prevent infinite error loops.
* **`setupGlobalErrorBoundary(): void`**
  * Attaches global `'error'` and `'unhandledrejection'` handlers, logging technical telemetry to the console while displaying safe toasts to users.

---

### 2.9 Backward-Compatible Global API Wrappers

These functions maintain 100% compatibility with inline HTML `onclick` handlers:

| Function | Signature | Description |
| :--- | :--- | :--- |
| `addToCart` | `(productName: string, price: number, imageUrl?: string)` | Adds product to cart with bounce animation and feedback toast. |
| `changeQty` | `(productName: string, delta: number)` | Stepper (+1 / -1) adjustment. |
| `removeFromCart` | `(productName: string)` | Deletes product from cart with notification. |
| `clearCart` | `()` | Prompts user confirmation to empty cart. |
| `checkoutCart` | `()` | Prompts order confirmation and completes checkout. |
| `openCartDrawer` | `()` | Expands slide-out cart drawer. |
| `closeCartDrawer` | `()` | Dismisses slide-out cart drawer. |
| `showToast` | `(message: string, type?: string)` | Displays floating notification. |
| `updateCartUI` | `()` | Triggers manual drawer and badge re-render. |

---

## 3. Active External API & Resource Integrations

Although the application has no custom backend server, it connects with external CDNs:

### 3.1 Google Fonts Web API
* **Endpoint**: `https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap`
* **Method**: `GET`
* **Purpose**: Delivery of the modern 'Outfit' geometric sans-serif typography.
* **Headers**: Standard browser stylesheet request (`Accept: text/css`).
* **Caching**: HTTP `Cache-Control: public, max-age=86400`.
* **Fallback**: System typography stack (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).

### 3.2 External Image CDNs
* **Asset Hosts**:
  * `https://images.unsplash.com` (High-definition photography)
  * `https://m.media-amazon.com` (Product catalog figures)
  * `https://4kwallpapers.com` & `https://wallpapercave.com` (Hero wallpapers)
* **Error Resilience**: In the event of a 404 or network outage, `setupImageFallbacks()` replaces the broken graphic with an inline SVG placeholder.

---

## 4. Planned Specifications for Future Backend REST API (v2.0 Proposal)

> [!NOTE]
> **PLANNED SPECIFICATION — NOT CURRENTLY IMPLEMENTED**  
> The endpoints below represent the planned contract for a future dedicated Node.js, Go, or Python backend server.

### 4.1 Get All Products
* **Endpoint**: `GET /api/v1/products`
* **Query Parameters**:
  * `category` *(optional, string)*: Filter by category slug (`figures`, `keychains`, `clothing`, etc.).
  * `search` *(optional, string)*: Keyword matching title or description.
  * `page` *(optional, integer, default: 1)*: Page number.
  * `limit` *(optional, integer, default: 20)*: Page size limit.
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "prod_zoro_statue",
        "name": "Zoro Statue",
        "category": "figures",
        "price": 499.00,
        "currency": "INR",
        "description": "Authentic Roronoa Zoro dynamic posture figure",
        "imageUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4ZV1xapPFKFIffE3lv1wTXDAtrjGImBnmDQ&s",
        "stock": 18,
        "isAvailable": true
      }
    ],
    "pagination": { "currentPage": 1, "totalPages": 1, "totalItems": 16, "hasNextPage": false }
  }
  ```

### 4.2 Get Single Product by ID
* **Endpoint**: `GET /api/v1/products/:id`
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "prod_luffy_keychain",
      "name": "Luffy Keychain",
      "category": "keychains",
      "price": 49.00,
      "currency": "INR",
      "stock": 54,
      "isAvailable": true
    }
  }
  ```

### 4.3 Validate Cart Items & Inventory
* **Endpoint**: `POST /api/v1/cart/validate`
* **Request Body**:
  ```json
  {
    "items": [
      { "productId": "prod_zoro_statue", "quantity": 2 },
      { "productId": "prod_luffy_keychain", "quantity": 1 }
    ]
  }
  ```
* **Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "isValid": true,
    "summary": { "totalItems": 3, "subtotal": 1047.00, "total": 1047.00, "currency": "INR" }
  }
  ```

### 4.4 Checkout Order
* **Endpoint**: `POST /api/v1/orders/checkout`
* **Request Body**:
  ```json
  {
    "customer": { "fullName": "Goku Son", "email": "collector@anibuy.store", "phone": "+919876543210" },
    "shippingAddress": { "street": "42 Capsule Corp Ave", "city": "Bengaluru", "state": "Karnataka", "postalCode": "560001", "country": "IN" },
    "items": [{ "name": "Zoro Statue", "price": 499.00, "quantity": 1 }],
    "paymentMethod": "UPI"
  }
  ```
* **Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "ORD-20261028-9412",
      "status": "confirmed",
      "totalAmount": 499.00,
      "currency": "INR",
      "createdAt": "2026-10-28T12:00:00Z"
    }
  }
  ```

---

## 5. Testing & Integration Examples

### Node.js Headless Unit Testing Example
```javascript
const { CartService, SafeStorage } = require('../cart.js');

const storage = new SafeStorage(null); // in-memory mode
const service = new CartService(storage);

service.addItem('Zoro Statue', 499, null, 2);
console.log(service.getTotals());
// { totalItems: 2, totalPrice: 998, formattedTotalPrice: '998' }
```

### Browser Event Delegation Example
```javascript
// Adding items via HTML inline handler
<button onclick="addToCart('Naruto Statue', 399)">Add to Cart</button>

// Listening to cart state updates
window.cartService.subscribe((items, totals) => {
    console.log(`Cart updated: ${totals.totalItems} items, Total: ₹${totals.formattedTotalPrice}`);
});
```
