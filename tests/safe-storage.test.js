/**
 * Unit Tests: SafeStorage Resilience Adapter
 * Framework: Node.js Built-in Test Runner (node:test & node:assert/strict)
 *
 * Tests fault tolerance, memory fallbacks, quota exceptions, security limitations,
 * and backend synchronization.
 *
 * Each test suite documents:
 * - Test Objective: What behavior or specification is being validated.
 * - Precondition / Input: Exact input fixtures, initial states, and boundaries.
 * - Expected Result: Concrete assertion criteria and state changes.
 * - Why This Scenario Matters: Real-world e-commerce impact and failure prevention.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { SafeStorage } = require('../cart.js');

describe('SafeStorage - Basic In-Memory Operations', () => {
    test('stores, retrieves, and removes keys in memory fallback mode', () => {
        /**
         * Test Objective: Confirm full CRUD storage operations when running in memory mode without browser localStorage.
         * Precondition / Input: SafeStorage initialized with null backend (forces memory mode); testKey written, read, removed.
         * Expected Result: getItem returns null initially, then stored value, then null after removal.
         * Why This Scenario Matters: Ensures cart functionality survives when users disable cookies/storage or browse in sandboxed iframes.
         */
        const storage = new SafeStorage(null);

        assert.equal(storage.isInMemoryMode(), true);
        assert.equal(storage.getItem('testKey'), null);

        const success = storage.setItem('testKey', 'hello-world');
        assert.equal(success, true);
        assert.equal(storage.getItem('testKey'), 'hello-world');

        storage.removeItem('testKey');
        assert.equal(storage.getItem('testKey'), null);
    });

    test('coerces non-string values to string representation on setItem', () => {
        /**
         * Test Objective: Verify setItem safely coerces numbers, booleans, and objects to string equivalents matching Web Storage spec.
         * Precondition / Input: Set numeric value 42 and boolean true.
         * Expected Result: getItem returns '42' and 'true' as strings.
         * Why This Scenario Matters: Web Storage standard specifies string values; ensures consistent behavior between memory and backend.
         */
        const storage = new SafeStorage(null);
        storage.setItem('numKey', 42);
        storage.setItem('boolKey', true);

        assert.equal(storage.getItem('numKey'), '42');
        assert.equal(storage.getItem('boolKey'), 'true');
    });

    test('clears all entries in memory mode', () => {
        /**
         * Test Objective: Verify clear() completely purges all stored key-value pairs in memory mode.
         * Precondition / Input: Set keys 'k1' and 'k2'; invoke clear().
         * Expected Result: Both keys return null on getItem.
         * Why This Scenario Matters: Used during complete cart resets and customer sign-out.
         */
        const storage = new SafeStorage(null);
        storage.setItem('k1', 'v1');
        storage.setItem('k2', 'v2');

        storage.clear();
        assert.equal(storage.getItem('k1'), null);
        assert.equal(storage.getItem('k2'), null);
    });
});

describe('SafeStorage - Backend Integration & Fallback Handling', () => {
    test('uses working backend when available and reflects operations in underlying store', () => {
        /**
         * Test Objective: Ensure that when a healthy backend exists, operations write through to the underlying backend.
         * Precondition / Input: Mock backend object with store dictionary; SafeStorage initialized with mock.
         * Expected Result: storage.setItem updates mockBackend.store; isInMemoryMode is false.
         * Why This Scenario Matters: Verifies standard browser persistence path.
         */
        const mockBackend = {
            store: {},
            getItem(k) { return this.store[k] || null; },
            setItem(k, v) { this.store[k] = String(v); },
            removeItem(k) { delete this.store[k]; },
            clear() { this.store = {}; }
        };

        const storage = new SafeStorage(mockBackend);
        assert.equal(storage.isInMemoryMode(), false);

        storage.setItem('foo', 'bar');
        assert.equal(mockBackend.store['foo'], 'bar');
        assert.equal(storage.getItem('foo'), 'bar');

        storage.removeItem('foo');
        assert.equal(mockBackend.store['foo'], undefined);
        assert.equal(storage.getItem('foo'), null);
    });

    test('recovers gracefully to in-memory fallback when QuotaExceededError is thrown on write', () => {
        /**
         * Test Objective: Verify seamless fallback to in-memory store when storage disk quota is exceeded.
         * Precondition / Input: Backend setItem throws QuotaExceededError; storage.setItem('large_data', 'some-value') called.
         * Expected Result: setItem catches exception, switches isInMemoryMode to true, returns false, and retains data in memory.
         * Why This Scenario Matters: If device disk is full or storage quota hit, the user's cart must not crash the page.
         */
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
        assert.equal(storage.isInMemoryMode(), false);

        // setItem should catch QuotaExceededError, switch to memory mode, and return false
        const success = storage.setItem('large_data', 'some-value');
        assert.equal(success, false);
        assert.equal(storage.isInMemoryMode(), true);

        // Data should still be retrievable from the memory fallback!
        assert.equal(storage.getItem('large_data'), 'some-value');
    });

    test('recovers gracefully when backend getItem throws SecurityError (Safari Private Mode)', () => {
        /**
         * Test Objective: Confirm that SecurityErrors thrown during getItem (e.g. Safari strict privacy) return null safely.
         * Precondition / Input: Backend getItem throws SecurityError('The operation is insecure').
         * Expected Result: storage.getItem returns null without propagating an uncaught exception.
         * Why This Scenario Matters: Safari in private mode throws SecurityError when accessing window.localStorage;
         * this test guarantees the app remains completely resilient.
         */
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

    test('catches backend exceptions during removeItem and removes from memory store anyway', () => {
        /**
         * Test Objective: Confirm removeItem does not throw even if backend removeItem raises a hardware exception.
         * Precondition / Input: Backend removeItem throws Error('Hardware failure'); storage.removeItem called.
         * Expected Result: No exception thrown; memory store is updated cleanly.
         * Why This Scenario Matters: Deletion should never crash client UI.
         */
        const throwingBackend = {
            store: { k: 'v' },
            getItem(k) { return this.store[k] || null; },
            setItem(k, v) { this.store[k] = v; },
            removeItem() { throw new Error('Hardware write failure'); },
            clear() {}
        };

        const storage = new SafeStorage(throwingBackend);
        assert.doesNotThrow(() => {
            storage.removeItem('k');
        });
        assert.equal(storage.getItem('k'), null);
    });

    test('catches backend exceptions during clear without crashing', () => {
        /**
         * Test Objective: Confirm clear() handles backend clearing errors safely.
         * Precondition / Input: Backend clear throws Error('Storage locked'); storage.clear called.
         * Expected Result: No exception thrown; memory store cleared.
         * Why This Scenario Matters: Resetting state must remain resilient under all conditions.
         */
        const lockedBackend = {
            getItem() { return null; },
            setItem() {},
            removeItem() {},
            clear() { throw new Error('Storage locked'); }
        };

        const storage = new SafeStorage(lockedBackend);
        assert.doesNotThrow(() => {
            storage.clear();
        });
    });
});
