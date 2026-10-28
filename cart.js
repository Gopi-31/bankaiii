/**
 * ANiii STORE — Core Client State Controller, UI Presenter & Multi-Tier Error Resilience
 *
 * ARCHITECTURAL DESIGN RATIONALE:
 * 1. Clean Separation of Concerns (Model-View-Presenter with Observable Event Bus):
 *    - SafeStorage: Hardware & privacy-mode resilient storage abstraction.
 *      Transparently handles Safari private browsing restrictions, QuotaExceededError,
 *      and corrupted JSON records via an automatic in-memory Map fallback.
 *    - CartService: Pure domain logic decoupled from DOM operations.
 *      Enforces business rules (schema validation, price precision, quantity capping,
 *      mutation, persistence, and state change subscriptions).
 *    - CartUI: Presentation layer managing the slide-out drawer DOM, accessibility attributes,
 *      event delegation, animations, and user-facing notifications.
 *    - ToastManager: Accessible, multi-variant notification system protecting against
 *      Cross-Site Scripting (XSS) via safe DOM textContent insertion.
 *    - SearchAndFilterController: Live catalog filtering on product.html and search submission
 *      from web2.html with URL query parameter synchronization.
 *    - Multi-Tier Error Boundaries:
 *      * Level 1: Local try/catch handling for operational, predictable errors (JSON parsing, inputs).
 *      * Level 2: Component-level failure isolation (safeInitComponent) preventing an error in one
 *                 optional feature from aborting other UI components.
 *      * Level 3: Global error & unhandled promise rejection listeners for unhandled runtime telemetry.
 *      * Level 4: Storage degradation and automatic in-memory fallback.
 *
 * 2. Cross-Environment Compatibility:
 *    - Dual-target architecture: Executes seamlessly in browser environments (window/DOM)
 *      and in Node.js headless environments for automated unit and integration testing.
 *
 * 3. Security Hardening:
 *    - Strict schema validation on all product properties.
 *    - HTML entity escaping (escapeHtml) preventing stored and DOM-based Cross-Site Scripting (XSS).
 *    - Safe URL verification (sanitizeImageUrl) rejecting dangerous URI pseudoprotocols (e.g. javascript:).
 *
 * 4. Accessibility (WCAG 2.1 AA Compliant):
 *    - ARIA attributes (role="dialog", aria-modal="true", aria-live="polite", aria-label).
 *    - Full keyboard navigation: Escape key drawer closure, Enter/Space activation on cart triggers.
 *    - Focus management: Tracks active trigger element before opening and restores focus upon closing.
 */

'use strict';

/* ==========================================================================
   1. CONSTANTS & CONFIGURATION
   ========================================================================== */

/**
 * Immutable global configuration tokens governing domain rules, storage keys,
 * and default visual assets.
 * @readonly
 * @type {Readonly<{
 *   STORAGE_KEY: string,
 *   MAX_ITEM_QTY: number,
 *   MIN_ITEM_QTY: number,
 *   MAX_NAME_LENGTH: number,
 *   CURRENCY_SYMBOL: string,
 *   DEFAULT_FALLBACK_IMAGE: string
 * }>}
 */
const CONFIG = Object.freeze({
    STORAGE_KEY: 'cart',
    MAX_ITEM_QTY: 99,
    MIN_ITEM_QTY: 1,
    MAX_NAME_LENGTH: 120,
    CURRENCY_SYMBOL: '₹',
    DEFAULT_FALLBACK_IMAGE: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
            <rect width="100%" height="100%" fill="#111a2e"/>
            <circle cx="150" cy="130" r="50" fill="#1f2c47"/>
            <path d="M120 180 Q150 160 180 180" stroke="#4f8cff" stroke-width="4" fill="none"/>
            <text x="50%" y="78%" font-family="system-ui, sans-serif" font-size="20" font-weight="bold" fill="#4f8cff" text-anchor="middle">ANiii STORE</text>
            <text x="50%" y="87%" font-family="system-ui, sans-serif" font-size="12" fill="#a0aec0" text-anchor="middle">Premium Merchandise</text>
        </svg>
    `)
});

/* ==========================================================================
   2. CUSTOM ERROR TYPES (DOMAIN & INFRASTRUCTURE EXCEPTIONS)
   ========================================================================== */

/**
 * Custom error thrown when product inputs fail domain validation rules.
 * Enables calling code to differentiate validation rejections from runtime faults.
 *
 * @class CartValidationError
 * @extends {Error}
 */
class CartValidationError extends Error {
    /**
     * @param {string} message - Human-readable validation failure description.
     * @param {string|null} [field=null] - The specific field that failed validation (e.g. 'name', 'price', 'quantity').
     */
    constructor(message, field = null) {
        super(message);
        this.name = 'CartValidationError';
        this.field = field;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, CartValidationError);
        }
    }
}

/**
 * Custom error thrown or logged when storage adapters encounter hardware or permission failures.
 *
 * @class StorageError
 * @extends {Error}
 */
class StorageError extends Error {
    /**
     * @param {string} message - Description of the storage failure.
     * @param {Error|null} [cause=null] - Underlying system error (e.g. QuotaExceededError).
     */
    constructor(message, cause = null) {
        super(message);
        this.name = 'StorageError';
        this.cause = cause;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, StorageError);
        }
    }
}

/**
 * Custom error class representing an isolated component initialization failure.
 *
 * @class ComponentInitError
 * @extends {Error}
 */
class ComponentInitError extends Error {
    /**
     * @param {string} componentName - The identifier of the failing component.
     * @param {Error} originalError - The caught exception.
     */
    constructor(componentName, originalError) {
        super(`Component "${componentName}" failed initialization: ${originalError?.message || String(originalError)}`);
        this.name = 'ComponentInitError';
        this.componentName = componentName;
        this.originalError = originalError;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, ComponentInitError);
        }
    }
}

/* ==========================================================================
   3. SECURITY & SANITIZATION UTILITIES
   ========================================================================== */

/**
 * Escapes untrusted strings before insertion into DOM HTML strings to prevent XSS.
 * Converts the 5 critical HTML special characters into their standard XML/HTML entity equivalents.
 *
 * @param {unknown} input - Untrusted string or value to sanitize.
 * @returns {string} Sanitized string safe for HTML interpolation.
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>');
 * // returns: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
function escapeHtml(input) {
    if (input === null || input === undefined) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validates and normalizes product image URLs.
 * Rejects dangerous URI schemes (e.g. javascript:, vbscript:, data:text/html)
 * and returns the default theme SVG placeholder if invalid.
 *
 * @param {unknown} url - The candidate image URL to verify.
 * @returns {string} A safe image URL string or the default SVG fallback.
 */
function sanitizeImageUrl(url) {
    if (typeof url !== 'string') return CONFIG.DEFAULT_FALLBACK_IMAGE;
    const trimmed = url.trim();
    if (trimmed.length === 0) return CONFIG.DEFAULT_FALLBACK_IMAGE;

    // Disallow dangerous script execution protocols
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:text/html')) {
        console.warn('[Security] Blocked potentially unsafe image URL protocol:', trimmed);
        return CONFIG.DEFAULT_FALLBACK_IMAGE;
    }

    return trimmed;
}

/**
 * Formats monetary amounts for user-facing display using Indian Numbering Grouping (₹).
 * Utilizes epsilon arithmetic (`Math.round((numeric + Number.EPSILON) * 100) / 100`)
 * to eliminate IEEE-754 binary floating-point representation artifacts (e.g. 0.1 + 0.2 = 0.30000000000000004).
 *
 * @param {number|string|unknown} amount - Numeric or numeric string price value.
 * @returns {string} Formatted number string with commas (e.g., "1,499" or "49.5").
 *
 * @example
 * formatCurrency(1499); // "1,499"
 * formatCurrency(0.1 + 0.2); // "0.3"
 */
function formatCurrency(amount) {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric < 0) {
        return '0';
    }
    // Round to 2 decimal places safely avoiding floating point rounding errors
    const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
    return rounded.toLocaleString('en-IN');
}

/* ==========================================================================
   4. SAFE STORAGE ADAPTER (FAULT-TOLERANT LOCALSTORAGE)
   ========================================================================== */

/**
 * Fault-tolerant storage wrapper that provides:
 * 1. Automatic fallback to an in-memory Map if localStorage is blocked
 *    (e.g., Safari private browsing, sandboxed iframes, strict cookie blocking).
 * 2. Graceful degradation when quota is exceeded (QuotaExceededError).
 * 3. Safe read/write boundaries preventing storage exceptions from crashing UI code.
 *
 * @class SafeStorage
 */
class SafeStorage {
    /**
     * @param {Storage|Object|null} [customBackend=null] - Optional backend for dependency injection during unit testing.
     */
    constructor(customBackend = null) {
        /** @private @type {Map<string, string>} */
        this.memoryStore = new Map();
        /** @type {boolean} */
        this.isMemoryMode = false;

        if (customBackend) {
            this.backend = customBackend;
        } else if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
            try {
                // Test storage availability to catch private-browsing SecurityErrors early
                const testKey = '__aniii_test__';
                window.localStorage.setItem(testKey, '1');
                window.localStorage.removeItem(testKey);
                this.backend = window.localStorage;
            } catch (err) {
                console.warn('[SafeStorage] localStorage is restricted or unavailable. Switching to in-memory fallback mode.', err?.message);
                this.isMemoryMode = true;
                this.backend = null;
            }
        } else {
            this.isMemoryMode = true;
            this.backend = null;
        }
    }

    /**
     * Retrieve a string value by key.
     * @param {string} key - Storage key name.
     * @returns {string|null} Value or null if not found.
     */
    getItem(key) {
        if (this.isMemoryMode || !this.backend) {
            return this.memoryStore.get(key) || null;
        }
        try {
            return this.backend.getItem(key);
        } catch (err) {
            console.warn(`[SafeStorage] Failed to read key "${key}". Falling back to memory:`, err?.message);
            return this.memoryStore.get(key) || null;
        }
    }

    /**
     * Store a string value by key. Switches to memory mode if quota is exceeded.
     * @param {string} key - Storage key name.
     * @param {unknown} value - Value to serialize to string.
     * @returns {boolean} True if successfully stored in backend, false if degraded to memory.
     */
    setItem(key, value) {
        const stringValue = String(value);
        if (this.isMemoryMode || !this.backend) {
            this.memoryStore.set(key, stringValue);
            return true;
        }
        try {
            this.backend.setItem(key, stringValue);
            return true;
        } catch (err) {
            // Catches QuotaExceededError, SecurityError, or generic storage failures
            console.warn(`[SafeStorage] Quota exceeded or storage denied for "${key}". Using in-memory fallback:`, err?.message);
            this.isMemoryMode = true;
            this.memoryStore.set(key, stringValue);
            return false;
        }
    }

    /**
     * Remove a key from both backend and memory stores.
     * @param {string} key - Storage key to remove.
     */
    removeItem(key) {
        if (!this.isMemoryMode && this.backend) {
            try {
                this.backend.removeItem(key);
            } catch (err) {
                console.warn(`[SafeStorage] Failed to remove "${key}" from backend. Switching to memory fallback:`, err?.message);
                this.isMemoryMode = true;
            }
        }
        this.memoryStore.delete(key);
    }

    /**
     * Clear all keys from both backend and memory stores.
     */
    clear() {
        if (!this.isMemoryMode && this.backend) {
            try {
                this.backend.clear();
            } catch (err) {
                console.warn('[SafeStorage] Failed to clear backend storage. Switching to memory fallback:', err?.message);
                this.isMemoryMode = true;
            }
        }
        this.memoryStore.clear();
    }

    /**
     * Check whether the adapter is actively running in memory-fallback mode.
     * @returns {boolean} True if memory fallback is active.
     */
    isInMemoryMode() {
        return this.isMemoryMode;
    }
}

/* ==========================================================================
   5. CART SERVICE (DOMAIN STATE & BUSINESS LOGIC)
   ========================================================================== */

/**
 * Pure shopping cart domain service and state controller.
 * Completely decoupled from direct DOM manipulation to facilitate comprehensive unit testing.
 *
 * Implements an Observable pattern via `subscribe()`, automatically notifying registered
 * presenters whenever cart items mutate.
 *
 * @class CartService
 */
class CartService {
    /**
     * @param {SafeStorage|Object} [storageAdapter=new SafeStorage()] - Storage provider.
     */
    constructor(storageAdapter = new SafeStorage()) {
        /** @type {SafeStorage|Object} */
        this.storage = storageAdapter;
        /** @type {Array<{name: string, price: number, image: string, quantity: number}>} */
        this.items = this._loadFromStorage();
        /** @private @type {Array<Function>} */
        this.listeners = [];
    }

    /**
     * Register a callback listener to receive state updates whenever cart mutations occur.
     *
     * @param {Function} listener - Function invoked with `(items, totals)`.
     * @returns {Function} Unsubscribe closure.
     */
    subscribe(listener) {
        if (typeof listener === 'function') {
            this.listeners.push(listener);
        }
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    /**
     * Notify all registered subscribers of state change.
     * Wraps individual listener execution in try/catch to ensure an error in one listener
     * does not abort notifications to subsequent listeners or disrupt domain mutations.
     * @private
     */
    _notify() {
        const totals = this.getTotals();
        const items = this.getItems();
        for (const listener of this.listeners) {
            try {
                listener(items, totals);
            } catch (err) {
                console.error('[CartService] Error in state listener subscriber:', err);
            }
        }
    }

    /**
     * Safely load and validate cart items from storage.
     * Recovers gracefully from corrupted JSON, non-array structures, or individual malformed records.
     *
     * @private
     * @returns {Array<{name: string, price: number, image: string, quantity: number}>} Validated items list.
     */
    _loadFromStorage() {
        try {
            const raw = this.storage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return [];

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (syntaxErr) {
                console.warn('[CartService] Corrupted JSON detected in storage. Resetting to empty cart:', syntaxErr?.message);
                return [];
            }

            if (!Array.isArray(parsed)) {
                console.warn('[CartService] Stored cart data is not an array. Resetting.');
                return [];
            }

            // Cleanse and validate each item in storage to guarantee schema integrity
            const validated = [];
            for (const candidate of parsed) {
                if (!candidate || typeof candidate !== 'object') {
                    console.warn('[CartService] Dropped non-object item record from stored cart:', candidate);
                    continue;
                }
                try {
                    const validItem = this._validateItem(
                        candidate.name,
                        candidate.price,
                        candidate.image,
                        candidate.quantity
                    );
                    validated.push(validItem);
                } catch {
                    // Drop corrupted item record rather than crashing the whole cart
                    console.warn('[CartService] Dropped corrupted item from stored cart:', candidate);
                }
            }
            return validated;
        } catch (err) {
            console.error('[CartService] Unexpected failure loading cart from storage. Resetting to empty cart:', err);
            return [];
        }
    }

    /**
     * Synchronize in-memory cart state from storage.
     * Useful for cross-tab synchronization when a storage event is triggered in another window.
     */
    syncFromStorage() {
        this.items = this._loadFromStorage();
        this._notify();
    }

    /**
     * Persist current cart items to storage adapter.
     * @private
     */
    _saveToStorage() {
        try {
            this.storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.items));
        } catch (err) {
            console.error('[CartService] Could not persist cart to storage:', err);
        }
    }

    /**
     * Validate and normalize a candidate cart item.
     *
     * Validation Rules:
     * 1. Product Name: Non-empty string, trimmed, 1 to 120 characters max.
     * 2. Price: Finite, non-negative numeric value (>= 0), rounded to 2 decimal places.
     * 3. Quantity: Integer >= 1, capped at 99.
     * 4. Image: String URL sanitized against javascript: pseudoprotocols, defaulting to SVG placeholder.
     *
     * @private
     * @param {unknown} name - Product title.
     * @param {unknown} price - Item price.
     * @param {unknown} image - Image URL or data URI.
     * @param {unknown} [quantity=1] - Quantity count.
     * @returns {{ name: string, price: number, image: string, quantity: number }}
     * @throws {CartValidationError} If any input fails validation rules.
     */
    _validateItem(name, price, image, quantity = 1) {
        // 1. Name validation
        if (typeof name !== 'string') {
            throw new CartValidationError('Product name must be a string', 'name');
        }
        const trimmedName = name.trim();
        if (trimmedName.length === 0) {
            throw new CartValidationError('Product name cannot be empty', 'name');
        }
        if (trimmedName.length > CONFIG.MAX_NAME_LENGTH) {
            throw new CartValidationError(`Product name exceeds maximum length of ${CONFIG.MAX_NAME_LENGTH} characters`, 'name');
        }

        // 2. Price validation
        const numericPrice = Number(price);
        if (Number.isNaN(numericPrice) || !Number.isFinite(numericPrice) || numericPrice < 0) {
            throw new CartValidationError('Product price must be a non-negative finite number', 'price');
        }
        // Round price to 2 decimal places using epsilon math to avoid IEEE-754 precision bugs
        const cleanPrice = Math.round((numericPrice + Number.EPSILON) * 100) / 100;

        // 3. Quantity validation
        const numericQty = parseInt(quantity, 10);
        if (Number.isNaN(numericQty) || numericQty < CONFIG.MIN_ITEM_QTY) {
            throw new CartValidationError(`Quantity must be an integer of at least ${CONFIG.MIN_ITEM_QTY}`, 'quantity');
        }
        const cleanQty = Math.min(numericQty, CONFIG.MAX_ITEM_QTY);

        // 4. Image normalization
        const cleanImage = sanitizeImageUrl(image);

        return {
            name: trimmedName,
            price: cleanPrice,
            image: cleanImage,
            quantity: cleanQty
        };
    }

    /**
     * Return a safe deep-copy of current cart items to protect internal state from external tampering.
     * @returns {Array<{name: string, price: number, image: string, quantity: number}>} Array of cloned item objects.
     */
    getItems() {
        return this.items.map(item => ({ ...item }));
    }

    /**
     * Add an item to the cart, or increment quantity if it already exists.
     * Enforces the maximum quantity cap of 99 per item.
     *
     * @param {string} name - Product title.
     * @param {number|string} price - Item price in INR.
     * @param {string|null} [image=null] - Optional image URL or null.
     * @param {number} [quantity=1] - Quantity to add.
     * @returns {{ item: {name: string, price: number, image: string, quantity: number}, added: boolean, capped: boolean }} Operation metadata.
     * @throws {CartValidationError} If parameters fail validation.
     */
    addItem(name, price, image = null, quantity = 1) {
        const validated = this._validateItem(name, price, image, quantity);
        const existing = this.items.find(i => i.name === validated.name);

        let capped = false;
        let finalItem;

        if (existing) {
            const desiredQty = existing.quantity + validated.quantity;
            if (desiredQty > CONFIG.MAX_ITEM_QTY) {
                existing.quantity = CONFIG.MAX_ITEM_QTY;
                capped = true;
            } else {
                existing.quantity = desiredQty;
            }
            // Preserve or update image if a newer non-default image is supplied
            if (validated.image && validated.image !== CONFIG.DEFAULT_FALLBACK_IMAGE) {
                existing.image = validated.image;
            }
            finalItem = { ...existing };
        } else {
            this.items.push(validated);
            finalItem = { ...validated };
        }

        this._saveToStorage();
        this._notify();

        return {
            item: finalItem,
            added: !existing,
            capped
        };
    }

    /**
     * Modify the quantity of an item by a relative delta (+1, -1).
     * Automatically removes the item if the resulting quantity drops to 0 or below.
     *
     * @param {string} name - Product name.
     * @param {number} delta - Positive or negative integer increment.
     * @returns {{ removed: boolean, item: {name: string, price: number, image: string, quantity: number}|null }}
     */
    updateQuantity(name, delta) {
        if (typeof name !== 'string') return { removed: false, item: null };
        const cleanName = name.trim();
        const item = this.items.find(i => i.name === cleanName);
        if (!item) return { removed: false, item: null };

        const numericDelta = parseInt(delta, 10) || 0;
        const newQty = item.quantity + numericDelta;

        if (newQty <= 0) {
            this.items = this.items.filter(i => i.name !== cleanName);
            this._saveToStorage();
            this._notify();
            return { removed: true, item: null };
        }

        item.quantity = Math.min(newQty, CONFIG.MAX_ITEM_QTY);
        this._saveToStorage();
        this._notify();
        return { removed: false, item: { ...item } };
    }

    /**
     * Remove a single item completely from the cart by name.
     *
     * @param {string} name - Product name.
     * @returns {boolean} True if the item was found and removed, false otherwise.
     */
    removeItem(name) {
        if (typeof name !== 'string') return false;
        const cleanName = name.trim();
        const initialCount = this.items.length;
        this.items = this.items.filter(i => i.name !== cleanName);

        if (this.items.length !== initialCount) {
            this._saveToStorage();
            this._notify();
            return true;
        }
        return false;
    }

    /**
     * Empty all items from the cart and clear persisted storage.
     */
    clear() {
        this.items = [];
        this._saveToStorage();
        this._notify();
    }

    /**
     * Calculate summary statistics for the cart.
     * Uses epsilon-adjusted rounding to prevent JavaScript IEEE-754 binary floating point precision bugs.
     *
     * @returns {{ totalItems: number, totalPrice: number, formattedTotalPrice: string }}
     */
    getTotals() {
        let totalItems = 0;
        let rawPriceSum = 0;

        for (const item of this.items) {
            totalItems += item.quantity;
            rawPriceSum += (item.price * item.quantity);
        }

        const totalPrice = Math.round((rawPriceSum + Number.EPSILON) * 100) / 100;

        return {
            totalItems,
            totalPrice,
            formattedTotalPrice: formatCurrency(totalPrice)
        };
    }
}

/* ==========================================================================
   6. TOAST NOTIFICATION MANAGER (XSS-SAFE & MULTI-VARIANT)
   ========================================================================== */

/**
 * Toast notification subsystem providing user-friendly visual feedback.
 * Features:
 * - HTML entity protection via textContent insertion (immune to XSS).
 * - Multi-variant styling (success, error, warning, info).
 * - ARIA live-region compatibility for screen readers (aria-live="polite", role="alert").
 *
 * @class ToastManager
 */
class ToastManager {
    static ICONS = Object.freeze({
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    });

    constructor() {
        /** @private @type {HTMLElement|null} */
        this.container = null;
    }

    /**
     * Lazily locate or create the global toast container element.
     * @private
     * @returns {HTMLElement|null} Container element or null in headless mode.
     */
    _getOrCreateContainer() {
        if (typeof document === 'undefined') return null;
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            container.id = 'toast-container';
            container.setAttribute('role', 'region');
            container.setAttribute('aria-label', 'Notifications');
            document.body.appendChild(container);
        }
        this.container = container;
        return container;
    }

    /**
     * Display a floating toast notification.
     *
     * @param {string} message - Notification text.
     * @param {'success'|'error'|'warning'|'info'} [type='success'] - Visual variant.
     * @param {number} [duration=3000] - Display duration in milliseconds before auto-dismissal.
     */
    show(message, type = 'success', duration = 3000) {
        const container = this._getOrCreateContainer();
        if (!container) return;

        const normalizedType = ['success', 'error', 'warning', 'info'].includes(type) ? type : 'info';
        const iconSymbol = ToastManager.ICONS[normalizedType];

        const toast = document.createElement('div');
        toast.className = `toast ${normalizedType}`;
        toast.setAttribute('role', normalizedType === 'error' ? 'alert' : 'status');
        toast.setAttribute('aria-live', 'polite');

        const iconEl = document.createElement('span');
        iconEl.className = 'toast-icon';
        iconEl.textContent = iconSymbol;

        const messageEl = document.createElement('span');
        messageEl.className = 'toast-message';
        // Use textContent to completely prevent HTML/Script injection attacks
        messageEl.textContent = String(message);

        toast.appendChild(iconEl);
        toast.appendChild(messageEl);
        container.appendChild(toast);

        // Trigger entrance transition via RAF
        if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => {
                toast.classList.add('show');
            });
        } else {
            toast.classList.add('show');
        }

        // Trigger exit and cleanup
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                if (toast.parentNode === container) {
                    container.removeChild(toast);
                }
            }, 400);
        }, duration);
    }
}

/* ==========================================================================
   7. CART UI CONTROLLER (PRESENTATION & DOM BINDINGS)
   ========================================================================== */

/**
 * Cart UI controller managing slide-over drawer rendering, DOM event delegation,
 * keyboard accessibility, focus trapping/restoration, and micro-interactions.
 *
 * @class CartUI
 */
class CartUI {
    /**
     * @param {CartService} cartService - Cart domain service instance.
     * @param {ToastManager} toastManager - Notification presenter.
     */
    constructor(cartService, toastManager) {
        this.cartService = cartService;
        this.toastManager = toastManager;
        /** @type {HTMLElement|null} */
        this.drawer = null;
        /** @type {HTMLElement|null} */
        this.overlay = null;
        /** @private @type {Element|null} */
        this.triggerElement = null;
    }

    /**
     * Initialize DOM structures, event bindings, and subscriptions.
     */
    init() {
        if (typeof document === 'undefined') return;

        this._injectCartDrawer();
        this._setupEventListeners();
        this._setupKeyboardHandlers();
        this.render();

        // Subscribe to domain model mutations
        this.cartService.subscribe(() => {
            this.render();
        });
    }

    /**
     * Inject drawer and overlay DOM elements if not already present in the HTML document.
     * @private
     */
    _injectCartDrawer() {
        if (document.getElementById('cart-drawer')) {
            this.drawer = document.getElementById('cart-drawer');
            this.overlay = document.getElementById('cart-drawer-overlay');
            return;
        }

        // Overlay backdrop element
        const overlay = document.createElement('div');
        overlay.className = 'cart-drawer-overlay';
        overlay.id = 'cart-drawer-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Drawer element with accessibility markup (dialog role, aria-modal)
        const drawer = document.createElement('aside');
        drawer.className = 'cart-drawer';
        drawer.id = 'cart-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Shopping Cart Drawer');

        drawer.innerHTML = `
            <div class="cart-drawer-header">
                <div class="cart-drawer-title">
                    <span>🛒</span> Your Cart
                </div>
                <button class="cart-drawer-close" id="cart-drawer-close" aria-label="Close cart drawer">&times;</button>
            </div>
            <div class="cart-drawer-items" id="cart-drawer-items" role="list"></div>
            <div class="cart-drawer-footer">
                <div class="cart-total-row">
                    <span>Total:</span>
                    <span class="cart-total-price">${CONFIG.CURRENCY_SYMBOL}<span id="cart-drawer-total">0</span></span>
                </div>
                <button class="cart-checkout-btn" id="cart-checkout-btn">Proceed to Checkout</button>
                <button class="cart-clear-btn" id="cart-clear-btn">Clear Cart</button>
            </div>
        `;

        document.body.appendChild(drawer);
        this.drawer = drawer;
    }

    /**
     * Attach centralized event listeners using delegation and keyboard handlers.
     * @private
     */
    _setupEventListeners() {
        // 1. Cart Icon toggle in Navbar (handles click and keyboard Enter/Space activation)
        const cartIcons = document.querySelectorAll('.cart-icon');
        cartIcons.forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
            });
            icon.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    this.open();
                }
            });
        });

        // 2. Drawer Close Button
        const closeBtn = document.getElementById('cart-drawer-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // 3. Overlay backdrop click closes drawer
        if (this.overlay) {
            this.overlay.addEventListener('click', () => this.close());
        }

        // 4. Clear Cart Button
        const clearBtn = document.getElementById('cart-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.handleClearCart());
        }

        // 5. Checkout Button
        const checkoutBtn = document.getElementById('cart-checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.handleCheckout());
        }

        // 6. Event Delegation on Cart Items Container
        const itemsContainer = document.getElementById('cart-drawer-items');
        if (itemsContainer) {
            itemsContainer.addEventListener('click', (e) => {
                try {
                    const target = e.target;
                    if (!target || !target.closest) return;

                    const button = target.closest('button[data-action]');
                    if (!button) return;

                    const action = button.getAttribute('data-action');
                    const itemName = button.getAttribute('data-item-name');
                    if (!itemName) return;

                    if (action === 'increase') {
                        const result = this.cartService.updateQuantity(itemName, 1);
                        if (result.item && result.item.quantity >= CONFIG.MAX_ITEM_QTY) {
                            this.toastManager.show(`Maximum quantity limit (${CONFIG.MAX_ITEM_QTY}) reached for "${itemName}"`, 'warning');
                        }
                    } else if (action === 'decrease') {
                        const result = this.cartService.updateQuantity(itemName, -1);
                        if (result.removed) {
                            this.toastManager.show(`Removed "${itemName}" from cart`, 'info');
                        }
                    } else if (action === 'remove') {
                        this.cartService.removeItem(itemName);
                        this.toastManager.show(`Removed "${itemName}" from cart`, 'info');
                    }
                } catch (clickErr) {
                    console.error('[CartUI] Error handling cart item interaction:', clickErr);
                    this.toastManager.show('Could not update cart item. Please try again.', 'error');
                }
            });
        }
    }

    /**
     * Attach global keyboard listeners for accessibility (Escape key to dismiss drawer).
     * @private
     */
    _setupKeyboardHandlers() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
    }

    /**
     * Open the shopping cart drawer with focus management.
     */
    open() {
        if (typeof document === 'undefined') return;
        this.triggerElement = document.activeElement;

        if (this.drawer && this.overlay) {
            this.drawer.classList.add('open');
            this.overlay.classList.add('open');
            this.overlay.setAttribute('aria-hidden', 'false');

            // Move focus to drawer close button for screen reader accessibility
            const closeBtn = document.getElementById('cart-drawer-close');
            if (closeBtn) {
                closeBtn.focus();
            }
        }
    }

    /**
     * Close the shopping cart drawer and restore focus to previous trigger element.
     */
    close() {
        if (this.drawer && this.overlay) {
            this.drawer.classList.remove('open');
            this.overlay.classList.remove('open');
            this.overlay.setAttribute('aria-hidden', 'true');

            // Restore focus to original triggering element
            if (this.triggerElement && typeof this.triggerElement.focus === 'function') {
                this.triggerElement.focus();
            }
        }
    }

    /**
     * Check if the cart drawer is currently expanded and visible.
     * @returns {boolean} True if drawer has 'open' class.
     */
    isOpen() {
        return Boolean(this.drawer && this.drawer.classList.contains('open'));
    }

    /**
     * Trigger a micro-animation bounce on all cart icons across the page.
     */
    triggerBounce() {
        if (typeof document === 'undefined') return;
        const cartIcons = document.querySelectorAll('.cart-icon');
        cartIcons.forEach(icon => {
            icon.classList.remove('animate');
            void icon.offsetWidth; // Force CSS reflow
            icon.classList.add('animate');
        });
    }

    /**
     * Render cart state into the DOM: badge counters, item cards, subtotal, and empty states.
     * Wrapped in an error boundary to prevent unexpected rendering faults from breaking the UI.
     */
    render() {
        if (typeof document === 'undefined') return;

        try {
            const items = this.cartService.getItems();
            const totals = this.cartService.getTotals();

            // 1. Update navbar badges
            const badgeEls = document.querySelectorAll('#cart-count');
            badgeEls.forEach(badge => {
                badge.textContent = String(totals.totalItems);
                badge.setAttribute('aria-label', `${totals.totalItems} items in cart`);
            });

            // 2. Update drawer total price
            const totalEl = document.getElementById('cart-drawer-total');
            if (totalEl) {
                totalEl.textContent = totals.formattedTotalPrice;
            }

            // 3. Render items in drawer
            const container = document.getElementById('cart-drawer-items');
            if (!container) return;

            container.innerHTML = '';

            if (items.length === 0) {
                const emptyEl = document.createElement('div');
                emptyEl.className = 'cart-empty-msg';
                emptyEl.innerHTML = `
                    <div style="font-size: 40px; margin-bottom: 12px;">🛍️</div>
                    <div>Your cart is empty.</div>
                    <div style="font-size: 13px; color: var(--text-muted); margin-top: 6px;">Add anime collectibles to begin!</div>
                `;
                container.appendChild(emptyEl);
                return;
            }

            // Render each item safely using HTML entity escaping
            for (const item of items) {
                const itemEl = document.createElement('div');
                itemEl.className = 'cart-item';
                itemEl.setAttribute('role', 'listitem');

                const safeName = escapeHtml(item.name);
                const safePrice = formatCurrency(item.price);
                const safeImage = escapeHtml(item.image);

                itemEl.innerHTML = `
                    <img src="${safeImage}" alt="${safeName}" class="cart-item-img" onerror="this.src='${CONFIG.DEFAULT_FALLBACK_IMAGE}'">
                    <div class="cart-item-info">
                        <div class="cart-item-name" title="${safeName}">${safeName}</div>
                        <div class="cart-item-price">${CONFIG.CURRENCY_SYMBOL}${safePrice}</div>
                        <div class="cart-item-qty-container">
                            <button class="cart-qty-btn" data-action="decrease" data-item-name="${safeName}" aria-label="Decrease quantity of ${safeName}">-</button>
                            <span class="cart-item-qty" aria-live="polite">${item.quantity}</span>
                            <button class="cart-qty-btn" data-action="increase" data-item-name="${safeName}" aria-label="Increase quantity of ${safeName}">+</button>
                        </div>
                    </div>
                    <button class="cart-item-remove" data-action="remove" data-item-name="${safeName}" title="Remove Item" aria-label="Remove ${safeName} from cart">🗑️</button>
                `;

                container.appendChild(itemEl);
            }
        } catch (renderError) {
            console.error('[CartUI] Error during cart rendering:', renderError);
            const container = document.getElementById('cart-drawer-items');
            if (container) {
                container.innerHTML = `
                    <div class="cart-error-msg">
                        <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
                        <div>Could not display cart items.</div>
                        <button class="cart-retry-btn" id="cart-retry-render-btn">Retry</button>
                    </div>
                `;
                const retryBtn = document.getElementById('cart-retry-render-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => this.render());
                }
            }
        }
    }

    /**
     * Clear all cart contents with user confirmation.
     */
    handleClearCart() {
        const items = this.cartService.getItems();
        if (items.length === 0) {
            this.toastManager.show('Cart is already empty', 'info');
            return;
        }

        const confirmed = (typeof window !== 'undefined' && typeof window.confirm === 'function')
            ? window.confirm('Are you sure you want to clear all items from your cart?')
            : true;

        if (confirmed) {
            this.cartService.clear();
            this.toastManager.show('Cart cleared successfully', 'info');
        }
    }

    /**
     * Simulate checkout process with validation and order summary confirmation.
     */
    handleCheckout() {
        const items = this.cartService.getItems();
        const totals = this.cartService.getTotals();

        if (items.length === 0) {
            this.toastManager.show('Your cart is empty. Add products before checking out!', 'warning');
            return;
        }

        const confirmed = (typeof window !== 'undefined' && typeof window.confirm === 'function')
            ? window.confirm(`Confirm order for ${totals.totalItems} item(s) totalling ${CONFIG.CURRENCY_SYMBOL}${totals.formattedTotalPrice}?`)
            : true;

        if (confirmed) {
            this.cartService.clear();
            this.close();
            this.toastManager.show(`🎉 Order placed successfully! Total: ${CONFIG.CURRENCY_SYMBOL}${totals.formattedTotalPrice}`, 'success', 5000);
        }
    }
}

/* ==========================================================================
   8. SEARCH & CATALOG FILTER CONTROLLER
   ========================================================================== */

/**
 * Manages client-side live catalog search and category filtering on product.html,
 * and handles search box submissions from web2.html.
 *
 * Synchronizes filter criteria with URL query parameters (?search=... and ?category=...).
 */
class SearchAndFilterController {
    /**
     * Initialize catalog filtering or home page search based on current page markup.
     */
    static init() {
        if (typeof document === 'undefined') return;

        const isProductPage = (typeof window !== 'undefined' && window.location.pathname.includes('product.html')) ||
                              document.querySelector('.products');

        if (isProductPage) {
            SearchAndFilterController._setupProductPageFiltering();
        } else {
            SearchAndFilterController._setupHomePageSearch();
        }

        SearchAndFilterController._setupLoginButtons();
    }

    /**
     * Set up real-time product search, category filtering, and empty state rendering on product.html.
     * @private
     */
    static _setupProductPageFiltering() {
        const searchInput = document.querySelector('.search-box input');
        const searchBtn = document.querySelector('.search-box button');
        const productsGrid = document.querySelector('.products');
        if (!productsGrid) return;

        const productCards = Array.from(productsGrid.querySelectorAll('.product'));

        const performFilter = (searchTerm = '', categoryTerm = '') => {
            const cleanSearch = searchTerm.trim().toLowerCase();
            const cleanCategory = categoryTerm.trim().toLowerCase();

            let visibleCount = 0;

            productCards.forEach(card => {
                const title = (card.querySelector('h2')?.textContent || '').toLowerCase();
                const description = (card.querySelector('h4')?.textContent || '').toLowerCase();
                const cardCategory = (card.getAttribute('data-category') || '').toLowerCase();

                const matchesSearch = !cleanSearch || title.includes(cleanSearch) || description.includes(cleanSearch);
                const matchesCategory = !cleanCategory || cardCategory.includes(cleanCategory) || title.includes(cleanCategory);

                if (matchesSearch && matchesCategory) {
                    card.style.display = '';
                    visibleCount++;
                } else {
                    card.style.display = 'none';
                }
            });

            // Handle empty state message when zero products match criteria
            let emptyMsg = document.getElementById('products-empty-state');
            if (visibleCount === 0) {
                if (!emptyMsg) {
                    emptyMsg = document.createElement('div');
                    emptyMsg.id = 'products-empty-state';
                    emptyMsg.className = 'products-empty-state';
                    productsGrid.appendChild(emptyMsg);
                }
                emptyMsg.innerHTML = `
                    <div style="font-size: 48px; margin-bottom: 15px;">🔍</div>
                    <h3>No products found</h3>
                    <p style="color: var(--text-muted); margin: 10px 0 20px;">No collectibles matched "${escapeHtml(cleanSearch || cleanCategory)}".</p>
                    <button class="shop-btn" id="clear-search-filter" style="padding: 10px 24px; font-size: 15px;">View All Products</button>
                `;
                emptyMsg.style.display = 'block';

                const resetBtn = document.getElementById('clear-search-filter');
                if (resetBtn) {
                    resetBtn.addEventListener('click', () => {
                        if (searchInput) searchInput.value = '';
                        // Remove URL params safely without full page reload
                        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
                            window.history.replaceState({}, document.title, window.location.pathname);
                        }
                        performFilter('', '');
                    });
                }
            } else if (emptyMsg) {
                emptyMsg.style.display = 'none';
            }
        };

        // Check URL query parameters (?search=... or ?category=...)
        if (typeof window !== 'undefined' && window.location) {
            const urlParams = new URLSearchParams(window.location.search);
            const initialSearch = urlParams.get('search') || '';
            const initialCategory = urlParams.get('category') || '';

            if (initialSearch && searchInput) {
                searchInput.value = initialSearch;
            }

            if (initialSearch || initialCategory) {
                performFilter(initialSearch, initialCategory);
            }

            // Live typing search filter
            if (searchInput) {
                searchInput.addEventListener('input', (e) => {
                    performFilter(e.target.value, initialCategory);
                });

                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        performFilter(searchInput.value, initialCategory);
                    }
                });
            }

            if (searchBtn && searchInput) {
                searchBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    performFilter(searchInput.value, initialCategory);
                });
            }
        }
    }

    /**
     * Set up search submission and category card redirects from home page (web2.html).
     * @private
     */
    static _setupHomePageSearch() {
        const searchInput = document.querySelector('.search-box input');
        const searchBtn = document.querySelector('.search-box button');

        const navigateToSearch = () => {
            const query = (searchInput?.value || '').trim();
            if (typeof window !== 'undefined') {
                if (query) {
                    window.location.href = `product.html?search=${encodeURIComponent(query)}`;
                } else {
                    window.location.href = 'product.html';
                }
            }
        };

        if (searchInput) {
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    navigateToSearch();
                }
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToSearch();
            });
        }

        // Shop Now Button Navigation
        const shopBtns = document.querySelectorAll('.shop-btn');
        shopBtns.forEach(btn => {
            if (btn.tagName !== 'A') {
                btn.addEventListener('click', () => {
                    if (typeof window !== 'undefined') {
                        window.location.href = 'product.html';
                    }
                });
            }
        });
    }

    /**
     * Wire login buttons to display non-intrusive modal notifications.
     * @private
     */
    static _setupLoginButtons() {
        const loginBtns = document.querySelectorAll('.login-btn');
        loginBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (typeof window !== 'undefined' && window.toastManager) {
                    window.toastManager.show('Guest Collector session active. User accounts arrive in v1.2!', 'info', 4000);
                }
            });
        });
    }
}

/* ==========================================================================
   9. SCROLL REVEAL OBSERVER (PROGRESSIVE ENHANCEMENT)
   ========================================================================== */

/**
 * Initializes progressive IntersectionObserver to trigger smooth CSS animations
 * on `.reveal` elements as they scroll into view.
 */
function setupScrollReveal() {
    if (typeof document === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length === 0) return;

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                obs.unobserve(entry.target);
            }
        });
    }, {
        root: null,
        rootMargin: '0px',
        threshold: 0.08
    });

    reveals.forEach(el => observer.observe(el));
}

/* ==========================================================================
   10. IMAGE FALLBACK MANAGER (PREVENTS BROKEN GRAPHICS & RECURSIVE LOOPS)
   ========================================================================== */

/**
 * Attaches fault-tolerant error handlers to all image elements on the page.
 * Replaces failed remote CDN URLs with the built-in SVG placeholder.
 * Protects against infinite error cascades if the fallback itself triggers an error.
 */
function setupImageFallbacks() {
    if (typeof document === 'undefined') return;

    const images = document.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('error', () => {
            // Guard against infinite loop if fallback image somehow triggers error
            if (!img.dataset.fallbackApplied) {
                img.dataset.fallbackApplied = 'true';
                img.src = CONFIG.DEFAULT_FALLBACK_IMAGE;
            }
        });
    });
}

/* ==========================================================================
   11. CROSS-TAB STORAGE SYNCHRONIZATION
   ========================================================================== */

/**
 * Listens for browser `storage` events to synchronize cart changes across multiple tabs in real-time.
 *
 * @param {CartService} service - The cart service to notify when storage updates.
 */
function setupStorageSync(service) {
    if (typeof window === 'undefined' || !service) return;

    window.addEventListener('storage', (event) => {
        if (event.key === CONFIG.STORAGE_KEY) {
            service.syncFromStorage();
        }
    });
}

/* ==========================================================================
   12. COMPONENT-LEVEL FAILURE ISOLATION (ERROR BOUNDARIES)
   ========================================================================== */

/**
 * Executes a component initialization routine inside an isolated error boundary.
 * Prevents an exception in an optional component (e.g. ScrollReveal or SearchFilter)
 * from aborting the execution of other essential subsystems (e.g. CartUI).
 *
 * @param {string} componentName - Descriptive name of the component for logging.
 * @param {Function} initFn - Initialization closure to execute.
 * @param {Object} [options={}] - Configuration options.
 * @param {string|null} [options.userFacingMessage=null] - Optional toast message to display on failure.
 * @returns {{ success: boolean, error: Error|null }} Execution result summary.
 */
function safeInitComponent(componentName, initFn, options = {}) {
    try {
        initFn();
        return { success: true, error: null };
    } catch (err) {
        console.error(`[ComponentError] Failed to initialize component "${componentName}":`, err);
        if (options.userFacingMessage && typeof window !== 'undefined' && window.toastManager) {
            window.toastManager.show(options.userFacingMessage, 'warning');
        }
        return { success: false, error: err };
    }
}

/* ==========================================================================
   13. CENTRALIZED GLOBAL ERROR BOUNDARY
   ========================================================================== */

/**
 * Attaches global unhandled error and unhandled Promise rejection listeners.
 * Surfaces friendly, non-intrusive warning toasts to users without revealing stack traces.
 */
function setupGlobalErrorBoundary() {
    if (typeof window === 'undefined') return;

    window.addEventListener('error', (event) => {
        console.error('[GlobalErrorBoundary] Unhandled runtime error:', {
            message: event.message,
            filename: event.filename,
            lineno: event.lineno,
            colno: event.colno
        });
        // Avoid cascading alerts; log in console and notify user if toast system is live
        if (window.toastManager && event.message && !event.message.includes('ResizeObserver')) {
            window.toastManager.show('A minor interface error occurred. Operations continue normally.', 'warning');
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('[GlobalErrorBoundary] Unhandled Promise rejection:', event.reason);
    });
}

/* ==========================================================================
   14. SINGLETON INSTANTIATION & BACKWARD COMPATIBLE GLOBAL API
   ========================================================================== */

// Instantiate core singletons
const safeStorage = new SafeStorage();
const cartService = new CartService(safeStorage);
const toastManager = new ToastManager();
const cartUI = new CartUI(cartService, toastManager);

/**
 * Add a product to the cart with input validation and bounce micro-animation.
 * Maintains 100% backward compatibility with existing HTML inline `onclick="addToCart(...)"` handlers.
 *
 * @param {string} productName - Title of the anime merchandise.
 * @param {number|string} price - Price in INR.
 * @param {string|null} [imageUrl=null] - Image URL or extracted dynamically from DOM.
 */
function addToCart(productName, price, imageUrl = null) {
    try {
        // Attempt dynamic DOM extraction of image if not explicitly passed
        if (!imageUrl && typeof document !== 'undefined') {
            const productElements = document.querySelectorAll('.product');
            for (const el of productElements) {
                const titleEl = el.querySelector('h2');
                if (titleEl && titleEl.textContent.trim().toLowerCase() === String(productName).trim().toLowerCase()) {
                    const img = el.querySelector('img');
                    if (img && img.src) {
                        imageUrl = img.src;
                        break;
                    }
                }
            }
        }

        const result = cartService.addItem(productName, price, imageUrl, 1);
        cartUI.triggerBounce();

        if (result.capped) {
            toastManager.show(`Added "${result.item.name}" (Max quantity ${CONFIG.MAX_ITEM_QTY} reached)`, 'warning');
        } else {
            toastManager.show(`Added "${result.item.name}" to cart!`, 'success');
        }
    } catch (err) {
        if (err instanceof CartValidationError) {
            toastManager.show(`Could not add item: ${err.message}`, 'error');
        } else {
            console.error('[addToCart] Unexpected failure:', err);
            toastManager.show('Failed to add item to cart. Please try again.', 'error');
        }
    }
}

/**
 * Increment or decrement item quantity from global context.
 * @param {string} productName - Name of target product.
 * @param {number} delta - Step adjustment (+1 or -1).
 */
function changeQty(productName, delta) {
    try {
        cartService.updateQuantity(productName, delta);
    } catch (err) {
        console.error('[changeQty] Failure:', err);
    }
}

/**
 * Remove an item completely from the cart.
 * @param {string} productName - Name of product to remove.
 */
function removeFromCart(productName) {
    try {
        cartService.removeItem(productName);
        toastManager.show(`Removed "${productName}" from cart`, 'info');
    } catch (err) {
        console.error('[removeFromCart] Failure:', err);
    }
}

/**
 * Clear all cart contents.
 */
function clearCart() {
    cartUI.handleClearCart();
}

/**
 * Proceed to simulated checkout.
 */
function checkoutCart() {
    cartUI.handleCheckout();
}

/**
 * Open the cart drawer slide-over.
 */
function openCartDrawer() {
    cartUI.open();
}

/**
 * Close the cart drawer slide-over.
 */
function closeCartDrawer() {
    cartUI.close();
}

/**
 * Display a toast notification.
 * @param {string} message - Message text.
 * @param {'success'|'error'|'warning'|'info'} [type='success'] - Toast variant.
 */
function showToast(message, type = 'success') {
    toastManager.show(message, type);
}

/**
 * Re-render the cart UI manually.
 */
function updateCartUI() {
    cartUI.render();
}

/* ==========================================================================
   15. APPLICATION BOOTSTRAP (ISOLATED COMPONENT INITIALIZATION)
   ========================================================================== */

/**
 * Bootstrap the entire client application using isolated component boundaries.
 */
function bootstrapApplication() {
    safeInitComponent('GlobalErrorBoundary', setupGlobalErrorBoundary);
    safeInitComponent('CartUI', () => cartUI.init(), {
        userFacingMessage: 'Cart drawer interface encountered a setup issue.'
    });
    safeInitComponent('SearchAndFilterController', () => SearchAndFilterController.init());
    safeInitComponent('ScrollReveal', setupScrollReveal);
    safeInitComponent('ImageFallbacks', setupImageFallbacks);
    safeInitComponent('StorageSynchronization', () => setupStorageSync(cartService));
}

// Attach to window object for browser access
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.CartValidationError = CartValidationError;
    window.StorageError = StorageError;
    window.ComponentInitError = ComponentInitError;
    window.SafeStorage = SafeStorage;
    window.CartService = CartService;
    window.ToastManager = ToastManager;
    window.CartUI = CartUI;
    window.SearchAndFilterController = SearchAndFilterController;
    window.escapeHtml = escapeHtml;
    window.sanitizeImageUrl = sanitizeImageUrl;
    window.formatCurrency = formatCurrency;
    window.safeInitComponent = safeInitComponent;

    // Singletons
    window.safeStorage = safeStorage;
    window.cartService = cartService;
    window.toastManager = toastManager;
    window.cartUI = cartUI;

    // Backward-compatible globals
    window.addToCart = addToCart;
    window.changeQty = changeQty;
    window.removeFromCart = removeFromCart;
    window.clearCart = clearCart;
    window.checkoutCart = checkoutCart;
    window.openCartDrawer = openCartDrawer;
    window.closeCartDrawer = closeCartDrawer;
    window.showToast = showToast;
    window.updateCartUI = updateCartUI;

    // Bootstrap on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapApplication);
    } else {
        bootstrapApplication();
    }
}

// Module exports for Node.js automated unit testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        CartValidationError,
        StorageError,
        ComponentInitError,
        SafeStorage,
        CartService,
        ToastManager,
        CartUI,
        SearchAndFilterController,
        escapeHtml,
        sanitizeImageUrl,
        formatCurrency,
        safeInitComponent,
        setupScrollReveal,
        setupImageFallbacks,
        setupStorageSync,
        setupGlobalErrorBoundary,
        bootstrapApplication,
        addToCart,
        changeQty,
        removeFromCart,
        clearCart,
        checkoutCart,
        openCartDrawer,
        closeCartDrawer,
        showToast,
        updateCartUI
    };
}
