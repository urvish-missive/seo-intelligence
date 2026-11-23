// frontend/src/pages/auth/RegisterPage.jsx
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useRegisterMutation } from '../../features/auth/authApi.js';
import { BarChart2, AlertCircle, Eye, EyeOff } from 'lucide-react';

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Full name is required'),
    email: z.string().trim().email('Please enter a valid email address'),
    workspaceName: z.string().trim().min(2, 'Workspace name is required').optional(),
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

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get('token') || undefined;

  const [registerUser, { isLoading, error: apiError }] = useRegisterMutation();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data) => {
    try {
      await registerUser({
        ...data,
        invitationToken,
      }).unwrap();
      navigate('/');
    } catch {}
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-xl mb-3 shadow-sm">
            <BarChart2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Missive Digital</h1>
          <p className="text-sm text-surface-500 mt-1">
            {invitationToken ? 'Accept Workspace Invitation' : 'Setup Super Admin & Workspace'}
          </p>
        </div>

        <div className="card shadow-dropdown">
          <div className="card-header border-b border-surface-100">
            <h2 className="text-base font-semibold text-surface-900">
              {invitationToken ? 'Complete Registration' : 'Initial Workspace Creation'}
            </h2>
          </div>
          <div className="card-body">
            {apiError && (
              <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 p-3.5 flex items-start gap-2.5 text-danger-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{apiError.data?.message || 'Registration failed'}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input
                  type="text"
                  className={`input ${errors.name ? 'input-error' : ''}`}
                  placeholder="e.g. Alex Morgan"
                  {...register('name')}
                />
                {errors.name && <p className="field-error">{errors.name.message}</p>}
              </div>

              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className={`input ${errors.email ? 'input-error' : ''}`}
                  placeholder="name@agency.com"
                  {...register('email')}
                />
                {errors.email && <p className="field-error">{errors.email.message}</p>}
              </div>

              {!invitationToken && (
                <div>
                  <label className="label">Agency Workspace Name</label>
                  <input
                    type="text"
                    className={`input ${errors.workspaceName ? 'input-error' : ''}`}
                    placeholder="Missive Digital"
                    defaultValue="Missive Digital"
                    {...register('workspaceName')}
                  />
                  {errors.workspaceName && (
                    <p className="field-error">{errors.workspaceName.message}</p>
                  )}
                </div>
              )}

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                    placeholder="••••••••"
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-surface-400 hover:text-surface-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="field-error">{errors.password.message}</p>}
              </div>

              <div>
                <label className="label">Confirm Password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
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
                {isLoading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-surface-400">
          <span>Already have an account? </span>
          <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
