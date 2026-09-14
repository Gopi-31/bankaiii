# 🐳 ANiii STORE - Premium Anime Merchandise

Welcome to **ANiii STORE**, a high-end, responsive, and visually stunning e-commerce store dedicated to premium anime figures, keychains, apparel, and accessories. 

Built using **pure HTML, CSS, and vanilla JavaScript**, this project demonstrates how to construct a professional multipage e-commerce application with a unified state controller and state-of-the-art interactive micro-interactions without relying on heavy frontend frameworks.

---

## 🌟 Key Features

*   **Multipage Architecture:** Separate, well-structured pages for the **Home Page** (`web2.html`) and the **Products Page** (`product.html`) linked seamlessly.
*   **Centered Glassmorphic Header:** A sticky navbar spanning 100% viewport width with blur filters (`backdrop-filter: blur(15px)`) and a centered contents wrapper to prevent stretching on ultra-wide screens.
*   **Underline Menu Highlight:** Dynamic underline indicators that slide in and active page markers.
*   **Viewport Scroll reveals:** A custom scroll observer script tracking elements as you scroll down the page, triggering fade-ins and slide-ups for features, product grids, and footers.
*   **Animated Toast Alerts:** Sleek, modern toast popups that slide in from the bottom-right corner when items are added to the cart, replacing default system alert boxes.
*   **Navbar Icon Bounce:** Micro-interaction feedback triggering a visual bounce effect on the cart icon badge when additions occur.
*   **Persisted Cross-Page Cart State:** Synced utilizing local storage (`localStorage`). Cart updates (quantities, removal, checkout actions) made on the Products Page sync instantly to the Home Page and vice-versa.
*   **Slide-Out Cart Drawer UI:** A premium side-panel drawer sliding in from the right when the cart icon is clicked, allowing users to increase, decrease, or remove quantities.
*   **Custom Scrollbars:** A stylized dark-themed scrollbar featuring a glowing transition on hover.
*   **Clean Static Art Cards:** Three rotated hero graphic cards placed in a static layout to add clean composition to the hero section.

---

## 📂 File Structure

All project files are situated inside the `index.Html` directory:

```text
index.Html/
├── web2.html        # Home Page (Hero header, features, footer)
├── product.html     # Products catalog Page (Interactive item grids, features, footer)
├── style.css        # Centralized styling sheet (Responsive styling, keyframes, transitions)
├── cart.js          # Shared cart manager (State storage, drawer UI render, scroll reveal)
└── README.md        # Documentation guide (This file)
```

---

## ⚙️ How to Run & Use

No complex developer environment setups or dependencies are required. 

1. Double-click **[web2.html](file:///Users/vasanthkumarsv/index.Html/web2.html)** to launch the Home Page in any modern web browser (Chrome, Safari, Firefox, or Edge).
2. Click **Products** in the navbar to navigate to **[product.html](file:///Users/vasanthkumarsv/index.Html/product.html)**.
3. Press **Add to Cart** on products to add items and watch the toast slide in and the navbar badge bounce.
4. Click the cart icon in the navbar to toggle open the Cart Drawer and test the interactive items list.
