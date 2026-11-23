// backend/src/modules/members/member.validation.js
import { z } from 'zod';

export const inviteMemberSchema = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  roleId: z.string().uuid('Invalid role ID'),
});

export const updateMemberRoleSchema = z.object({
  roleId: z.string().uuid('Invalid role ID'),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});

export const acceptInvitationSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').optional(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(100)
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .optional(),
});
