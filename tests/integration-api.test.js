/**
 * Unit Tests: Global API & Backward Compatibility Wrappers
 * Tests global functions and integration points that interface with HTML onclick handlers.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    CartService,
    ToastManager,
    CartUI,
    addToCart,
    changeQty,
    removeFromCart,
    clearCart,
    checkoutCart
} = require('../cart.js');

describe('Backward Compatibility Global API', () => {
    test('exports all expected global helper functions', () => {
        assert.equal(typeof addToCart, 'function');
        assert.equal(typeof changeQty, 'function');
        assert.equal(typeof removeFromCart, 'function');
        assert.equal(typeof clearCart, 'function');
        assert.equal(typeof checkoutCart, 'function');
    });

    test('ToastManager handles multiple notification levels safely', () => {
        const toast = new ToastManager();
        // In Node environment, container creation returns null gracefully without throwing
        assert.doesNotThrow(() => {
            toast.show('Success message', 'success');
            toast.show('Error message', 'error');
            toast.show('Warning message', 'warning');
            toast.show('Info message', 'info');
        });
    });

    test('CartUI instantiates properly without DOM exceptions in headless mode', () => {
        const service = new CartService();
        const toast = new ToastManager();
        const ui = new CartUI(service, toast);

        assert.equal(ui.isOpen(), false);
        // Headless init should exit cleanly
        assert.doesNotThrow(() => ui.init());
        assert.doesNotThrow(() => ui.render());
    });
});
