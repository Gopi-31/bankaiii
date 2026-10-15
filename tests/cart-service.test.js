/**
 * Unit Tests: CartService Core Business Logic & State Operations
 * Framework: Node.js Built-in Test Runner (node:test & node:assert)
 */

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { CartService, SafeStorage, CartValidationError, CONFIG } = require('../cart.js');

// Mock in-memory storage adapter for deterministic isolated testing
class MockStorage {
    constructor(initialData = null) {
        this.store = new Map();
        if (initialData) {
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

describe('CartService - Initialization & Storage Recovery', () => {
    test('initializes with an empty cart when storage has no data', () => {
        const storage = new MockStorage();
        const service = new CartService(storage);

        assert.deepEqual(service.getItems(), []);
        assert.equal(service.getTotals().totalItems, 0);
        assert.equal(service.getTotals().totalPrice, 0);
    });

    test('loads valid existing items from storage', () => {
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
    });

    test('recovers gracefully from corrupted JSON in storage without crashing', () => {
        const corruptedData = '{"broken json: missing bracket';
        const storage = new MockStorage(corruptedData);
        const service = new CartService(storage);

        assert.deepEqual(service.getItems(), []);
        assert.equal(service.getTotals().totalItems, 0);
    });

    test('recovers gracefully when storage contains non-array JSON data', () => {
        const objectData = JSON.stringify({ error: 'not an array' });
        const storage = new MockStorage(objectData);
        const service = new CartService(storage);

        assert.deepEqual(service.getItems(), []);
    });

    test('filters out invalid item objects from stored array while keeping valid ones', () => {
        const mixedData = JSON.stringify([
            { name: 'Luffy Keychain', price: 49, quantity: 1 },
            { name: '', price: 100 }, // Invalid: empty name
            { name: 'Naruto Poster', price: -50 } // Invalid: negative price
        ]);
        const storage = new MockStorage(mixedData);
        const service = new CartService(storage);

        const items = service.getItems();
        assert.equal(items.length, 1);
        assert.equal(items[0].name, 'Luffy Keychain');
    });
});

describe('CartService - Adding Items (Positive Cases)', () => {
    let service;
    let storage;

    beforeEach(() => {
        storage = new MockStorage();
        service = new CartService(storage);
    });

    test('successfully adds a valid new item', () => {
        const result = service.addItem('Zoro Statue', 499, 'https://example.com/zoro.jpg', 1);

        assert.equal(result.added, true);
        assert.equal(result.capped, false);
        assert.equal(result.item.name, 'Zoro Statue');
        assert.equal(result.item.price, 499);
        assert.equal(result.item.quantity, 1);
        assert.equal(service.getItems().length, 1);
    });

    test('increments quantity when adding an existing item', () => {
        service.addItem('Zoro Statue', 499, null, 1);
        const result = service.addItem('Zoro Statue', 499, null, 2);

        assert.equal(result.added, false);
        assert.equal(result.item.quantity, 3);
        assert.equal(service.getItems().length, 1);
    });

    test('converts numeric string price to valid number', () => {
        const result = service.addItem('Goku Phone Case', '199.50', null, 1);

        assert.equal(typeof result.item.price, 'number');
        assert.equal(result.item.price, 199.5);
    });

    test('applies fallback image when image is not provided or empty', () => {
        const result = service.addItem('Mikasa Poster', 299, '');
        assert.equal(result.item.image, CONFIG.DEFAULT_FALLBACK_IMAGE);
    });

    test('persists state to storage adapter after adding item', () => {
        service.addItem('Naruto Statue', 399, null, 1);
        const stored = JSON.parse(storage.getItem(CONFIG.STORAGE_KEY));

        assert.equal(stored.length, 1);
        assert.equal(stored[0].name, 'Naruto Statue');
    });
});

describe('CartService - Input Validation & Boundary Checks (Negative Cases)', () => {
    let service;

    beforeEach(() => {
        service = new CartService(new MockStorage());
    });

    test('rejects empty product name with CartValidationError', () => {
        assert.throws(() => {
            service.addItem('', 100);
        }, (err) => {
            assert.ok(err instanceof CartValidationError);
            assert.equal(err.field, 'name');
            return true;
        });
    });

    test('rejects whitespace-only product name', () => {
        assert.throws(() => {
            service.addItem('    ', 100);
        }, CartValidationError);
    });

    test('rejects non-string product names (null, undefined, numbers)', () => {
        assert.throws(() => service.addItem(null, 100), CartValidationError);
        assert.throws(() => service.addItem(undefined, 100), CartValidationError);
        assert.throws(() => service.addItem(12345, 100), CartValidationError);
    });

    test('rejects product name exceeding maximum length limit', () => {
        const longName = 'A'.repeat(CONFIG.MAX_NAME_LENGTH + 1);
        assert.throws(() => {
            service.addItem(longName, 100);
        }, CartValidationError);
    });

    test('rejects negative price values', () => {
        assert.throws(() => {
            service.addItem('Free Item', -50);
        }, (err) => {
            assert.ok(err instanceof CartValidationError);
            assert.equal(err.field, 'price');
            return true;
        });
    });

    test('rejects non-numeric price strings (NaN, strings, symbols)', () => {
        assert.throws(() => service.addItem('Item', 'invalid_price'), CartValidationError);
        assert.throws(() => service.addItem('Item', NaN), CartValidationError);
        assert.throws(() => service.addItem('Item', Infinity), CartValidationError);
    });

    test('rejects zero or negative quantities', () => {
        assert.throws(() => service.addItem('Item', 100, null, 0), CartValidationError);
        assert.throws(() => service.addItem('Item', 100, null, -3), CartValidationError);
    });

    test('caps item quantity at maximum allowed limit (99)', () => {
        const result1 = service.addItem('Luffy Keychain', 49, null, 90);
        assert.equal(result1.item.quantity, 90);

        const result2 = service.addItem('Luffy Keychain', 49, null, 20);
        assert.equal(result2.capped, true);
        assert.equal(result2.item.quantity, CONFIG.MAX_ITEM_QTY);
    });
});

describe('CartService - Quantity Modifications & Item Removal', () => {
    let service;

    beforeEach(() => {
        service = new CartService(new MockStorage());
        service.addItem('Naruto Statue', 399, null, 3);
    });

    test('increments quantity with positive delta', () => {
        const res = service.updateQuantity('Naruto Statue', 1);
        assert.equal(res.removed, false);
        assert.equal(res.item.quantity, 4);
    });

    test('decrements quantity with negative delta', () => {
        const res = service.updateQuantity('Naruto Statue', -1);
        assert.equal(res.removed, false);
        assert.equal(res.item.quantity, 2);
    });

    test('removes item automatically when quantity reaches zero', () => {
        const res = service.updateQuantity('Naruto Statue', -3);
        assert.equal(res.removed, true);
        assert.equal(res.item, null);
        assert.equal(service.getItems().length, 0);
    });

    test('removes item automatically when quantity drops below zero', () => {
        const res = service.updateQuantity('Naruto Statue', -10);
        assert.equal(res.removed, true);
        assert.equal(service.getItems().length, 0);
    });

    test('returns null and does not throw when updating a non-existent item', () => {
        const res = service.updateQuantity('Unknown Item', 1);
        assert.equal(res.removed, false);
        assert.equal(res.item, null);
    });

    test('removes single item completely using removeItem', () => {
        service.addItem('Luffy Keychain', 49, null, 1);
        assert.equal(service.getItems().length, 2);

        const removed = service.removeItem('Naruto Statue');
        assert.equal(removed, true);
        assert.equal(service.getItems().length, 1);
        assert.equal(service.getItems()[0].name, 'Luffy Keychain');
    });

    test('removeItem returns false when target item does not exist', () => {
        const removed = service.removeItem('Non-Existent Item');
        assert.equal(removed, false);
    });

    test('clear removes all items from the cart and storage', () => {
        service.addItem('Mikasa Poster', 299, null, 1);
        assert.equal(service.getItems().length, 2);

        service.clear();
        assert.equal(service.getItems().length, 0);
        assert.equal(service.getTotals().totalItems, 0);
    });
});

describe('CartService - Calculations & Precision', () => {
    let service;

    beforeEach(() => {
        service = new CartService(new MockStorage());
    });

    test('calculates correct total items and price across multiple items', () => {
        service.addItem('Zoro Statue', 499, null, 2); // 998
        service.addItem('Luffy Keychain', 49, null, 3); // 147

        const totals = service.getTotals();
        assert.equal(totals.totalItems, 5);
        assert.equal(totals.totalPrice, 1145);
        assert.equal(totals.formattedTotalPrice, '1,145');
    });

    test('handles IEEE-754 decimal arithmetic accurately without floating point artifacts', () => {
        // 0.10 + 0.20 in JavaScript standard arithmetic produces 0.30000000000000004
        service.addItem('Small Decal', 0.10, null, 1);
        service.addItem('Mini Pin', 0.20, null, 1);

        const totals = service.getTotals();
        assert.equal(totals.totalPrice, 0.3);
    });

    test('returns formatted currency string for Indian Rupee format', () => {
        service.addItem('One piece Headphone', 4999, null, 2); // 9998
        const totals = service.getTotals();

        assert.equal(totals.totalPrice, 9998);
        assert.equal(totals.formattedTotalPrice, '9,998');
    });
});

describe('CartService - Subscriptions & Observability', () => {
    test('notifies subscribers whenever cart state mutates', () => {
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
});
