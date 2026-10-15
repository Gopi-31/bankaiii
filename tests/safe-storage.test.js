/**
 * Unit Tests: SafeStorage Resilience Adapter
 * Tests fault tolerance, memory fallbacks, quota exceptions, and security limitations.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { SafeStorage } = require('../cart.js');

describe('SafeStorage - Basic Operations', () => {
    test('stores, retrieves, and removes keys in memory fallback mode', () => {
        const storage = new SafeStorage(null); // null backend forces memory mode

        assert.equal(storage.getItem('testKey'), null);

        storage.setItem('testKey', 'hello-world');
        assert.equal(storage.getItem('testKey'), 'hello-world');

        storage.removeItem('testKey');
        assert.equal(storage.getItem('testKey'), null);
    });

    test('clears all entries in memory mode', () => {
        const storage = new SafeStorage(null);
        storage.setItem('k1', 'v1');
        storage.setItem('k2', 'v2');

        storage.clear();
        assert.equal(storage.getItem('k1'), null);
        assert.equal(storage.getItem('k2'), null);
    });
});

describe('SafeStorage - Backend Integration & Fallback Handling', () => {
    test('uses working backend when available', () => {
        const mockBackend = {
            store: {},
            getItem(k) { return this.store[k] || null; },
            setItem(k, v) { this.store[k] = String(v); },
            removeItem(k) { delete this.store[k]; },
            clear() { this.store = {}; }
        };

        const storage = new SafeStorage(mockBackend);
        storage.setItem('foo', 'bar');

        assert.equal(mockBackend.store['foo'], 'bar');
        assert.equal(storage.getItem('foo'), 'bar');
    });

    test('recovers gracefully to in-memory fallback when QuotaExceededError is thrown on write', () => {
        const failingBackend = {
            getItem() { return null; },
            setItem() {
                const err = new Error('Disk quota exceeded');
                err.name = 'QuotaExceededError';
                throw err;
            },
            removeItem() {},
            clear() {}
        };

        const storage = new SafeStorage(failingBackend);

        // setItem should catch QuotaExceededError, switch to memory mode, and return false
        const success = storage.setItem('large_data', 'some-value');
        assert.equal(success, false);

        // Data should still be retrievable from the memory fallback!
        assert.equal(storage.getItem('large_data'), 'some-value');
    });

    test('recovers gracefully when backend getItem throws SecurityError', () => {
        const secureBlockedBackend = {
            getItem() {
                const err = new Error('The operation is insecure.');
                err.name = 'SecurityError';
                throw err;
            },
            setItem() {},
            removeItem() {},
            clear() {}
        };

        const storage = new SafeStorage(secureBlockedBackend);

        // Should not throw, should return null safely
        assert.equal(storage.getItem('any_key'), null);
    });
});
