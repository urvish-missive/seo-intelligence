// backend/tests/unit/website.validation.test.js
import { describe, it, expect } from '@jest/globals';
import { normalizeDomain, createWebsiteSchema } from '../../src/modules/websites/website.validation.js';

describe('Website Domain Normalization Unit Tests', () => {
  it('should strip https:// protocol', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com');
  });

  it('should strip http:// protocol and www. prefix', () => {
    expect(normalizeDomain('http://www.example.com')).toBe('example.com');
  });

  it('should strip trailing paths, queries, and hashes', () => {
    expect(normalizeDomain('https://www.example.com/blog/article?utm=test#header')).toBe('example.com');
  });

  it('should preserve subdomains', () => {
    expect(normalizeDomain('https://app.sub.example.com/')).toBe('app.sub.example.com');
  });

  it('should convert domains to lowercase', () => {
    expect(normalizeDomain('HTTP://WWW.MISSIVEDIGITAL.COM')).toBe('missivedigital.com');
  });

  it('should validate valid domains using createWebsiteSchema', () => {
    const result = createWebsiteSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Client Store',
      domain: 'https://www.store.acme.co.uk/checkout',
    });

    expect(result.success).toBe(true);
    expect(result.data.domain).toBe('store.acme.co.uk');
  });

  it('should reject invalid domains', () => {
    const result = createWebsiteSchema.safeParse({
      clientId: '550e8400-e29b-41d4-a716-446655440000',
      name: 'Invalid Domain',
      domain: 'invalid_domain_without_tld',
    });

    expect(result.success).toBe(false);
  });
});
