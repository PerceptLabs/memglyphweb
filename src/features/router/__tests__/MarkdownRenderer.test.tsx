/**
 * XSS Prevention Tests for MarkdownRenderer
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { MarkdownRenderer } from '../MarkdownRenderer';

describe('MarkdownRenderer XSS Prevention', () => {
  it('should escape script tags in input', () => {
    const maliciousContent = '<script>alert("XSS")</script>';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    // Script tags should be escaped, not executed
    expect(container.querySelector('script')).toBeNull();
    // The content should be displayed as text (HTML escaped)
    expect(container.innerHTML).toContain('&lt;script&gt;');
  });

  it('should sanitize inline event handlers', () => {
    const maliciousContent = '<img src="x" onerror="alert(\'XSS\')" />';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    // Event handlers should be stripped
    const img = container.querySelector('img');
    expect(img).toBeNull(); // img not in allowed tags
  });

  it('should sanitize javascript: protocol in links', () => {
    const maliciousContent = '[Click me](javascript:alert("XSS"))';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    const link = container.querySelector('a');
    // Link should exist (markdown creates it)
    expect(link).not.toBeNull();

    if (link) {
      const href = link.getAttribute('href') || '';
      // DOMPurify should remove javascript: protocol
      expect(href.toLowerCase()).not.toContain('javascript:');
    }
  });

  it('should sanitize iframe tags', () => {
    const maliciousContent = '<iframe src="http://evil.com"></iframe>';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    // Iframe should be removed
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('should sanitize data attributes', () => {
    const maliciousContent = '<p data-evil="payload">Text</p>';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    const p = container.querySelector('p');
    if (p) {
      // data attributes should be stripped
      expect(p.hasAttribute('data-evil')).toBe(false);
    }
  });

  it('should allow safe markdown elements', () => {
    const safeContent = '# Heading\n\n**Bold** and *italic* text\n\n[Link](https://example.com)';
    const { container } = render(<MarkdownRenderer content={safeContent} />);

    // Safe elements should render
    expect(container.querySelector('h1')).not.toBeNull();
    expect(container.querySelector('strong')).not.toBeNull();
    expect(container.querySelector('em')).not.toBeNull();
    expect(container.querySelector('a')).not.toBeNull();
  });

  it('should sanitize style tags', () => {
    const maliciousContent = '<style>body { display: none; }</style>';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    // Style tags should be removed
    expect(container.querySelector('style')).toBeNull();
  });

  it('should sanitize object and embed tags', () => {
    const maliciousContent = '<object data="http://evil.com"></object><embed src="http://evil.com">';
    const { container } = render(<MarkdownRenderer content={maliciousContent} />);

    // Object and embed should be removed
    expect(container.querySelector('object')).toBeNull();
    expect(container.querySelector('embed')).toBeNull();
  });
});
