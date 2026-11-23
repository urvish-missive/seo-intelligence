// backend/tests/integration/auth.service.test.js
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { hashPassword, hashToken } from '../../src/modules/auth/auth.utils.js';

describe('AuthService Integration & Security Tests', () => {
  let authService;

  beforeEach(() => {
    authService = new AuthService();
  });

  it('should instantiate AuthService correctly', () => {
    expect(authService).toBeDefined();
    expect(typeof authService.login).toBe('function');
    expect(typeof authService.register).toBe('function');
    expect(typeof authService.refreshAccessToken).toBe('function');
  });

  it('should enforce password strength in registration validation', async () => {
    const { registerSchema } = await import('../../src/modules/auth/auth.validation.js');

    // Missing uppercase
    const noUpper = registerSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: 'weakpassword123',
      confirmPassword: 'weakpassword123',
    });
    expect(noUpper.success).toBe(false);

    // Missing number
    const noNumber = registerSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: 'WeakPasswordWithoutNumber',
      confirmPassword: 'WeakPasswordWithoutNumber',
    });
    expect(noNumber.success).toBe(false);

    // Passwords mismatch
    const mismatch = registerSchema.safeParse({
      name: 'Test',
      email: 'test@example.com',
      password: 'ValidPassword123!',
      confirmPassword: 'DifferentPassword123!',
    });
    expect(mismatch.success).toBe(false);

    // Valid
    const valid = registerSchema.safeParse({
      name: 'Test User',
      email: 'test@example.com',
      password: 'StrongPassword123!',
      confirmPassword: 'StrongPassword123!',
    });
    expect(valid.success).toBe(true);
  });
});
