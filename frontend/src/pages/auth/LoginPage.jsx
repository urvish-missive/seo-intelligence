// frontend/src/pages/auth/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, Link } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useLoginMutation } from '../../features/auth/authApi.js';
import { selectIsAuthenticated } from '../../features/auth/authSlice.js';
import { BarChart2, Eye, EyeOff, AlertCircle } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const navigate = useNavigate();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [login, { isLoading, error: apiError }] = useLoginMutation();
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data) => {
    try {
      await login(data).unwrap();
      navigate('/');
    } catch (err) {
      // Handled via apiError
    }
  };

  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Platform Title */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-600 rounded-xl mb-3 shadow-sm">
            <BarChart2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-surface-900 tracking-tight">Missive Digital</h1>
          <p className="text-sm text-surface-500 mt-1">SEO Intelligence Platform</p>
        </div>

        {/* Login Card */}
        <div className="card shadow-dropdown">
          <div className="card-header border-b border-surface-100">
            <h2 className="text-base font-semibold text-surface-900">Sign in to your agency workspace</h2>
          </div>
          <div className="card-body">
            {apiError && (
              <div className="mb-4 rounded-lg bg-danger-50 border border-danger-200 p-3.5 flex items-start gap-2.5 text-danger-700 text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{apiError.data?.message || 'Invalid email or password'}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label">Email address</label>
                <input
                  type="email"
                  className={`input ${errors.email ? 'input-error' : ''}`}
                  placeholder="admin@missivedigital.com"
                  autoComplete="email"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="field-error">{errors.email.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Password</label>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`input pr-10 ${errors.password ? 'input-error' : ''}`}
                    placeholder="••••••••"
                    autoComplete="current-password"
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
                {errors.password && (
                  <p className="field-error">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="btn-primary w-full justify-center mt-2"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Signing in…</span>
                  </div>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-xs text-surface-400">
          <span>Need initial workspace setup? </span>
          <Link to="/register" className="font-medium text-brand-600 hover:text-brand-700">
            Create Super Admin Account
          </Link>
        </div>
      </div>
    </div>
  );
}
