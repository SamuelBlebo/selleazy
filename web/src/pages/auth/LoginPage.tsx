import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { signIn, signInWithGoogle, signInWithPhone } from '@/services';
import { loginSchema, phoneLoginSchema, type LoginInput, type PhoneLoginInput } from '@/utils/validation';
import { toMessage } from '@/utils/errors';
import { cn } from '@/utils/cn';

function EmailLoginForm({ onDone }: { onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email, values.password);
      onDone();
    } catch (error) {
      setFormError(toMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        placeholder="you@yourshop.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      {formError && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{formError}</p>
      )}

      <Button type="submit" fullWidth loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

function PhoneLoginForm({ onDone }: { onDone: () => void }) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PhoneLoginInput>({ resolver: zodResolver(phoneLoginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signInWithPhone(values.phone, values.password);
      onDone();
    } catch (error) {
      setFormError(toMessage(error));
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <Input
        label="Phone number"
        type="tel"
        autoComplete="tel"
        placeholder="+233 24 123 4567"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />

      {formError && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{formError}</p>
      )}

      <Button type="submit" fullWidth loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'email' | 'phone'>('phone');
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  const onDone = () => navigate('/today', { replace: true });

  const onGoogleClick = async () => {
    setGoogleError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
      onDone();
    } catch (error) {
      setGoogleError(toMessage(error));
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back.</p>

      <div className="mt-6 inline-flex gap-1 rounded-xl border border-line bg-raised p-1">
        {(['phone', 'email'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            className={cn(
              'rounded-full px-4 py-1.5 text-sm font-medium capitalize transition-colors',
              option === mode ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
            )}
          >
            {option}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {mode === 'email' ? <EmailLoginForm onDone={onDone} /> : <PhoneLoginForm onDone={onDone} />}
      </div>

      {googleError && (
        <p className="mt-4 rounded-xl bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{googleError}</p>
      )}

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <Button
        type="button"
        variant="secondary"
        fullWidth
        loading={googleLoading}
        onClick={onGoogleClick}
      >
        Continue with Google
      </Button>

      <p className="mt-6 text-sm text-muted">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-brand-ink underline">
          Create your SellEazy account
        </Link>
      </p>
    </div>
  );
}
