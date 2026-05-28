'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  sendOtpSchema,
  verifyOtpSchema,
  type SendOtpInput,
  type VerifyOtpInput,
} from '@/lib/validation/auth';

type Stage = 'email' | 'code';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get('next');
  const errorParam = searchParams.get('error');

  const [stage, setStage] = useState<Stage>('email');
  const [email, setEmail] = useState<string>('');
  const [serverError, setServerError] = useState<string | null>(
    errorParam === 'invalid_link'
      ? 'That sign-in link is malformed. Try again with the 6-digit code.'
      : errorParam === 'invalid_or_expired_link'
        ? 'That sign-in link has expired. Try again.'
        : null,
  );

  // ---- Stage 1: email ----
  const emailForm = useForm<SendOtpInput>({
    resolver: zodResolver(sendOtpSchema),
    defaultValues: { email: '' },
  });

  const onSendOtp = emailForm.handleSubmit(async (values) => {
    setServerError(null);
    const res = await fetch('/api/auth/send-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setServerError(
        res.status === 429
          ? 'Too many attempts. Try again in a bit.'
          : 'Something went wrong. Try again.',
      );
      return;
    }
    setEmail(values.email);
    setStage('code');
  });

  // ---- Stage 2: code ----
  const codeForm = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { email: '', token: '' },
  });

  const onVerifyOtp = codeForm.handleSubmit(async (values) => {
    setServerError(null);
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...values, email }),
    });
    if (!res.ok) {
      setServerError(
        res.status === 429
          ? 'Too many attempts. Try again in a bit.'
          : 'Invalid or expired code. Check your email and try again.',
      );
      return;
    }
    const safeNext =
      nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
    router.replace(safeNext);
    router.refresh();
  });

  if (stage === 'email') {
    return (
      <form onSubmit={onSendOtp} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-2">
          <span className="text-xs tracking-wider text-zinc-400 uppercase">Email</span>
          <input
            type="email"
            autoComplete="email"
            autoFocus
            inputMode="email"
            className="rounded border border-zinc-700 bg-transparent px-3 py-2 text-base outline-none focus:border-zinc-400"
            {...emailForm.register('email')}
          />
        </label>
        {emailForm.formState.errors.email ? (
          <p className="text-xs text-red-400">Enter a valid email address.</p>
        ) : null}
        {serverError ? <p className="text-xs text-red-400">{serverError}</p> : null}
        <button
          type="submit"
          disabled={emailForm.formState.isSubmitting}
          className="mt-2 rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
        >
          {emailForm.formState.isSubmitting ? 'Sending…' : 'Send code'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onVerifyOtp} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-zinc-400">
        We sent an 8-digit code to <span className="text-zinc-100">{email}</span>. Check your inbox.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-xs tracking-wider text-zinc-400 uppercase">Code</span>
        <input
          type="text"
          autoComplete="one-time-code"
          autoFocus
          inputMode="numeric"
          pattern="\d{8}"
          maxLength={8}
          minLength={8}
          placeholder="••••••••"
          aria-label="8-digit one-time code"
          className="rounded border border-zinc-700 bg-transparent px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] outline-none placeholder:text-zinc-700 focus:border-zinc-400"
          {...codeForm.register('token')}
        />
      </label>
      {codeForm.formState.errors.token ? (
        <p className="text-xs text-red-400">Enter the 8-digit code from your email.</p>
      ) : null}
      {serverError ? <p className="text-xs text-red-400">{serverError}</p> : null}
      <button
        type="submit"
        disabled={codeForm.formState.isSubmitting}
        className="mt-2 rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-50"
      >
        {codeForm.formState.isSubmitting ? 'Verifying…' : 'Sign in'}
      </button>
      <button
        type="button"
        onClick={() => {
          setServerError(null);
          setStage('email');
        }}
        className="text-xs text-zinc-500 underline-offset-4 hover:underline"
      >
        Use a different email
      </button>
    </form>
  );
}
