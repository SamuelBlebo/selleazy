import { useEffect, useState } from 'react';
import { Button, Input, Select, Spinner } from '@/components/ui';
import { BUSINESS_TYPES, CATEGORIES } from '@/config/business';
import { useAuth } from '@/hooks/useAuth';
import { acceptInvite, createOrganization, signOutUser } from '@/services';
import type { BusinessType } from '@/types';
import { cn } from '@/utils/cn';
import { toMessage } from '@/utils/errors';

/**
 * Step 2 of signup: what the business sells, then its details. The business
 * is created by the createOrganization Cloud Function; once users/{uid}
 * gets its orgId, the route guard moves the merchant to /today on its own.
 * Invited staff never see the form: acceptInvite joins them first.
 */
export function OnboardingPage() {
  const { user } = useAuth();
  const [checking, setChecking] = useState(true);
  const [type, setType] = useState<BusinessType | null>(null);
  const [f, setF] = useState({ businessName: '', fullName: user?.displayName ?? '', area: '', category: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    acceptInvite()
      .then((r) => { if (!r.joined) setChecking(false); })
      .catch(() => setChecking(false));
  }, []);

  if (checking) return <div className="grid place-items-center py-16"><Spinner /></div>;

  if (!type) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">What do you sell?</h1>
        <p className="mt-1 text-sm text-muted">This sets up the right tools. You can change it later.</p>
        <div className="mt-6 space-y-2.5">
          {BUSINESS_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setType(t.id);
                setF((v) => ({ ...v, category: CATEGORIES[t.id][0] }));
              }}
              className="w-full rounded-2xl border border-line bg-surface px-4 py-3.5 text-left hover:border-brand-2"
            >
              <span className="flex items-baseline justify-between gap-3">
                <b>{t.label}</b>
                <span className="text-xs text-muted">{t.hint}</span>
              </span>
              <span className="mt-0.5 block text-sm text-muted">{t.examples}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void signOutUser()} className="mt-6 text-sm text-muted underline">Sign out</button>
      </div>
    );
  }

  const submit = async () => {
    if (f.businessName.trim().length < 2 || f.fullName.trim().length < 2) return setError('Add your name and your business name.');
    setBusy(true);
    setError(null);
    try {
      await createOrganization({
        businessName: f.businessName.trim(),
        fullName: f.fullName.trim(),
        businessType: type,
        category: f.category,
        area: f.area.trim() || null,
        phone: user?.email?.endsWith('.internal') ? `+${user.email.split('@')[0]}` : null,
      });
      // AuthContext picks up the new users/{uid}.orgId and the route guard redirects.
    } catch (e) {
      setError(toMessage(e));
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" onClick={() => setType(null)} className="mb-3 text-sm text-muted underline">← Change what you sell</button>
      <h1 className="text-2xl font-semibold tracking-tight">About your business</h1>
      <p className="mt-1 text-sm text-muted">{BUSINESS_TYPES.find((t) => t.id === type)?.label}</p>
      <div className="mt-6 space-y-4">
        <Input label="Business name" value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} placeholder={type === 'services' ? "e.g. Efua's Hair Studio" : type === 'food' ? "e.g. Ama's Kitchen" : 'e.g. Kofi Phones'} />
        <Input label="Your name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <Select label="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
          {CATEGORIES[type].map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input label="Area" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="e.g. Osu, Accra" />
        {error && <p className={cn('rounded-xl bg-danger-soft px-3 py-2 text-sm font-medium text-danger')}>{error}</p>}
        <Button fullWidth loading={busy} onClick={() => void submit()}>Create my business</Button>
      </div>
    </div>
  );
}
