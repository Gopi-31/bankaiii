/**
 * Unit Tests: Security, HTML Sanitization, and Data Formatting
 * Tests protection against XSS attack vectors, malformed payloads, and currency formatting.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, formatCurrency } = require('../cart.js');

describe('Security - escapeHtml Function', () => {
    test('escapes HTML tags and script elements', () => {
        const payload = '<script>alert("XSS")</script>';
        const sanitized = escapeHtml(payload);

        assert.equal(sanitized, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
        assert.ok(!sanitized.includes('<script>'));
    });

    test('escapes quotes and ampersands', () => {
        const input = 'Zoro\'s "Special" & Rare Edition';
        const sanitized = escapeHtml(input);

        assert.equal(sanitized, 'Zoro&#039;s &quot;Special&quot; &amp; Rare Edition');
    });

    test('escapes inline event handler attack vectors', () => {
        const payload = '<img src="x" onerror="stealCookies()">';
        const sanitized = escapeHtml(payload);

        assert.equal(sanitized, '&lt;img src=&quot;x&quot; onerror=&quot;stealCookies()&quot;&gt;');
        assert.ok(!sanitized.includes('<img'));
    });

    test('safely handles non-string and empty values', () => {
        assert.equal(escapeHtml(''), '');
        assert.equal(escapeHtml(null), '');
        assert.equal(escapeHtml(undefined), '');
        assert.equal(escapeHtml(42), '42');
        assert.equal(escapeHtml(0), '0');
    });
});

describe('Formatting - formatCurrency', () => {
    test('formats standard integer numbers with Indian numbering grouping', () => {
        assert.equal(formatCurrency(499), '499');
        assert.equal(formatCurrency(1499), '1,499');
        assert.equal(formatCurrency(100000), '1,00,000');
    });

    test('formats float amounts safely without IEEE-754 precision artifacts', () => {
        assert.equal(formatCurrency(199.99), '199.99');
        assert.equal(formatCurrency(0.1 + 0.2), '0.3');
    });

    test('handles zero, negative, and invalid string inputs gracefully', () => {
        assert.equal(formatCurrency(0), '0');
        assert.equal(formatCurrency('abc'), '0');
        assert.equal(formatCurrency(null), '0');
    });
});
