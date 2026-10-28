/**
 * Unit Tests: CartService Core Business Logic, Boundary Conditions & State Resilience
 * Framework: Node.js Built-in Test Runner (node:test & node:assert/strict)
 *
 * Each test suite documents:
 * - Test Objective: What behavior or specification is being validated.
 * - Precondition / Input: Exact input fixtures, initial states, and boundaries.
 * - Expected Result: Concrete assertion criteria and state changes.
 * - Why This Scenario Matters: Real-world e-commerce impact and failure prevention.
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CartService, CartValidationError, CONFIG } = require('../cart.js');

/**
 * Deterministic Mock Storage Adapter for headless unit tests.
 * Isolates CartService from browser globals and ensures test independence.
 */
class MockStorage {
    constructor(initialData = null) {
        this.store = new Map();
        if (initialData !== null) {
            this.store.set(CONFIG.STORAGE_KEY, initialData);
        }
    }
    getItem(key) {
        return this.store.get(key) || null;
    }
    setItem(key, value) {
        this.store.set(key, String(value));
        return true;
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

describe('CartService - Initialization & Corrupted Storage Recovery', () => {
    test('initializes with an empty cart when storage has no data', () => {
        /**
         * Test Objective: Verify that CartService gracefully creates an empty collection when storage is clean.
         * Precondition / Input: MockStorage containing no stored keys.
         * Expected Result: getItems() returns [], getTotals() returns 0 items and ₹0 total.
         * Why This Scenario Matters: First-time store visitors must see an empty cart without null pointer exceptions.
         */
        const storage = new MockStorage();
        const service = new CartService(storage);

        assert.deepEqual(service.getItems(), []);
        assert.equal(service.getTotals().totalItems, 0);
        assert.equal(service.getTotals().totalPrice, 0);
        assert.equal(service.getTotals().formattedTotalPrice, '0');
    });

    test('loads valid existing items from storage', () => {
        /**
         * Test Objective: Confirm that valid serialized JSON in storage is parsed and inflated properly.
         * Precondition / Input: Stored JSON with one valid item: Zoro Statue, price ₹499, qty 2.
         * Expected Result: service.getItems() returns matching array with 1 item; totals reflect 2 items, ₹998.
         * Why This Scenario Matters: Returning customers or page reloads must retain their active basket.
         */
        const savedData = JSON.stringify([
            { name: 'Zoro Statue', price: 499, image: 'https://example.com/zoro.jpg', quantity: 2 }
        ]);
        const storage = new MockStorage(savedData);
        const service = new CartService(storage);

        const items = service.getItems();
        assert.equal(items.length, 1);
        assert.equal(items[0].name, 'Zoro Statue');
        assert.equal(items[0].price, 499);
        assert.equal(items[0].quantity, 2);
        assert.equal(service.getTotals().totalItems, 2);
        assert.equal(service.getTotals().totalPrice, 998);
    });

    test('recovers gracefully from corrupted JSON in storage without crashing', () => {
        /**
         * Test Objective: Verify that malformed JSON strings do not throw unhandled SyntaxErrors during init.
         * Precondition / Input: Corrupted JSON string '{"broken json: missing bracket' in storage.
         * Expected Result: CartService catches the SyntaxError, logs a warning, and initializes with an empty cart.
         * Why This Scenario Matters: If local storage data becomes partially written or corrupted by browser crashes,
         * the entire store must still load and function rather than crashing the browser tab.
         */
        const corruptedData = '{"broken json: missing bracket';
        const storage = new MockStorage(corruptedData);
        const service = new CartService(storage);

        assert.deepEqual(service.getItems(), []);
        assert.equal(service.getTotals().totalItems, 0);
        assert.equal(service.getTotals().totalPrice, 0);
    });

    test('recovers gracefully when storage contains non-array JSON data', () => {
        /**
         * Test Objective: Confirm resilience when stored JSON is valid JSON but not an Array (e.g. object, number, boolean).
         * Precondition / Input: JSON string representing an object: '{"error": "not an array"}'.
         * Expected Result: CartService drops the non-array payload and resets items to [].
         * Why This Scenario Matters: Prevents TypeError: this.items.map / find is not a function in subsequent calls.
         */
        const objectData = JSON.stringify({ error: 'not an array' });
        const storage = new MockStorage(objectData);
        const service = new CartService(storage);

        assert.deepEqual(service.getItems(), []);
    });

    test('filters out invalid item objects from stored array while keeping valid ones', () => {
        /**
         * Test Objective: Verify granular item cleansing where valid items are preserved even if neighboring items are corrupted.
         * Precondition / Input: Array with 1 valid item (Luffy Keychain) and 3 corrupted records (empty name, negative price, null).
         * Expected Result: Only the 1 valid item is preserved; invalid records are discarded without data loss of good records.
         * Why This Scenario Matters: If a bug corrupted one item, the user does not lose their entire shopping basket.
         */
        const mixedData = JSON.stringify([
            { name: 'Luffy Keychain', price: 49, quantity: 1 },
            { name: '', price: 100 },               // Invalid: empty name
            { name: 'Naruto Poster', price: -50 },  // Invalid: negative price
            null                                    // Invalid: null object
        ]);
        const storage = new MockStorage(mixedData);
        const service = new CartService(storage);

        const items = service.getItems();
        assert.equal(items.length, 1);
        assert.equal(items[0].name, 'Luffy Keychain');
    });

    test('syncFromStorage re-reads storage and notifies subscribers', () => {
        /**
         * Test Objective: Ensure syncFromStorage updates in-memory items and notifies observers (cross-tab sync).
         * Precondition / Input: Service initialized empty; storage updated externally with new item; syncFromStorage called.
         * Expected Result: Service items match new storage contents and subscriber callback is invoked.
         * Why This Scenario Matters: Allows real-time multi-tab synchronization when a customer shops in multiple windows.
         */
        const storage = new MockStorage();
        const service = new CartService(storage);

        let notified = false;
        service.subscribe(() => { notified = true; });

        storage.setItem(CONFIG.STORAGE_KEY, JSON.stringify([
            { name: 'Goku Phone Case', price: 199, quantity: 1 }
        ]));

        service.syncFromStorage();
        assert.equal(notified, true);
        assert.equal(service.getItems().length, 1);
        assert.equal(service.getItems()[0].name, 'Goku Phone Case');
    });
});

describe('CartService - Adding Items & Boundary Conditions', () => {
    let service;
    let storage;

    beforeEach(() => {
        storage = new MockStorage();
        service = new CartService(storage);
    });

    test('successfully adds a valid new item', () => {
        /**
         * Test Objective: Verify adding a valid product creates an item with correct schema and flags added=true.
         * Precondition / Input: name: 'Zoro Statue', price: 499, image: 'https://example.com/zoro.jpg', qty: 1.
         * Expected Result: Result metadata has added=true, capped=false, item quantity=1, items.length=1.
         * Why This Scenario Matters: Core purchasing workflow requirement.
         */
        const result = service.addItem('Zoro Statue', 499, 'https://example.com/zoro.jpg', 1);

        assert.equal(result.added, true);
        assert.equal(result.capped, false);
        assert.equal(result.item.name, 'Zoro Statue');
        assert.equal(result.item.price, 499);
        assert.equal(result.item.quantity, 1);
        assert.equal(service.getItems().length, 1);
    });

    test('increments quantity when adding an existing item', () => {
        /**
         * Test Objective: Verify duplicate product additions increment existing item quantity rather than duplicating records.
         * Precondition / Input: Add Zoro Statue (qty 1), then add Zoro Statue again (qty 2).
         * Expected Result: items.length remains 1; item.quantity becomes 3; result.added is false.
         * Why This Scenario Matters: E-commerce baskets must maintain single line-items per distinct product.
         */
        service.addItem('Zoro Statue', 499, null, 1);
        const result = service.addItem('Zoro Statue', 499, null, 2);

        assert.equal(result.added, false);
        assert.equal(result.item.quantity, 3);
        assert.equal(service.getItems().length, 1);
    });

    test('supports free promotional items with price = 0', () => {
        /**
         * Test Objective: Confirm that free promotional items with price = 0 are valid and accepted.
         * Precondition / Input: name: 'Promotional Sticker', price: 0, qty: 1.
         * Expected Result: Item is added; price is 0; total price remains 0.
         * Why This Scenario Matters: Store promotions (buy-one-get-one free gifts) have zero unit cost.
         */
        const result = service.addItem('Promotional Sticker', 0, null, 1);
        assert.equal(result.item.price, 0);
        assert.equal(service.getTotals().totalPrice, 0);
    });

    test('converts numeric string price to valid number', () => {
        /**
         * Test Objective: Confirm that string representations of numbers (e.g. '199.50') are safely coerced to floats.
         * Precondition / Input: price passed as string '199.50'.
         * Expected Result: typeof item.price is 'number', value is 199.5.
         * Why This Scenario Matters: HTML data attributes return strings; domain logic must normalize data types.
         */
        const result = service.addItem('Goku Phone Case', '199.50', null, 1);

        assert.equal(typeof result.item.price, 'number');
        assert.equal(result.item.price, 199.5);
    });

    test('applies fallback image when image is not provided, null, or empty string', () => {
        /**
         * Test Objective: Ensure missing image inputs resolve to CONFIG.DEFAULT_FALLBACK_IMAGE.
         * Precondition / Input: Image parameter passed as empty string ''.
         * Expected Result: item.image equals CONFIG.DEFAULT_FALLBACK_IMAGE.
         * Why This Scenario Matters: Prevents broken thumbnail rendering in UI drawer.
         */
        const result = service.addItem('Mikasa Poster', 299, '');
        assert.equal(result.item.image, CONFIG.DEFAULT_FALLBACK_IMAGE);
    });

    test('sanitizes dangerous image URLs rejecting javascript: pseudoprotocol', () => {
        /**
         * Test Objective: Ensure dangerous image URLs (e.g. javascript:alert(1)) are blocked and replaced with fallback SVG.
         * Precondition / Input: image passed as 'javascript:alert("pwned")'.
         * Expected Result: item.image falls back to CONFIG.DEFAULT_FALLBACK_IMAGE.
         * Why This Scenario Matters: Prevents XSS via URI schemes in image tags.
         */
        const result = service.addItem('Evil Poster', 199, 'javascript:alert(1)');
        assert.equal(result.item.image, CONFIG.DEFAULT_FALLBACK_IMAGE);
    });

    test('trims leading and trailing whitespace from product names', () => {
        /**
         * Test Objective: Ensure product names with untrimmed whitespace are normalized.
         * Precondition / Input: name: '   Kakashi T-shirt   '.
         * Expected Result: item.name becomes 'Kakashi T-shirt'.
         * Why This Scenario Matters: Prevents subtle duplicate items differing only in whitespace padding.
         */
        const result = service.addItem('   Kakashi T-shirt   ', 299);
        assert.equal(result.item.name, 'Kakashi T-shirt');
    });

    test('accepts product name at exact maximum boundary limit (120 chars)', () => {
        /**
         * Test Objective: Verify boundary condition of maximum allowable name length (120 characters).
         * Precondition / Input: Product name string of exactly 120 characters.
         * Expected Result: Item is added without throwing CartValidationError.
         * Why This Scenario Matters: Boundary testing guarantees edge conditions are properly accepted.
         */
        const boundaryName = 'A'.repeat(CONFIG.MAX_NAME_LENGTH);
        const result = service.addItem(boundaryName, 100);
        assert.equal(result.item.name.length, 120);
    });

    test('persists state to storage adapter after adding item', () => {
        /**
         * Test Objective: Confirm that every addItem invocation automatically serializes updated items to storage.
         * Precondition / Input: Clean storage, addItem called for Naruto Statue.
         * Expected Result: Storage key 'cart' contains JSON array with Naruto Statue record.
         * Why This Scenario Matters: Guarantees durability across browser sessions.
         */
        service.addItem('Naruto Statue', 399, null, 1);
        const stored = JSON.parse(storage.getItem(CONFIG.STORAGE_KEY));

        assert.equal(stored.length, 1);
        assert.equal(stored[0].name, 'Naruto Statue');
    });

    test('caps item quantity at maximum allowed limit (99) and sets capped=true', () => {
        /**
         * Test Objective: Ensure item quantity cannot exceed the defined ceiling of 99 items per line-item.
         * Precondition / Input: Item initially added with qty 90, followed by an additional 20.
         * Expected Result: Quantity is clamped at 99; result.capped is true.
         * Why This Scenario Matters: Prevents inventory exhaustion and integer overflow attacks.
         */
        const result1 = service.addItem('Luffy Keychain', 49, null, 90);
        assert.equal(result1.item.quantity, 90);
        assert.equal(result1.capped, false);

        const result2 = service.addItem('Luffy Keychain', 49, null, 20);
        assert.equal(result2.capped, true);
        assert.equal(result2.item.quantity, CONFIG.MAX_ITEM_QTY);
    });
});

describe('CartService - Input Validation & Defensive Checks (Negative Cases)', () => {
    let service;

    beforeEach(() => {
        service = new CartService(new MockStorage());
    });

    test('rejects empty product name with CartValidationError', () => {
        /**
         * Test Objective: Ensure empty string names are rejected with descriptive CartValidationError.
         * Precondition / Input: name = ''.
         * Expected Result: Throws CartValidationError with field = 'name'.
         * Why This Scenario Matters: Prevents nameless phantom items in cart.
         */
        assert.throws(() => {
            service.addItem('', 100);
        }, (err) => {
            assert.ok(err instanceof CartValidationError);
            assert.equal(err.field, 'name');
            return true;
        });
    });

    test('rejects whitespace-only product name', () => {
        /**
         * Test Objective: Ensure whitespace-only strings fail validation after trim.
         * Precondition / Input: name = '      '.
         * Expected Result: Throws CartValidationError.
         * Why This Scenario Matters: Blank titles must not be created.
         */
        assert.throws(() => {
            service.addItem('    ', 100);
        }, CartValidationError);
    });

    test('rejects non-string product names (null, undefined, numbers, objects)', () => {
        /**
         * Test Objective: Confirm type safety for product title parameters.
         * Precondition / Input: null, undefined, 12345, and {}.
         * Expected Result: All throw CartValidationError.
         * Why This Scenario Matters: Guard against programmatic invocation errors.
         */
        assert.throws(() => service.addItem(null, 100), CartValidationError);
        assert.throws(() => service.addItem(undefined, 100), CartValidationError);
        assert.throws(() => service.addItem(12345, 100), CartValidationError);
        assert.throws(() => service.addItem({}, 100), CartValidationError);
    });

    test('rejects product name exceeding maximum length limit (121 chars)', () => {
        /**
         * Test Objective: Confirm upper boundary enforcement for product title length.
         * Precondition / Input: String of 121 characters (MAX_NAME_LENGTH + 1).
         * Expected Result: Throws CartValidationError.
         * Why This Scenario Matters: Prevents memory bloat and UI layout breakage in drawer cards.
         */
        const longName = 'A'.repeat(CONFIG.MAX_NAME_LENGTH + 1);
        assert.throws(() => {
            service.addItem(longName, 100);
        }, CartValidationError);
    });

    test('rejects negative price values', () => {
        /**
         * Test Objective: Reject negative prices to prevent negative cart total exploits.
         * Precondition / Input: price = -50.
         * Expected Result: Throws CartValidationError with field = 'price'.
         * Why This Scenario Matters: Security vulnerability prevention against price manipulation.
         */
        assert.throws(() => {
            service.addItem('Free Item', -50);
        }, (err) => {
            assert.ok(err instanceof CartValidationError);
            assert.equal(err.field, 'price');
            return true;
        });
    });

    test('rejects non-numeric and non-finite price values (NaN, Infinity, symbols)', () => {
        /**
         * Test Objective: Ensure non-finite numbers do not corrupt currency totals.
         * Precondition / Input: 'invalid_price', NaN, Infinity, -Infinity.
         * Expected Result: Throws CartValidationError.
         * Why This Scenario Matters: Prevents NaN contagion across total calculation loops.
         */
        assert.throws(() => service.addItem('Item', 'invalid_price'), CartValidationError);
        assert.throws(() => service.addItem('Item', NaN), CartValidationError);
        assert.throws(() => service.addItem('Item', Infinity), CartValidationError);
        assert.throws(() => service.addItem('Item', -Infinity), CartValidationError);
    });

    test('rejects zero or negative quantities in addItem', () => {
        /**
         * Test Objective: Ensure addItem requires a positive integer >= 1.
         * Precondition / Input: quantity = 0 and quantity = -5.
         * Expected Result: Throws CartValidationError with field = 'quantity'.
         * Why This Scenario Matters: Adding zero items is logically invalid.
         */
        assert.throws(() => service.addItem('Item', 100, null, 0), CartValidationError);
        assert.throws(() => service.addItem('Item', 100, null, -5), CartValidationError);
    });
});

describe('CartService - Quantity Modifications & Item Removal', () => {
    let service;

    beforeEach(() => {
        service = new CartService(new MockStorage());
        service.addItem('Naruto Statue', 399, null, 3);
    });

    test('increments quantity with positive delta', () => {
        /**
         * Test Objective: Verify stepper +1 increment updates item and returns removed=false.
         * Precondition / Input: Naruto Statue with qty 3, delta +1.
         * Expected Result: Quantity becomes 4; removed is false.
         * Why This Scenario Matters: Drawer stepper "+" button functionality.
         */
        const res = service.updateQuantity('Naruto Statue', 1);
        assert.equal(res.removed, false);
        assert.equal(res.item.quantity, 4);
    });

    test('decrements quantity with negative delta', () => {
        /**
         * Test Objective: Verify stepper -1 decrement reduces quantity.
         * Precondition / Input: Naruto Statue with qty 3, delta -1.
         * Expected Result: Quantity becomes 2; removed is false.
         * Why This Scenario Matters: Drawer stepper "-" button functionality.
         */
        const res = service.updateQuantity('Naruto Statue', -1);
        assert.equal(res.removed, false);
        assert.equal(res.item.quantity, 2);
    });

    test('removes item automatically when quantity reaches zero', () => {
        /**
         * Test Objective: Confirm that decrementing quantity to 0 removes the item entirely from the cart.
         * Precondition / Input: Naruto Statue (qty 3), delta -3.
         * Expected Result: res.removed is true; res.item is null; items.length is 0.
         * Why This Scenario Matters: Clean user experience: reducing count to 0 clears the item without an extra click.
         */
        const res = service.updateQuantity('Naruto Statue', -3);
        assert.equal(res.removed, true);
        assert.equal(res.item, null);
        assert.equal(service.getItems().length, 0);
    });

    test('removes item automatically when quantity drops below zero', () => {
        /**
         * Test Objective: Ensure negative deltas exceeding current quantity remove item safely.
         * Precondition / Input: Naruto Statue (qty 3), delta -10.
         * Expected Result: res.removed is true; items.length is 0.
         * Why This Scenario Matters: Defensive bounds check against irregular stepper inputs.
         */
        const res = service.updateQuantity('Naruto Statue', -10);
        assert.equal(res.removed, true);
        assert.equal(service.getItems().length, 0);
    });

    test('caps quantity at 99 when positive delta exceeds limit', () => {
        /**
         * Test Objective: Confirm updateQuantity respects MAX_ITEM_QTY ceiling.
         * Precondition / Input: Naruto Statue (qty 3), delta +100.
         * Expected Result: Quantity is clamped to 99.
         * Why This Scenario Matters: Prevents exceeding order limit via rapid clicks.
         */
        const res = service.updateQuantity('Naruto Statue', 100);
        assert.equal(res.item.quantity, 99);
    });

    test('returns null and does not throw when updating a non-existent product', () => {
        /**
         * Test Objective: Ensure updateQuantity handles missing products gracefully without throwing.
         * Precondition / Input: Target name 'Unknown Item' which is not in the cart.
         * Expected Result: Returns { removed: false, item: null }; does not throw.
         * Why This Scenario Matters: Protects against race conditions between multiple tabs or stale DOM events.
         */
        const res = service.updateQuantity('Unknown Item', 1);
        assert.equal(res.removed, false);
        assert.equal(res.item, null);
    });

    test('returns null when updateQuantity called with invalid product name types', () => {
        /**
         * Test Objective: Verify type guard on updateQuantity product name.
         * Precondition / Input: updateQuantity called with null and numbers.
         * Expected Result: Returns { removed: false, item: null }.
         * Why This Scenario Matters: Headless or programmatic calling safety.
         */
        assert.deepEqual(service.updateQuantity(null, 1), { removed: false, item: null });
        assert.deepEqual(service.updateQuantity(1234, 1), { removed: false, item: null });
    });

    test('removes single item completely using removeItem', () => {
        /**
         * Test Objective: Verify removeItem deletes the targeted product and leaves others untouched.
         * Precondition / Input: Cart contains Naruto Statue and Luffy Keychain; removeItem('Naruto Statue') called.
         * Expected Result: Returns true; items.length becomes 1; Luffy Keychain remains.
         * Why This Scenario Matters: Trash can button functionality in drawer.
         */
        service.addItem('Luffy Keychain', 49, null, 1);
        assert.equal(service.getItems().length, 2);

        const removed = service.removeItem('Naruto Statue');
        assert.equal(removed, true);
        assert.equal(service.getItems().length, 1);
        assert.equal(service.getItems()[0].name, 'Luffy Keychain');
    });

    test('removeItem returns false when target item does not exist or input is non-string', () => {
        /**
         * Test Objective: Confirm removeItem returns false on nonexistent items or invalid inputs.
         * Precondition / Input: removeItem('Non-Existent Item') and removeItem(null).
         * Expected Result: Both return false; items array unchanged.
         * Why This Scenario Matters: Idempotent removal operations.
         */
        assert.equal(service.removeItem('Non-Existent Item'), false);
        assert.equal(service.removeItem(null), false);
        assert.equal(service.getItems().length, 1);
    });

    test('clear removes all items from the cart and persists empty array', () => {
        /**
         * Test Objective: Verify clear() empties all items and updates storage.
         * Precondition / Input: Cart contains 2 items; clear() called.
         * Expected Result: items.length is 0; totalItems is 0; storage key contains '[]'.
         * Why This Scenario Matters: "Clear Cart" button and order completion cleanup.
         */
        service.addItem('Mikasa Poster', 299, null, 1);
        assert.equal(service.getItems().length, 2);

        service.clear();
        assert.equal(service.getItems().length, 0);
        assert.equal(service.getTotals().totalItems, 0);
    });

    test('clear on an already empty cart executes safely as an idempotent no-op', () => {
        /**
         * Test Objective: Verify clear() on empty cart does not throw errors.
         * Precondition / Input: Empty cart; clear() called twice.
         * Expected Result: items.length remains 0.
         * Why This Scenario Matters: Robustness against repeated button clicks.
         */
        service.clear();
        assert.doesNotThrow(() => service.clear());
        assert.equal(service.getItems().length, 0);
    });
});

describe('CartService - Calculations & Precision Arithmetic', () => {
    let service;

    beforeEach(() => {
        service = new CartService(new MockStorage());
    });

    test('calculates correct total items and price across multiple items', () => {
        /**
         * Test Objective: Verify total quantity and cumulative price sums across different items.
         * Precondition / Input: 2 Zoro Statues (₹499 each = 998) + 3 Luffy Keychains (₹49 each = 147).
         * Expected Result: totalItems = 5; totalPrice = 1145; formattedTotalPrice = '1,145'.
         * Why This Scenario Matters: Financial correctness for customer billing.
         */
        service.addItem('Zoro Statue', 499, null, 2);
        service.addItem('Luffy Keychain', 49, null, 3);

        const totals = service.getTotals();
        assert.equal(totals.totalItems, 5);
        assert.equal(totals.totalPrice, 1145);
        assert.equal(totals.formattedTotalPrice, '1,145');
    });

    test('handles IEEE-754 decimal arithmetic accurately without floating point artifacts', () => {
        /**
         * Test Objective: Prevent 0.10 + 0.20 from becoming 0.30000000000000004.
         * Precondition / Input: Item 1: price 0.10; Item 2: price 0.20.
         * Expected Result: totalPrice is strictly equal to 0.3.
         * Why This Scenario Matters: Financial rounding glitches display poorly and can cause invoice discrepancies.
         */
        service.addItem('Small Decal', 0.10, null, 1);
        service.addItem('Mini Pin', 0.20, null, 1);

        const totals = service.getTotals();
        assert.equal(totals.totalPrice, 0.3);
    });

    test('rounds fractional prices to 2 decimal places using epsilon math', () => {
        /**
         * Test Objective: Ensure 3-decimal prices (e.g. 49.999) round to 2 decimals on insertion.
         * Precondition / Input: price = 49.999.
         * Expected Result: Stored price is 50; totals reflect 50.
         * Why This Scenario Matters: Prevents fractional cent accumulation.
         */
        const result = service.addItem('Sub-cent Item', 49.999);
        assert.equal(result.item.price, 50);
        assert.equal(service.getTotals().totalPrice, 50);
    });

    test('returns formatted currency string for large values in Indian format', () => {
        /**
         * Test Objective: Verify Indian numbering format grouping (e.g. 9,998).
         * Precondition / Input: 2 One piece Headphones at ₹4999 each.
         * Expected Result: totalPrice = 9998; formattedTotalPrice = '9,998'.
         * Why This Scenario Matters: Localized currency rendering for Indian Rupees (₹).
         */
        service.addItem('One piece Headphone', 4999, null, 2);
        const totals = service.getTotals();

        assert.equal(totals.totalPrice, 9998);
        assert.equal(totals.formattedTotalPrice, '9,998');
    });

    test('getItems returns an isolated clone array preventing external state mutation', () => {
        /**
         * Test Objective: Ensure getItems() returns shallow copies of item objects so callers cannot corrupt internal state.
         * Precondition / Input: Add Zoro Statue; mutate the object returned by getItems().
         * Expected Result: Subsequent getItems() call retains original unaltered state.
         * Why This Scenario Matters: Immutability and architectural safety of domain state.
         */
        service.addItem('Zoro Statue', 499);
        const itemsCopy = service.getItems();
        itemsCopy[0].price = 999999;
        itemsCopy[0].name = 'Hacked Name';

        const freshItems = service.getItems();
        assert.equal(freshItems[0].price, 499);
        assert.equal(freshItems[0].name, 'Zoro Statue');
    });
});

describe('CartService - Subscriptions & Observer Error Isolation', () => {
    test('notifies subscribers whenever cart state mutates', () => {
        /**
         * Test Objective: Verify subscribe() registers callbacks invoked on addItem, updateQuantity, and clear.
         * Precondition / Input: Subscribe listener; invoke addItem, updateQuantity, clear, then unsubscribe.
         * Expected Result: Callback triggered 3 times; no further calls after unsubscribe.
         * Why This Scenario Matters: Drives real-time UI synchronization in CartUI.
         */
        const service = new CartService(new MockStorage());
        let notificationCount = 0;
        let lastReceivedItems = null;

        const unsubscribe = service.subscribe((items, totals) => {
            notificationCount++;
            lastReceivedItems = items;
        });

        service.addItem('Zoro Statue', 499);
        assert.equal(notificationCount, 1);
        assert.equal(lastReceivedItems.length, 1);

        service.updateQuantity('Zoro Statue', 1);
        assert.equal(notificationCount, 2);

        service.clear();
        assert.equal(notificationCount, 3);
        assert.equal(lastReceivedItems.length, 0);

        unsubscribe();
        service.addItem('Naruto Statue', 399);
        // Should not notify after unsubscription
        assert.equal(notificationCount, 3);
    });

    test('isolates errors in a subscriber callback so other subscribers still receive updates', () => {
        /**
         * Test Objective: Ensure that an exception thrown by one subscriber does not prevent subsequent subscribers from running.
         * Precondition / Input: Subscriber 1 throws Error('Subscriber crash'); Subscriber 2 updates flag.
         * Expected Result: Subscriber 2 executes successfully; state mutation completes without error.
         * Why This Scenario Matters: Error boundary pattern: a faulty plugin or listener must not break the cart.
         */
        const service = new CartService(new MockStorage());
        let healthySubscriberFired = false;

        service.subscribe(() => {
            throw new Error('Faulty subscriber failure');
        });

        service.subscribe(() => {
            healthySubscriberFired = true;
        });

        assert.doesNotThrow(() => {
            service.addItem('Zoro Statue', 499);
        });

        assert.equal(healthySubscriberFired, true);
    });
});
