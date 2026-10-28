/**
 * Unit Tests: Security, HTML Sanitization, Image Protocol Verification & Data Formatting
 * Framework: Node.js Built-in Test Runner (node:test & node:assert/strict)
 *
 * Tests protection against XSS attack vectors, malformed payloads, URI pseudoprotocols,
 * and monetary currency formatting edge cases.
 *
 * Each test suite documents:
 * - Test Objective: What behavior or specification is being validated.
 * - Precondition / Input: Exact input fixtures, initial states, and boundaries.
 * - Expected Result: Concrete assertion criteria and state changes.
 * - Why This Scenario Matters: Real-world e-commerce impact and failure prevention.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, sanitizeImageUrl, formatCurrency, CONFIG } = require('../cart.js');

describe('Security - escapeHtml Function', () => {
    test('escapes HTML tags and script elements', () => {
        /**
         * Test Objective: Confirm standard script elements are transformed to harmless entity text.
         * Precondition / Input: '<script>alert("XSS")</script>'.
         * Expected Result: Returns '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'.
         * Why This Scenario Matters: Prevents arbitrary JavaScript execution when product names are rendered in the DOM.
         */
        const payload = '<script>alert("XSS")</script>';
        const sanitized = escapeHtml(payload);

        assert.equal(sanitized, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
        assert.ok(!sanitized.includes('<script>'));
    });

    test('escapes quotes, ampersands, and single apostrophes', () => {
        /**
         * Test Objective: Verify entity encoding of special delimiter characters.
         * Precondition / Input: 'Zoro\'s "Special" & Rare Edition'.
         * Expected Result: 'Zoro&#039;s &quot;Special&quot; &amp; Rare Edition'.
         * Why This Scenario Matters: Prevents attribute breakout attacks when values are interpolated into HTML attribute quotes.
         */
        const input = 'Zoro\'s "Special" & Rare Edition';
        const sanitized = escapeHtml(input);

        assert.equal(sanitized, 'Zoro&#039;s &quot;Special&quot; &amp; Rare Edition');
    });

    test('escapes inline event handler attack vectors and img tags', () => {
        /**
         * Test Objective: Defeat onerror/onload attribute injection payloads.
         * Precondition / Input: '<img src="x" onerror="stealCookies()">'.
         * Expected Result: Returns string without raw '<img' tags.
         * Why This Scenario Matters: Attackers commonly use broken image tags with onerror handlers to steal session data.
         */
        const payload = '<img src="x" onerror="stealCookies()">';
        const sanitized = escapeHtml(payload);

        assert.equal(sanitized, '&lt;img src=&quot;x&quot; onerror=&quot;stealCookies()&quot;&gt;');
        assert.ok(!sanitized.includes('<img'));
    });

    test('escapes SVG onload payloads and nested tag attack vectors', () => {
        /**
         * Test Objective: Confirm SVG-based XSS vectors and nested markup are fully neutralized.
         * Precondition / Input: '<svg/onload=alert(1)>' and '"><iframe src="x">'.
         * Expected Result: Both strings have all angle brackets and quotes escaped.
         * Why This Scenario Matters: Modern XSS vectors often bypass simple regexes by abusing SVG XML namespaces.
         */
        const svgPayload = '<svg/onload=alert(1)>';
        assert.equal(escapeHtml(svgPayload), '&lt;svg/onload=alert(1)&gt;');

        const iframePayload = '"><iframe src="x">';
        assert.equal(escapeHtml(iframePayload), '&quot;&gt;&lt;iframe src=&quot;x&quot;&gt;');
    });

    test('safely handles non-string, null, undefined, and numeric values', () => {
        /**
         * Test Objective: Ensure utility functions never crash when passed non-string or falsy primitives.
         * Precondition / Input: '', null, undefined, 42, 0, false.
         * Expected Result: Strings converted cleanly; null/undefined return empty string.
         * Why This Scenario Matters: Prevents uncaught TypeErrors in dynamic template rendering.
         */
        assert.equal(escapeHtml(''), '');
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
        assert.equal(escapeHtml(42), '42');
        assert.equal(escapeHtml(0), '0');
        assert.equal(escapeHtml(false), 'false');
    });
});

describe('Security - sanitizeImageUrl Function', () => {
    test('blocks javascript: pseudoprotocol URLs and falls back to theme SVG placeholder', () => {
        /**
         * Test Objective: Reject javascript: execution attempts in image src attributes.
         * Precondition / Input: 'javascript:alert(document.cookie)'.
         * Expected Result: Returns CONFIG.DEFAULT_FALLBACK_IMAGE.
         * Why This Scenario Matters: Prevents arbitrary script execution via URL scheme triggers.
         */
        const unsafeUrl = 'javascript:alert(document.cookie)';
        const safeUrl = sanitizeImageUrl(unsafeUrl);

        assert.equal(safeUrl, CONFIG.DEFAULT_FALLBACK_IMAGE);
    });

    test('blocks vbscript: and data:text/html protocol injection', () => {
        /**
         * Test Objective: Reject alternative active script protocol schemes.
         * Precondition / Input: 'vbscript:msgbox(1)' and 'data:text/html;base64,PHNjcmlwdD4='.
         * Expected Result: Returns CONFIG.DEFAULT_FALLBACK_IMAGE.
         * Why This Scenario Matters: Ensures comprehensive protocol defense beyond just javascript:.
         */
        assert.equal(sanitizeImageUrl('vbscript:msgbox(1)'), CONFIG.DEFAULT_FALLBACK_IMAGE);
        assert.equal(sanitizeImageUrl('data:text/html;base64,PHNjcmlwdD4='), CONFIG.DEFAULT_FALLBACK_IMAGE);
    });

    test('accepts valid HTTPS, HTTP, and theme SVG data URLs', () => {
        /**
         * Test Objective: Confirm legitimate remote image URLs are accepted without alteration.
         * Precondition / Input: 'https://example.com/zoro.jpg' and 'http://cdn.store.com/luffy.png'.
         * Expected Result: Returns exact trimmed input string.
         * Why This Scenario Matters: Allows real merchandise images to display correctly.
         */
        const httpsUrl = 'https://example.com/zoro.jpg';
        assert.equal(sanitizeImageUrl(httpsUrl), httpsUrl);

        const httpUrl = 'http://cdn.store.com/luffy.png';
        assert.equal(sanitizeImageUrl(httpUrl), httpUrl);
    });

    test('handles empty, null, and non-string image arguments safely', () => {
        /**
         * Test Objective: Ensure non-string or blank image values default safely to SVG placeholder.
         * Precondition / Input: '', '   ', null, undefined, 12345.
         * Expected Result: All return CONFIG.DEFAULT_FALLBACK_IMAGE.
         * Why This Scenario Matters: Ensures no image tag is ever rendered with an empty or undefined src.
         */
        assert.equal(sanitizeImageUrl(''), CONFIG.DEFAULT_FALLBACK_IMAGE);
        assert.equal(sanitizeImageUrl('   '), CONFIG.DEFAULT_FALLBACK_IMAGE);
        assert.equal(sanitizeImageUrl(null), CONFIG.DEFAULT_FALLBACK_IMAGE);
        assert.equal(sanitizeImageUrl(undefined), CONFIG.DEFAULT_FALLBACK_IMAGE);
        assert.equal(sanitizeImageUrl(12345), CONFIG.DEFAULT_FALLBACK_IMAGE);
    });
});

describe('Formatting - formatCurrency Function', () => {
    test('formats standard integer numbers with Indian numbering grouping (Lakhs / Crores)', () => {
        /**
         * Test Objective: Verify comma grouping matches Indian currency conventions.
         * Precondition / Input: 499, 1499, 100000 (1 Lakh).
         * Expected Result: '499', '1,499', '1,00,000'.
         * Why This Scenario Matters: Appropriate cultural localization for Indian Rupee (₹) pricing.
         */
        assert.equal(formatCurrency(499), '499');
        assert.equal(formatCurrency(1499), '1,499');
        assert.equal(formatCurrency(100000), '1,00,000');
    });

    test('formats float amounts safely without IEEE-754 precision artifacts', () => {
        /**
         * Test Objective: Ensure floating point sums like 0.1 + 0.2 format as '0.3' instead of '0.30000000000000004'.
         * Precondition / Input: 199.99 and 0.1 + 0.2.
         * Expected Result: '199.99' and '0.3'.
         * Why This Scenario Matters: Prevents unsightly micro-cent artifacts on totals.
         */
        assert.equal(formatCurrency(199.99), '199.99');
        assert.equal(formatCurrency(0.1 + 0.2), '0.3');
    });

    test('handles zero, negative, and invalid string inputs gracefully', () => {
        /**
         * Test Objective: Confirm non-numeric, negative, or invalid values safely default to '0'.
         * Precondition / Input: 0, -100, 'abc', null, NaN, Infinity.
         * Expected Result: All return '0'.
         * Why This Scenario Matters: Prevents NaN or negative total display on UI badges and drawers.
         */
        assert.equal(formatCurrency(0), '0');
        assert.equal(formatCurrency(-100), '0');
        assert.equal(formatCurrency('abc'), '0');
        assert.equal(formatCurrency(null), '0');
        assert.equal(formatCurrency(NaN), '0');
        assert.equal(formatCurrency(Infinity), '0');
        assert.equal(formatCurrency(-Infinity), '0');
    });
});
