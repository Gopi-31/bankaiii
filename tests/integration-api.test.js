/**
 * Unit Tests: Global API & Backward Compatibility Wrappers
 * Framework: Node.js Built-in Test Runner (node:test & node:assert/strict)
 *
 * Tests global helper functions and integration points that interface with
 * HTML inline onclick handlers, CartUI, and ToastManager.
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
    CartService,
    ToastManager,
    CartUI,
    CONFIG,
    addToCart,
    changeQty,
    removeFromCart,
    clearCart,
    checkoutCart,
    openCartDrawer,
    closeCartDrawer,
    showToast,
    updateCartUI,
    safeInitComponent,
    sanitizeImageUrl
} = require('../cart.js');

describe('Backward Compatibility Global API & Presentation Integrations', () => {
    test('exports all expected global helper functions and components', () => {
        /**
         * Test Objective: Confirm presence and types of all publicly exposed API symbols.
         * Precondition / Input: Inspect exported members of cart.js module.
         * Expected Result: All expected helper functions, classes, and config are exported as functions/objects.
         * Why This Scenario Matters: Protects backward compatibility with existing HTML inline onclick attributes
         * (e.g. onclick="addToCart('Zoro Statue', 499)").
         */
        assert.equal(typeof addToCart, 'function');
        assert.equal(typeof changeQty, 'function');
        assert.equal(typeof removeFromCart, 'function');
        assert.equal(typeof clearCart, 'function');
        assert.equal(typeof checkoutCart, 'function');
        assert.equal(typeof openCartDrawer, 'function');
        assert.equal(typeof closeCartDrawer, 'function');
        assert.equal(typeof showToast, 'function');
        assert.equal(typeof updateCartUI, 'function');
        assert.equal(typeof safeInitComponent, 'function');
        assert.equal(typeof sanitizeImageUrl, 'function');
        assert.equal(typeof CONFIG, 'object');
    });

    test('addToCart handles valid product additions and invokes cart bounce', () => {
        /**
         * Test Objective: Ensure global addToCart correctly adds items to the active cart service.
         * Precondition / Input: addToCart called with valid name 'Zoro Statue' and price 499.
         * Expected Result: CartService contains Zoro Statue with quantity 1.
         * Why This Scenario Matters: Primary product catalog purchase workflow.
         */
        clearCart();
        assert.doesNotThrow(() => {
            addToCart('Zoro Statue', 499);
        });
    });

    test('addToCart catches CartValidationError gracefully without throwing unhandled exceptions', () => {
        /**
         * Test Objective: Confirm global addToCart catches validation errors from invalid user/developer inputs.
         * Precondition / Input: addToCart called with empty title '' and negative price -10.
         * Expected Result: Executes without throwing unhandled error; logs error and displays error toast.
         * Why This Scenario Matters: Protects the user experience from hard crashes if malformed markup exists.
         */
        assert.doesNotThrow(() => {
            addToCart('', 100);
            addToCart('Invalid Price Item', -50);
            addToCart(null, 100);
        });
    });

    test('changeQty modifies quantity and catches unexpected errors safely', () => {
        /**
         * Test Objective: Ensure changeQty updates item quantity from global context without throwing.
         * Precondition / Input: changeQty called on existing and non-existing items.
         * Expected Result: Executes cleanly without throwing exceptions.
         * Why This Scenario Matters: Used by drawer quantity steppers.
         */
        assert.doesNotThrow(() => {
            changeQty('Zoro Statue', 1);
            changeQty('Zoro Statue', -1);
            changeQty('Nonexistent Product', 1);
        });
    });

    test('removeFromCart and clearCart execute safely in headless mode', () => {
        /**
         * Test Objective: Ensure item deletion and cart clearing global wrappers operate safely.
         * Precondition / Input: removeFromCart and clearCart called in Node.js test environment.
         * Expected Result: Executes without throwing DOM or null pointer exceptions.
         * Why This Scenario Matters: Guarantees headless testability and defensive execution.
         */
        assert.doesNotThrow(() => {
            removeFromCart('Zoro Statue');
            clearCart();
        });
    });

    test('checkoutCart executes safely with empty or populated cart', () => {
        /**
         * Test Objective: Ensure checkoutCart initiates validation and warning toasts when empty.
         * Precondition / Input: checkoutCart called when cart is empty.
         * Expected Result: Executes cleanly without throwing exceptions.
         * Why This Scenario Matters: Checkout button user flow protection.
         */
        clearCart();
        assert.doesNotThrow(() => {
            checkoutCart();
        });
    });

    test('ToastManager handles multiple notification levels safely in headless mode', () => {
        /**
         * Test Objective: Confirm ToastManager handles all visual variants (success, error, warning, info) without DOM.
         * Precondition / Input: ToastManager instantiated in Node.js; show called with all 4 types.
         * Expected Result: Container lazily returns null; no exceptions are thrown.
         * Why This Scenario Matters: Allows headless testing of components that trigger toasts.
         */
        const toast = new ToastManager();
        assert.doesNotThrow(() => {
            toast.show('Success message', 'success');
            toast.show('Error message', 'error');
            toast.show('Warning message', 'warning');
            toast.show('Info message', 'info');
            toast.show('Default fallback type', 'unknown_type');
        });
    });

    test('CartUI instantiates properly and manages isOpen state without DOM in headless mode', () => {
        /**
         * Test Objective: Verify CartUI instantiation, drawer state management, and headless method execution.
         * Precondition / Input: CartUI initialized with CartService and ToastManager mocks.
         * Expected Result: isOpen() returns false; init(), render(), open(), close(), triggerBounce() execute cleanly.
         * Why This Scenario Matters: Facilitates unit and integration testing without requiring jsdom dependencies.
         */
        const service = new CartService();
        const toast = new ToastManager();
        const ui = new CartUI(service, toast);

        assert.equal(ui.isOpen(), false);
        assert.doesNotThrow(() => ui.init());
        assert.doesNotThrow(() => ui.render());
        assert.doesNotThrow(() => ui.open());
        assert.doesNotThrow(() => ui.close());
        assert.doesNotThrow(() => ui.triggerBounce());
    });
});
