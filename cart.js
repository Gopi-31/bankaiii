// cart.js - Shared Cart Controller and UI/UX Upgrades

// Core cart state
let cart = JSON.parse(localStorage.getItem('cart')) || [];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    injectCartDrawer();
    injectToastContainer();
    setupCartEventListeners();
    setupScrollReveal();
    updateCartUI();
});

// Automatically inject the Cart Drawer and Overlay into the body
function injectCartDrawer() {
    if (document.getElementById('cart-drawer')) return;

    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'cart-drawer-overlay';
    overlay.id = 'cart-drawer-overlay';
    document.body.appendChild(overlay);

    // Create drawer
    const drawer = document.createElement('div');
    drawer.className = 'cart-drawer';
    drawer.id = 'cart-drawer';
    
    drawer.innerHTML = `
        <div class="cart-drawer-header">
            <div class="cart-drawer-title">
                <span>🛒</span> Your Cart
            </div>
            <button class="cart-drawer-close" id="cart-drawer-close">&times;</button>
        </div>
        <div class="cart-drawer-items" id="cart-drawer-items"></div>
        <div class="cart-drawer-footer">
            <div class="cart-total-row">
                <span>Total:</span>
                <span class="cart-total-price">₹<span id="cart-drawer-total">0</span></span>
            </div>
            <button class="cart-checkout-btn" onclick="checkoutCart()">Proceed to Checkout</button>
            <button class="cart-clear-btn" onclick="clearCart()">Clear Cart</button>
        </div>
    `;
    
    document.body.appendChild(drawer);
}

// Automatically inject the Toast Notification Container
function injectToastContainer() {
    if (document.getElementById('toast-container')) return;
    const container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toast-container';
    document.body.appendChild(container);
}

// Create and trigger a floating Toast Notification
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">✓</span>
        <span class="toast-message">${message}</span>
    `;

    container.appendChild(toast);

    // Trigger transition
    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // Slide out and remove
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 350);
    }, 2800);
}

// Set up UI Event listeners for opening/closing the drawer
function setupCartEventListeners() {
    const cartIcon = document.querySelector('.cart-icon');
    const closeBtn = document.getElementById('cart-drawer-close');
    const overlay = document.getElementById('cart-drawer-overlay');

    if (cartIcon) {
        cartIcon.addEventListener('click', (e) => {
            e.preventDefault();
            openCartDrawer();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeCartDrawer();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            closeCartDrawer();
        });
    }
}

// Open and Close helper functions
function openCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.add('open');
        overlay.classList.add('open');
    }
}

function closeCartDrawer() {
    const drawer = document.getElementById('cart-drawer');
    const overlay = document.getElementById('cart-drawer-overlay');
    if (drawer && overlay) {
        drawer.classList.remove('open');
        overlay.classList.remove('open');
    }
}

// Add Item to Cart
function addToCart(productName, price, imageUrl) {
    // 1. Try to find the image dynamically in the DOM if not provided
    if (!imageUrl) {
        const productElements = document.querySelectorAll('.product');
        for (const element of productElements) {
            const h2 = element.querySelector('h2');
            if (h2 && h2.innerText.trim() === productName) {
                const img = element.querySelector('img');
                if (img) imageUrl = img.src;
                break;
            }
        }
    }
    
    // Fallback if no image is found
    if (!imageUrl) {
        imageUrl = 'https://via.placeholder.com/150?text=Anime+Store';
    }

    // 2. Check if item already exists in cart
    const existingItem = cart.find(item => item.name === productName);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            name: productName,
            price: Number(price),
            quantity: 1,
            image: imageUrl
        });
    }

    // 3. Save and trigger notifications/bounces
    saveCart();
    updateCartUI();
    triggerCartBounce();
    showToast(`Added "${productName}" to cart!`);
}

// Trigger bounce animation on the navbar cart icon
function triggerCartBounce() {
    const cartIcon = document.querySelector('.cart-icon');
    if (cartIcon) {
        cartIcon.classList.remove('animate');
        // Force reflow
        void cartIcon.offsetWidth;
        cartIcon.classList.add('animate');
    }
}

// Save Cart to LocalStorage
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

// Change Quantity (+ / -)
function changeQty(productName, delta) {
    const item = cart.find(item => item.name === productName);
    if (!item) return;

    item.quantity += delta;
    
    if (item.quantity <= 0) {
        cart = cart.filter(i => i.name !== productName);
    }

    saveCart();
    updateCartUI();
}

// Remove Single Item
function removeFromCart(productName) {
    cart = cart.filter(item => item.name !== productName);
    saveCart();
    updateCartUI();
}

// Clear Entire Cart
function clearCart() {
    if (confirm('Are you sure you want to clear your cart?')) {
        cart = [];
        saveCart();
        updateCartUI();
    }
}

// Checkout Function
function checkoutCart() {
    if (cart.length === 0) {
        alert('Your cart is empty. Add some products before checking out!');
        return;
    }
    
    alert('🎉 Thank you for your purchase! Your order has been placed successfully.');
    cart = [];
    saveCart();
    updateCartUI();
    closeCartDrawer();
}

// Update both the Navbar count and the Cart Drawer items list
function updateCartUI() {
    // 1. Calculate count and total
    let totalItems = 0;
    let totalPrice = 0;
    
    cart.forEach(item => {
        totalItems += item.quantity;
        totalPrice += (item.price * item.quantity);
    });

    // 2. Update navbar count badge
    const navbarCount = document.getElementById('cart-count');
    if (navbarCount) {
        navbarCount.innerText = totalItems;
    }

    // 3. Render items in drawer
    const drawerItemsContainer = document.getElementById('cart-drawer-items');
    if (drawerItemsContainer) {
        drawerItemsContainer.innerHTML = '';
        
        if (cart.length === 0) {
            drawerItemsContainer.innerHTML = `<div class="cart-empty-msg">Your cart is empty.</div>`;
        } else {
            cart.forEach(item => {
                const itemEl = document.createElement('div');
                itemEl.className = 'cart-item';
                itemEl.innerHTML = `
                    <img src="${item.image}" alt="${item.name}" class="cart-item-img">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        <div class="cart-item-price">₹${item.price}</div>
                        <div class="cart-item-qty-container">
                            <button class="cart-qty-btn" onclick="changeQty('${item.name.replace(/'/g, "\\'")}', -1)">-</button>
                            <span class="cart-item-qty">${item.quantity}</span>
                            <button class="cart-qty-btn" onclick="changeQty('${item.name.replace(/'/g, "\\'")}', 1)">+</button>
                        </div>
                    </div>
                    <button class="cart-item-remove" onclick="removeFromCart('${item.name.replace(/'/g, "\\'")}')" title="Remove Item">🗑️</button>
                `;
                drawerItemsContainer.appendChild(itemEl);
            });
        }
    }

    // 4. Update total price in drawer
    const drawerTotal = document.getElementById('cart-drawer-total');
    if (drawerTotal) {
        drawerTotal.innerText = totalPrice;
    }
}

// VIEWPORT SCROLL REVEAL (Intersection Observer)
function setupScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');
    if (reveals.length === 0) return;

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.08
    };

    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                obs.unobserve(entry.target); // Reveal once
            }
        });
    }, observerOptions);

    reveals.forEach(el => observer.observe(el));
}
