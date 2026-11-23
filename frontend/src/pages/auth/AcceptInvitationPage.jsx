// frontend/src/pages/auth/AcceptInvitationPage.jsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAcceptInvitationMutation } from '../../features/members/membersApi.js';
import { BarChart2, AlertCircle, CheckCircle } from 'lucide-react';

const acceptSchema = z
  .object({
    name: z.string().trim().min(2, 'Name is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must include an uppercase letter')
      .regex(/[a-z]/, 'Must include a lowercase letter')
      .regex(/[0-9]/, 'Must include a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export default function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [acceptInvitation, { isLoading, error: apiError }] = useAcceptInvitationMutation();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(acceptSchema),
  });

  const onSubmit = async (data) => {
    if (!token) return;
    try {
      await acceptInvitation({ token, ...data }).unwrap();
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch {}
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="card max-w-md p-6 text-center">
          <AlertCircle className="w-10 h-10 text-danger-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-surface-900">Missing Invitation Token</h2>
          <p className="text-sm text-surface-500 mt-2 mb-4">
            The link you followed does not contain a valid invitation token.
          </p>
          <Link to="/login" className="btn-primary">
            Return to Login
          </Link>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
        <div className="card max-w-md p-6 text-center">
          <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-surface-900">Invitation Accepted!</h2>
          <p className="text-sm text-surface-500 mt-2">
            Your account has been configured. Redirecting to login…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-xl mb-3 shadow-sm">
            <BarChart2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Missive Digital</h1>
          <p className="text-sm text-surface-500 mt-1">Join Agency Workspace</p>
        </div>

        <div className="card shadow-dropdown">
          <div className="card-header border-b border-surface-100">
            <h2 className="text-base font-semibold text-surface-900">Create your account</h2>
          </div>
          <div className="card-body">
            {apiError && (
              <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 p-3.5 flex items-start gap-2.5 text-danger-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{apiError.data?.message || 'Failed to accept invitation'}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className={`input ${errors.name ? 'input-error' : ''}`}
                  placeholder="e.g. Jordan Smith"
                  {...register('name')}
                />
                {errors.name && <p className="field-error">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label">Create Password</label>
                <input
                  type="password"
                  className={`input ${errors.password ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...register('password')}
                />
                {errors.password && <p className="field-error">{errors.password.message}</p>}
              </div>

              <div>
                <label className="label">Confirm Password</label>
                <input
                  type="password"
                  className={`input ${errors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...register('confirmPassword')}
                />
                {errors.confirmPassword && (
                  <p className="field-error">{errors.confirmPassword.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full justify-center mt-2"
              >
                {isLoading ? 'Activating account…' : 'Accept Invitation & Join'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
