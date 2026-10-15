/**
 * ANiii STORE - Core Client State Controller, UI Presenter & Error Boundary
 *
 * ARCHITECTURAL DESIGN RATIONALE:
 * 1. Clean Separation of Concerns:
 *    - SafeStorage: Hardware & privacy-mode resilient storage abstraction (handles Safari private mode, QuotaExceededError, corrupted JSON).
 *    - CartService: Pure domain logic (validations, price calculations, quantity capping, state mutations).
 *    - CartUI: Presentation layer managing drawer DOM, animations, event delegation, and keyboard accessibility.
 *    - ToastManager: Accessible, multi-variant notification system preventing XSS attacks via textContent.
 *    - SearchAndFilterController: Live catalog filtering, URL query parameter synchronization, and empty state rendering.
 *    - GlobalErrorBoundary: Centralized unhandled error logging and user notification.
 * 2. Cross-Environment Compatibility:
 *    - Dual-target architecture: Executes seamlessly in both browser (window/DOM) and Node.js (for headless unit testing).
 * 3. Security Hardening:
 *    - Strict input validation on all item fields.
 *    - HTML entity escaping preventing Cross-Site Scripting (XSS) via injected product names or descriptions.
 */

'use strict';

/* ==========================================================================
   1. CONSTANTS & CONFIGURATION
   ========================================================================== */

const CONFIG = {
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
};

/* ==========================================================================
   2. CUSTOM ERROR TYPES
   ========================================================================== */

/**
 * Custom error class for cart item validation failures.
 * Used to distinguish validation issues from unexpected runtime faults.
 */
class CartValidationError extends Error {
    constructor(message, field = null) {
        super(message);
        this.name = 'CartValidationError';
        this.field = field;
    }
}

/**
 * Custom error class for persistent storage operations.
 */
class StorageError extends Error {
    constructor(message, cause = null) {
        super(message);
        this.name = 'StorageError';
        this.cause = cause;
    }
}

/* ==========================================================================
   3. SECURITY & SANITIZATION UTILITIES
   ========================================================================== */

/**
 * Escapes untrusted strings before insertion into DOM HTML to prevent XSS.
 * @param {unknown} input - String or value to sanitize.
 * @returns {string} Sanitized string safe for HTML rendering.
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
 * Robust monetary price formatter avoiding IEEE-754 floating-point display glitches.
 * @param {number} amount - Numeric amount to format.
 * @returns {string} Formatted number with commas (e.g. 1,499).
 */
function formatCurrency(amount) {
    const numeric = Number(amount) || 0;
    // Round to 2 decimal places safely using epsilon arithmetic
    const rounded = Math.round((numeric + Number.EPSILON) * 100) / 100;
    return rounded.toLocaleString('en-IN');
}

/* ==========================================================================
   4. SAFE STORAGE ADAPTER (FAULT-TOLERANT LOCALSTORAGE)
   ========================================================================== */

/**
 * Fault-tolerant storage wrapper that provides:
 * 1. Automatic fallback to an in-memory Map if localStorage is blocked (e.g., Safari private browsing, sandboxed iframes).
 * 2. Graceful degradation when quota is exceeded (QuotaExceededError).
 * 3. Safe JSON parsing with automatic recovery on corrupted data.
 */
class SafeStorage {
    constructor(customBackend = null) {
        this.memoryStore = new Map();
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
                console.warn('[SafeStorage] localStorage is restricted or unavailable. Switching to memory fallback.', err.message);
                this.isMemoryMode = true;
                this.backend = null;
            }
        } else {
            this.isMemoryMode = true;
            this.backend = null;
        }
    }

    getItem(key) {
        if (this.isMemoryMode || !this.backend) {
            return this.memoryStore.get(key) || null;
        }
        try {
            return this.backend.getItem(key);
        } catch (err) {
            console.warn(`[SafeStorage] Failed to read key "${key}". Falling back to memory:`, err.message);
            return this.memoryStore.get(key) || null;
        }
    }

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
            // QuotaExceededError or SecurityError
            console.warn(`[SafeStorage] Quota exceeded or storage denied for "${key}". Using in-memory fallback:`, err.message);
            this.isMemoryMode = true;
            this.memoryStore.set(key, stringValue);
            return false;
        }
    }

    removeItem(key) {
        if (!this.isMemoryMode && this.backend) {
            try {
                this.backend.removeItem(key);
            } catch (err) {
                console.warn(`[SafeStorage] Failed to remove "${key}":`, err.message);
            }
        }
        this.memoryStore.delete(key);
    }

    clear() {
        if (!this.isMemoryMode && this.backend) {
            try {
                this.backend.clear();
            } catch (err) {
                console.warn('[SafeStorage] Failed to clear backend storage:', err.message);
            }
        }
        this.memoryStore.clear();
    }
}

/* ==========================================================================
   5. CART SERVICE (DOMAIN STATE & BUSINESS LOGIC)
   ========================================================================== */

/**
 * Pure cart domain model and state controller.
 * Decoupled from direct DOM manipulation to facilitate comprehensive unit testing.
 */
class CartService {
    constructor(storageAdapter = new SafeStorage()) {
        this.storage = storageAdapter;
        this.items = this._loadFromStorage();
        this.listeners = [];
    }

    /**
     * Subscribe to cart state updates.
     * @param {Function} listener - Callback invoked with updated items and totals.
     * @returns {Function} Unsubscribe function.
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
     */
    _notify() {
        const totals = this.getTotals();
        for (const listener of this.listeners) {
            try {
                listener(this.getItems(), totals);
            } catch (err) {
                console.error('[CartService] Error in state listener:', err);
            }
        }
    }

    /**
     * Safely load and validate cart items from storage.
     * Recovers gracefully from corrupted JSON or invalid data structures.
     */
    _loadFromStorage() {
        try {
            const raw = this.storage.getItem(CONFIG.STORAGE_KEY);
            if (!raw) return [];

            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                console.warn('[CartService] Stored cart is not an array. Resetting.');
                return [];
            }

            // Cleanse and validate each item in storage to guarantee schema integrity
            const validated = [];
            for (const candidate of parsed) {
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
            console.error('[CartService] Failed to parse cart JSON from storage. Resetting to empty cart.', err);
            return [];
        }
    }

    /**
     * Persist current cart items to storage adapter.
     */
    _saveToStorage() {
        try {
            this.storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.items));
        } catch (err) {
            console.error('[CartService] Could not persist cart to storage:', err);
        }
    }

    /**
     * Validate and normalize a candidate item.
     * @throws {CartValidationError} If inputs are invalid or out of acceptable bounds.
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
        // Round price to 2 decimal places to avoid IEEE-754 precision issues
        const cleanPrice = Math.round((numericPrice + Number.EPSILON) * 100) / 100;

        // 3. Quantity validation
        const numericQty = parseInt(quantity, 10);
        if (Number.isNaN(numericQty) || numericQty < CONFIG.MIN_ITEM_QTY) {
            throw new CartValidationError(`Quantity must be an integer of at least ${CONFIG.MIN_ITEM_QTY}`, 'quantity');
        }
        const cleanQty = Math.min(numericQty, CONFIG.MAX_ITEM_QTY);

        // 4. Image normalization
        const cleanImage = (typeof image === 'string' && image.trim().length > 0)
            ? image.trim()
            : CONFIG.DEFAULT_FALLBACK_IMAGE;

        return {
            name: trimmedName,
            price: cleanPrice,
            image: cleanImage,
            quantity: cleanQty
        };
    }

    /**
     * Return a safe deep-copy of current cart items.
     */
    getItems() {
        return this.items.map(item => ({ ...item }));
    }

    /**
     * Add an item to the cart or increment quantity if already present.
     * @param {string} name - Product title.
     * @param {number|string} price - Item price.
     * @param {string} [image] - Optional image URL.
     * @param {number} [quantity=1] - Quantity to add.
     * @returns {{ item: Object, added: boolean, capped: boolean }} Operation result.
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
            // Preserve or update image if a newer valid image is supplied
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
     * Automatically removes the item if quantity drops to 0 or below.
     * @param {string} name - Product name.
     * @param {number} delta - Positive or negative increment.
     * @returns {{ removed: boolean, item: Object|null }}
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
     * Remove a single item completely from the cart.
     * @param {string} name - Product name.
     * @returns {boolean} True if item was removed, false if not found.
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
     * Empty all items from the cart.
     */
    clear() {
        this.items = [];
        this._saveToStorage();
        this._notify();
    }

    /**
     * Calculate summary statistics for the cart.
     * Uses epsilon-adjusted rounding to prevent JavaScript IEEE-754 precision bugs.
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
 * - HTML entity protection via textContent insertion.
 * - Variant styling (success, error, warning, info).
 * - ARIA live-region compatibility for screen readers.
 */
class ToastManager {
    static ICONS = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    constructor() {
        this.container = null;
    }

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

        // Trigger entrance transition
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

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
 * Cart UI controller responsible for drawer rendering, DOM event delegation,
 * keyboard accessibility, and micro-interactions.
 */
class CartUI {
    constructor(cartService, toastManager) {
        this.cartService = cartService;
        this.toastManager = toastManager;
        this.drawer = null;
        this.overlay = null;
    }

    init() {
        if (typeof document === 'undefined') return;

        this._injectCartDrawer();
        this._setupEventListeners();
        this._setupKeyboardHandlers();
        this.render();

        // Subscribe to domain model changes
        this.cartService.subscribe(() => {
            this.render();
        });
    }

    _injectCartDrawer() {
        if (document.getElementById('cart-drawer')) {
            this.drawer = document.getElementById('cart-drawer');
            this.overlay = document.getElementById('cart-drawer-overlay');
            return;
        }

        // Overlay element
        const overlay = document.createElement('div');
        overlay.className = 'cart-drawer-overlay';
        overlay.id = 'cart-drawer-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        document.body.appendChild(overlay);
        this.overlay = overlay;

        // Drawer element with accessibility markup
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

    _setupEventListeners() {
        // 1. Cart Icon toggle in Navbar
        const cartIcons = document.querySelectorAll('.cart-icon');
        cartIcons.forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.preventDefault();
                this.open();
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

        // 6. Event Delegation on Cart Items Container (Prevents quote escaping and inline onclick bugs)
        const itemsContainer = document.getElementById('cart-drawer-items');
        if (itemsContainer) {
            itemsContainer.addEventListener('click', (e) => {
                const target = e.target;
                const button = target.closest('button[data-action]');
                if (!button) return;

                const action = button.getAttribute('data-action');
                const itemName = button.getAttribute('data-item-name');
                if (!itemName) return;

                if (action === 'increase') {
                    const result = this.cartService.updateQuantity(itemName, 1);
                    if (result.item && result.item.quantity >= CONFIG.MAX_ITEM_QTY) {
                        this.toastManager.show(`Maximum quantity limit reached for "${itemName}"`, 'warning');
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
            });
        }
    }

    _setupKeyboardHandlers() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
    }

    open() {
        if (this.drawer && this.overlay) {
            this.drawer.classList.add('open');
            this.overlay.classList.add('open');
            this.overlay.setAttribute('aria-hidden', 'false');
            // Focus drawer for screen reader accessibility
            const closeBtn = document.getElementById('cart-drawer-close');
            if (closeBtn) closeBtn.focus();
        }
    }

    close() {
        if (this.drawer && this.overlay) {
            this.drawer.classList.remove('open');
            this.overlay.classList.remove('open');
            this.overlay.setAttribute('aria-hidden', 'true');
        }
    }

    isOpen() {
        return Boolean(this.drawer && this.drawer.classList.contains('open'));
    }

    triggerBounce() {
        const cartIcons = document.querySelectorAll('.cart-icon');
        cartIcons.forEach(icon => {
            icon.classList.remove('animate');
            void icon.offsetWidth; // Force CSS reflow
            icon.classList.add('animate');
        });
    }

    render() {
        if (typeof document === 'undefined') return;

        const items = this.cartService.getItems();
        const totals = this.cartService.getTotals();

        // 1. Update navbar badge
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

        // 3. Render items in drawer safely using DOM APIs & HTML escaping
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

        // Render each item safely
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
    }

    handleClearCart() {
        const items = this.cartService.getItems();
        if (items.length === 0) {
            this.toastManager.show('Cart is already empty', 'info');
            return;
        }

        if (typeof window !== 'undefined' && window.confirm('Are you sure you want to clear all items from your cart?')) {
            this.cartService.clear();
            this.toastManager.show('Cart cleared successfully', 'info');
        }
    }

    handleCheckout() {
        const items = this.cartService.getItems();
        const totals = this.cartService.getTotals();

        if (items.length === 0) {
            this.toastManager.show('Your cart is empty. Add products before checking out!', 'warning');
            return;
        }

        // In production, this would trigger payment gateway or POST /api/v1/orders/checkout
        const confirmed = typeof window !== 'undefined'
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
 */
class SearchAndFilterController {
    static init() {
        if (typeof document === 'undefined') return;

        const isProductPage = window.location.pathname.includes('product.html') || document.querySelector('.products');

        if (isProductPage) {
            SearchAndFilterController._setupProductPageFiltering();
        } else {
            SearchAndFilterController._setupHomePageSearch();
        }

        SearchAndFilterController._setupLoginButtons();
    }

    static _setupProductPageFiltering() {
        const searchInput = document.querySelector('.search-box input');
        const searchBtn = document.querySelector('.search-box button');
        const productsGrid = document.querySelector('.products');
        if (!productsGrid) return;

        const productCards = Array.from(productsGrid.querySelectorAll('.product'));

        // Helper to perform the filter
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

            // Handle empty state message
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
                        // Remove URL params safely without full reload
                        if (window.history && window.history.replaceState) {
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
        const urlParams = new URLSearchParams(window.location.search);
        const initialSearch = urlParams.get('search') || '';
        const initialCategory = urlParams.get('category') || '';

        if (initialSearch && searchInput) {
            searchInput.value = initialSearch;
        }

        if (initialSearch || initialCategory) {
            performFilter(initialSearch, initialCategory);
        }

        // Live typing filter
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

    static _setupHomePageSearch() {
        const searchInput = document.querySelector('.search-box input');
        const searchBtn = document.querySelector('.search-box button');

        const navigateToSearch = () => {
            const query = (searchInput?.value || '').trim();
            if (query) {
                window.location.href = `product.html?search=${encodeURIComponent(query)}`;
            } else {
                window.location.href = 'product.html';
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

        // Category Cards Navigation
        const categoryCards = document.querySelectorAll('.category-card');
        categoryCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.addEventListener('click', () => {
                const categoryTitle = card.querySelector('h3')?.textContent?.trim() || '';
                window.location.href = `product.html?category=${encodeURIComponent(categoryTitle)}`;
            });
        });

        // Shop Now Button Navigation
        const shopBtns = document.querySelectorAll('.shop-btn');
        shopBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                window.location.href = 'product.html';
            });
        });
    }

    static _setupLoginButtons() {
        const loginBtns = document.querySelectorAll('.login-btn');
        loginBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                if (window.toastManager) {
                    window.toastManager.show('Guest Collector session active. User accounts arrive in v1.2!', 'info', 4000);
                } else {
                    alert('Guest Collector session active. User accounts arrive in v1.2!');
                }
            });
        });
    }
}

/* ==========================================================================
   9. SCROLL REVEAL OBSERVER
   ========================================================================== */

/**
 * Progressive enhancement IntersectionObserver triggering smooth scroll reveals.
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
   10. CENTRALIZED ERROR BOUNDARY
   ========================================================================== */

/**
 * Global error listeners to catch unexpected client exceptions gracefully.
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
   11. BROWSER INITIALIZATION & BACKWARD COMPATIBLE GLOBAL API
   ========================================================================== */

// Instantiate core singletons
const safeStorage = new SafeStorage();
const cartService = new CartService(safeStorage);
const toastManager = new ToastManager();
const cartUI = new CartUI(cartService, toastManager);

// Global public API functions (maintains 100% backward compatibility with HTML onclick attributes)
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

function changeQty(productName, delta) {
    try {
        cartService.updateQuantity(productName, delta);
    } catch (err) {
        console.error('[changeQty] Failure:', err);
    }
}

function removeFromCart(productName) {
    try {
        cartService.removeItem(productName);
        toastManager.show(`Removed "${productName}" from cart`, 'info');
    } catch (err) {
        console.error('[removeFromCart] Failure:', err);
    }
}

function clearCart() {
    cartUI.handleClearCart();
}

function checkoutCart() {
    cartUI.handleCheckout();
}

function openCartDrawer() {
    cartUI.open();
}

function closeCartDrawer() {
    cartUI.close();
}

function showToast(message, type = 'success') {
    toastManager.show(message, type);
}

function updateCartUI() {
    cartUI.render();
}

// Automatically attach image error fallbacks across page
function setupImageFallbacks() {
    if (typeof document === 'undefined') return;
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        img.addEventListener('error', () => {
            if (img.src !== CONFIG.DEFAULT_FALLBACK_IMAGE) {
                img.src = CONFIG.DEFAULT_FALLBACK_IMAGE;
            }
        });
    });
}

// Attach to window object for browser access
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
    window.CartValidationError = CartValidationError;
    window.StorageError = StorageError;
    window.SafeStorage = SafeStorage;
    window.CartService = CartService;
    window.ToastManager = ToastManager;
    window.CartUI = CartUI;
    window.escapeHtml = escapeHtml;
    window.formatCurrency = formatCurrency;

    // Singletons
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

    // Initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setupGlobalErrorBoundary();
            cartUI.init();
            SearchAndFilterController.init();
            setupScrollReveal();
            setupImageFallbacks();
        });
    } else {
        setupGlobalErrorBoundary();
        cartUI.init();
        SearchAndFilterController.init();
        setupScrollReveal();
        setupImageFallbacks();
    }
}

// Module export for Node.js test runner
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        CartValidationError,
        StorageError,
        SafeStorage,
        CartService,
        ToastManager,
        CartUI,
        SearchAndFilterController,
        escapeHtml,
        formatCurrency,
        addToCart,
        changeQty,
        removeFromCart,
        clearCart,
        checkoutCart
    };
}
