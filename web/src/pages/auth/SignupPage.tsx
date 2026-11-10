import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from '@/components/ui';
import { registerWithPhone, signInWithGoogle } from '@/services';
import { toMessage } from '@/utils/errors';
import { signupSchema, type SignupInput } from '@/utils/validation';

/** Step 1 of 2: the login only. The business is set up on the next screen. */
export function SignupPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [google, setGoogle] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    try {
      await registerWithPhone(v.fullName, v.phone, v.password);
      navigate('/onboarding', { replace: true });
    } catch (e) {
      setError(toMessage(e));
    }
  });

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Create your SellEazy account</h1>
      <p className="mt-1 text-sm text-muted">Free for your first 15 orders every month. No card needed.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <Input label="Your name" autoComplete="name" error={errors.fullName?.message} {...register('fullName')} />
        <Input label="Phone number" type="tel" autoComplete="tel" placeholder="024 123 4567" error={errors.phone?.message} {...register('phone')} />
        <Input label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." error={errors.password?.message} {...register('password')} />
        {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger">{error}</p>}
        <Button type="submit" fullWidth loading={isSubmitting}>Continue</Button>
      </form>
      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="text-xs font-medium uppercase text-muted">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button
        variant="secondary"
        fullWidth
        loading={google}
        onClick={async () => {
          setGoogle(true);
          setError(null);
          try {
            await signInWithGoogle();
            navigate('/onboarding', { replace: true });
          } catch (e) {
            setError(toMessage(e));
          } finally {
            setGoogle(false);
          }
        }}
      >
        Continue with Google
      </Button>
      <p className="mt-6 text-sm text-muted">
        Already have an account? <Link to="/login" className="font-semibold text-brand-ink underline">Sign in</Link>
      </p>
      <p className="mt-2 text-xs text-muted">Invited by a business? Sign up with the phone number or email they used, and you'll join them automatically.</p>
    </div>
  );
}
