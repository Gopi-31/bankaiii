# 📡 ANiii STORE - API & Integration Documentation

## 1. Architectural Overview

**ANiii STORE** currently operates as a high-performance, client-side multipage e-commerce application. All cart state management, product filtering, data validation, and UI micro-interactions execute client-side using vanilla ECMAScript 2026 standards, persisting to browser storage via `SafeStorage` (a fault-tolerant `localStorage` adapter).

> [!NOTE]
> **Active Backend Status**: The repository currently operates without an internal backend API server. Product catalog data is rendered statically, and cart mutations are handled purely client-side. The sections below outline existing third-party external integrations and provide the complete REST API specification planned for the v2.0 backend service.

---

## 2. Existing External API & Resource Integrations

Although the application has no custom backend server, it integrates with several external CDN and service APIs:

### 2.1 Google Fonts Web API
* **Endpoint**: `https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap`
* **Method**: `GET`
* **Purpose**: Dynamic delivery of the modern 'Outfit' geometric sans-serif font family.
* **Headers**: Standard browser stylesheet request (`Accept: text/css`).
* **Caching**: Leverages Google's edge cache (HTTP `Cache-Control: public, max-age=86400`).
* **Fallback**: System fallback typography stack (`system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).

### 2.2 External Image CDNs
* **Asset Endpoints**:
  * `https://images.unsplash.com` (High-definition photography)
  * `https://m.media-amazon.com` (Product catalog imagery)
  * `https://4kwallpapers.com` & `https://wallpapercave.com` (Hero wallpapers)
* **Error Resilience**: In the event of a 404, CORS blockage, or offline network state, the application's `setupImageFallbacks` listener catches the image error and replaces the broken graphic with an inline SVG data-URI placeholder matching the store's dark theme palette.

---

## 3. Specification for Future Backend REST API (v2.0)

When migrating from client-only persistence to a dedicated microservice or serverless backend (Node.js/Express, Fastify, or Go), the endpoints below represent the contract:

### 3.1 Get All Products
* **Endpoint**: `/api/v1/products`
* **Method**: `GET`
* **Purpose**: Retrieve paginated list of catalog products with optional category and search filtering.
* **Query Parameters**:
  * `category` *(optional, string)*: Filter by category slug (e.g., `figures`, `keychains`, `clothing`).
  * `search` *(optional, string)*: Search keyword matching title or description.
  * `page` *(optional, integer, default: 1)*: Page number.
  * `limit` *(optional, integer, default: 20, max: 100)*: Items per page.
* **Headers**:
  ```http
  Accept: application/json
  ```
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "prod_zoro_statue",
        "name": "Zoro Statue",
        "category": "figures",
        "price": 499.00,
        "currency": "INR",
        "description": "Authentic Roronoa Zoro dynamic posture figure",
        "imageUrl": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4ZV1xapPFKFIffE3lv1wTXDAtrjGImBnmDQ&s",
        "stock": 18,
        "isAvailable": true
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalItems": 16,
      "hasNextPage": false
    }
  }
  ```
* **Error Responses**:
  * `400 Bad Request`: Invalid query parameters.
  * `500 Internal Server Error`: Server exception.

---

### 3.2 Get Single Product by ID
* **Endpoint**: `/api/v1/products/:id`
* **Method**: `GET`
* **Route Parameter**: `id` *(string, required)* - Unique product identifier.
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "prod_luffy_keychain",
      "name": "Luffy Keychain",
      "category": "keychains",
      "price": 49.00,
      "currency": "INR",
      "description": "Luffy keychain (metal), non-rusting metal ring",
      "imageUrl": "https://singhchand.com/cdn/shop/files/keyring7_8dd1b79d-6af5-435e-951b-fdbcf4139e75_1800x1800.jpg",
      "stock": 54,
      "isAvailable": true
    }
  }
  ```
* **Error Responses**:
  * `404 Not Found`:
    ```json
    {
      "success": false,
      "error": {
        "code": "PRODUCT_NOT_FOUND",
        "message": "Product with ID 'prod_unknown' was not found"
      }
    }
    ```

---

### 3.3 Validate Cart Items & Check Stock
* **Endpoint**: `/api/v1/cart/validate`
* **Method**: `POST`
* **Purpose**: Verify prices and real-time inventory before final checkout.
* **Headers**:
  ```http
  Content-Type: application/json
  Accept: application/json
  ```
* **Request Body**:
  ```json
  {
    "items": [
      { "productId": "prod_zoro_statue", "quantity": 2 },
      { "productId": "prod_luffy_keychain", "quantity": 1 }
    ]
  }
  ```
* **Validation Rules**:
  * `items`: Array with at least 1 item and maximum 50 items.
  * `productId`: Non-empty string.
  * `quantity`: Positive integer between 1 and 99.
* **Success Response (`200 OK`)**:
  ```json
  {
    "success": true,
    "isValid": true,
    "summary": {
      "totalItems": 3,
      "subtotal": 1047.00,
      "shipping": 0.00,
      "total": 1047.00,
      "currency": "INR"
    }
  }
  ```
* **Error Response (`422 Unprocessable Entity - Out of Stock`)**:
  ```json
  {
    "success": false,
    "error": {
      "code": "INSUFFICIENT_STOCK",
      "message": "Requested quantity exceeds available stock",
      "details": [
        {
          "productId": "prod_zoro_statue",
          "requested": 2,
          "available": 1
        }
      ]
    }
  }
  ```

---

### 3.4 Checkout Order
* **Endpoint**: `/api/v1/orders/checkout`
* **Method**: `POST`
* **Purpose**: Process customer order, calculate tax/shipping, and initialize payment.
* **Headers**:
  ```http
  Content-Type: application/json
  Authorization: Bearer <guest_token_or_jwt>
  ```
* **Request Body**:
  ```json
  {
    "customer": {
      "fullName": "Goku Son",
      "email": "collector@anibuy.store",
      "phone": "+919876543210"
    },
    "shippingAddress": {
      "street": "42 Capsule Corp Ave",
      "city": "Bengaluru",
      "state": "Karnataka",
      "postalCode": "560001",
      "country": "IN"
    },
    "items": [
      {
        "name": "Zoro Statue",
        "price": 499.00,
        "quantity": 1,
        "image": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR4ZV1xapPFKFIffE3lv1wTXDAtrjGImBnmDQ&s"
      }
    ],
    "paymentMethod": "UPI"
  }
  ```
* **Success Response (`201 Created`)**:
  ```json
  {
    "success": true,
    "data": {
      "orderId": "ORD-20261015-8491",
      "status": "confirmed",
      "totalAmount": 499.00,
      "currency": "INR",
      "estimatedDelivery": "2026-10-20T18:00:00Z",
      "createdAt": "2026-10-15T11:25:00Z"
    }
  }
  ```
* **Error Responses**:
  * `400 Bad Request`: Missing customer contact details or invalid phone/email.
  * `409 Conflict`: Price mismatch between client state and server database.
  * `500 Internal Server Error`: Payment gateway failure.
