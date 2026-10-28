/**
 * Unit Tests: Error Boundaries, Component Isolation & Resilience Subsystems
 * Framework: Node.js Built-in Test Runner (node:test & node:assert/strict)
 *
 * Tests the 4-tier error boundary architecture:
 * 1. Component-level failure isolation (safeInitComponent).
 * 2. Multi-component sequential resilience (failures in optional components don't crash others).
 * 3. Cross-tab storage synchronization and key filtering.
 * 4. Image error fallback loops and recursion prevention.
 *
 * Each test suite documents:
 * - Test Objective: What behavior or specification is being validated.
 * - Precondition / Input: Exact input fixtures, initial states, and boundaries.
 * - Expected Result: Concrete assertion criteria and state changes.
 * - Why This Scenario Matters: Real-world e-commerce impact and failure prevention.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    safeInitComponent,
    setupStorageSync,
    setupImageFallbacks,
    setupGlobalErrorBoundary,
    CONFIG,
    CartService,
    ComponentInitError
} = require('../cart.js');

describe('Error Boundaries - Component-Level Failure Isolation (safeInitComponent)', () => {
    test('executes healthy component initialization function and returns success=true', () => {
        /**
         * Test Objective: Verify safeInitComponent executes valid component functions without interference.
         * Precondition / Input: A healthy init function that updates a boolean flag.
         * Expected Result: Function executes; returns { success: true, error: null }.
         * Why This Scenario Matters: Standard happy path for component bootstrapping.
         */
        let executed = false;
        const result = safeInitComponent('TestComponent', () => {
            executed = true;
        });

        assert.equal(executed, true);
        assert.equal(result.success, true);
        assert.equal(result.error, null);
    });

    test('catches and isolates component initialization exceptions without crashing', () => {
        /**
         * Test Objective: Ensure an exception inside an initialization function is caught and isolated.
         * Precondition / Input: An init function that throws Error('DOM missing').
         * Expected Result: safeInitComponent does not throw; returns { success: false, error }.
         * Why This Scenario Matters: Component boundary isolation prevents an optional component bug
         * from killing the entire script thread.
         */
        const failingInit = () => {
            throw new Error('Simulated DOM initialization failure');
        };

        const result = safeInitComponent('FailingComponent', failingInit);

        assert.equal(result.success, false);
        assert.ok(result.error instanceof Error);
        assert.equal(result.error.message, 'Simulated DOM initialization failure');
    });

    test('guarantees sequential component execution when an earlier component fails', () => {
        /**
         * Test Objective: Confirm that if Component 1 fails, Component 2 and Component 3 still execute normally.
         * Precondition / Input:
         *   - Component 1: Throws error.
         *   - Component 2: Healthy, sets comp2Ran = true.
         *   - Component 3: Healthy, sets comp3Ran = true.
         * Expected Result: Component 1 is caught; Components 2 and 3 run and complete successfully.
         * Why This Scenario Matters: If an optional feature like ScrollReveal fails due to an unsupported
         * browser API, essential features like CartUI must continue to function uninterrupted.
         */
        let comp2Ran = false;
        let comp3Ran = false;

        const res1 = safeInitComponent('OptionalFeature1', () => {
            throw new Error('IntersectionObserver not supported');
        });

        const res2 = safeInitComponent('EssentialCartUI', () => {
            comp2Ran = true;
        });

        const res3 = safeInitComponent('SearchController', () => {
            comp3Ran = true;
        });

        assert.equal(res1.success, false);
        assert.equal(res2.success, true);
        assert.equal(comp2Ran, true);
        assert.equal(res3.success, true);
        assert.equal(comp3Ran, true);
    });

    test('ComponentInitError formats descriptive failure metadata', () => {
        /**
         * Test Objective: Verify ComponentInitError contains componentName and originalError references.
         * Precondition / Input: Instantiated with component name 'CatalogGrid' and root error.
         * Expected Result: Message includes component name and cause; attributes properly set.
         * Why This Scenario Matters: Provides structured error diagnostics for developers.
         */
        const rootErr = new Error('Network timeout');
        const compErr = new ComponentInitError('CatalogGrid', rootErr);

        assert.equal(compErr.name, 'ComponentInitError');
        assert.equal(compErr.componentName, 'CatalogGrid');
        assert.equal(compErr.originalError, rootErr);
        assert.ok(compErr.message.includes('CatalogGrid'));
        assert.ok(compErr.message.includes('Network timeout'));
    });
});

describe('Error Boundaries - Cross-Tab Storage Synchronization', () => {
    test('setupStorageSync handles storage events matching STORAGE_KEY', () => {
        /**
         * Test Objective: Ensure storage event triggers cart sync only when key matches CONFIG.STORAGE_KEY.
         * Precondition / Input: Mock window with addEventListener; simulate storage event with key = 'cart'.
         * Expected Result: cartService.syncFromStorage is called.
         * Why This Scenario Matters: Ensures state synchronization across multiple tabs when cart changes.
         */
        let synced = false;
        const mockCartService = {
            syncFromStorage() {
                synced = true;
            }
        };

        let storageCallback = null;
        const fakeWindow = {
            addEventListener(event, callback) {
                if (event === 'storage') {
                    storageCallback = callback;
                }
            }
        };

        // Temporarily provide fake window
        const originalWindow = global.window;
        global.window = fakeWindow;

        try {
            setupStorageSync(mockCartService);
            assert.equal(typeof storageCallback, 'function');

            // Dispatch matching storage event
            storageCallback({ key: CONFIG.STORAGE_KEY });
            assert.equal(synced, true);

            // Dispatch unrelated storage event
            synced = false;
            storageCallback({ key: 'unrelated_session_token' });
            assert.equal(synced, false);
        } finally {
            global.window = originalWindow;
        }
    });

    test('setupStorageSync exits safely without errors in headless mode (no window)', () => {
        /**
         * Test Objective: Confirm setupStorageSync does not throw when executed in headless Node.js.
         * Precondition / Input: window is undefined.
         * Expected Result: Executes without throwing.
         * Why This Scenario Matters: Headless test runner safety.
         */
        assert.doesNotThrow(() => {
            setupStorageSync(new CartService());
            setupStorageSync(null);
        });
    });
});

describe('Error Boundaries - Image Fallback Resilience & Global Handlers', () => {
    test('setupImageFallbacks handles image error events and prevents infinite loops', () => {
        /**
         * Test Objective: Confirm image error handler applies fallback SVG and sets fallbackApplied guard flag.
         * Precondition / Input: Mock image DOM elements with mock addEventListener; trigger 'error' event.
         * Expected Result: img.src is updated to CONFIG.DEFAULT_FALLBACK_IMAGE; dataset.fallbackApplied is 'true'.
         * Why This Scenario Matters: Prevents infinite error loops if fallback images fail or network is completely disconnected.
         */
        const listeners = [];
        const mockImg = {
            src: 'https://broken.cdn/missing.jpg',
            dataset: {},
            addEventListener(evt, fn) {
                listeners.push(fn);
            }
        };

        const fakeDoc = {
            querySelectorAll(selector) {
                if (selector === 'img') return [mockImg];
                return [];
            }
        };

        const originalDoc = global.document;
        global.document = fakeDoc;

        try {
            setupImageFallbacks();
            assert.equal(listeners.length, 1);

            // First error: applies fallback
            listeners[0]();
            assert.equal(mockImg.src, CONFIG.DEFAULT_FALLBACK_IMAGE);
            assert.equal(mockImg.dataset.fallbackApplied, 'true');

            // Second error: guard prevents infinite recursion
            mockImg.src = 'some_other_broken_url';
            listeners[0]();
            // Should NOT overwrite again because dataset.fallbackApplied is already set
            assert.equal(mockImg.src, 'some_other_broken_url');
        } finally {
            global.document = originalDoc;
        }
    });

    test('setupGlobalErrorBoundary attaches error and unhandledrejection handlers without throwing', () => {
        /**
         * Test Objective: Verify global error boundary attaches listeners to window cleanly.
         * Precondition / Input: Mock window recording registered listeners.
         * Expected Result: 'error' and 'unhandledrejection' listeners are registered without exceptions.
         * Why This Scenario Matters: Catches uncaught asynchronous promise rejections and script faults.
         */
        const attachedEvents = [];
        const fakeWindow = {
            addEventListener(event) {
                attachedEvents.push(event);
            }
        };

        const originalWindow = global.window;
        global.window = fakeWindow;

        try {
            assert.doesNotThrow(() => {
                setupGlobalErrorBoundary();
            });
            assert.ok(attachedEvents.includes('error'));
            assert.ok(attachedEvents.includes('unhandledrejection'));
        } finally {
            global.window = originalWindow;
        }
    });
});
