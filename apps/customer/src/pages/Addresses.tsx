import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cls } from '@foodcourt/shared';
import { useAuth, type Address } from '../lib/auth';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';

const LABELS = ['Home', 'Work', 'Other'] as const;

const LABEL_ICON: Record<string, string> = {
  Home: 'home',
  Work: 'work',
  Other: 'location_on',
};

export default function Addresses() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug ?? 'the-spice-route'}`;
  const { addresses, addAddress, updateAddress, removeAddress, setDefaultAddress } = useAuth();

  const [editing, setEditing] = useState<Address | 'new' | null>(null);

  return (
    <div className="min-h-screen bg-background pb-24 font-sans">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex items-center justify-between px-container-margin h-16">
        <button onClick={() => navigate(`${base}/profile`)} className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50">
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <h1 className="font-display text-headline-md text-on-surface">Saved addresses</h1>
        <span className="w-10" />
      </header>

      <main className="max-w-md mx-auto px-container-margin pt-5 space-y-4">
        <button
          onClick={() => setEditing('new')}
          className="w-full rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-4 flex items-center gap-3 text-primary font-semibold active:scale-[0.99] transition"
        >
          <Icon name="add_location" size={22} />
          Add a new address
        </button>

        {addresses.length === 0 ? (
          <div className="card p-8 text-center">
            <Icon name="location_off" size={40} className="mx-auto text-on-surface-variant/40" />
            <p className="mt-3 font-semibold text-on-surface">No addresses saved yet</p>
            <p className="text-label-sm text-on-surface-variant mt-1">
              Save a delivery address for faster takeaway and reservations.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {addresses.map(a => (
              <li key={a.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <span className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                    <Icon name={LABEL_ICON[a.label] ?? 'location_on'} size={20} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-on-surface">{a.label}</p>
                      {a.is_default && (
                        <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    {a.recipient && (
                      <p className="text-sm text-on-surface mt-0.5">{a.recipient} · {a.phone}</p>
                    )}
                    <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                      {a.address_line}
                      {a.locality && `, ${a.locality}`}
                      {a.city && `, ${a.city}`}
                      {a.pincode && ` ${a.pincode}`}
                    </p>
                    {a.landmark && (
                      <p className="text-label-sm text-on-surface-variant/70 mt-1 italic">
                        Landmark: {a.landmark}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-outline-variant/15 flex items-center justify-between">
                  {!a.is_default ? (
                    <button
                      onClick={() => setDefaultAddress(a.id)}
                      className="text-label-sm font-semibold text-primary inline-flex items-center gap-1"
                    >
                      <Icon name="check_circle" size={14} fill />
                      Set as default
                    </button>
                  ) : <span />}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditing(a)}
                      className="text-label-sm font-semibold text-on-surface-variant hover:bg-surface-container-low rounded-lg px-3 py-1.5"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => removeAddress(a.id)}
                      className="text-label-sm font-semibold text-error/80 hover:bg-error/5 rounded-lg px-3 py-1.5"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <AddressSheet
        open={editing}
        onClose={() => setEditing(null)}
        onSubmit={async (payload) => {
          try {
            if (editing === 'new') await addAddress(payload);
            else if (editing) await updateAddress(editing.id, payload);
            setEditing(null);
          } catch (e: any) {
            alert(e?.message ?? 'Could not save address');
          }
        }}
      />

      <BottomNav />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Address bottom sheet
// ────────────────────────────────────────────────────────────

interface SheetProps {
  open: Address | 'new' | null;
  onClose: () => void;
  onSubmit: (a: Omit<Address, 'id'>) => void;
}

function AddressSheet({ open, onClose, onSubmit }: SheetProps) {
  if (!open) return null;
  const initial: Omit<Address, 'id'> = open === 'new'
    ? { label: 'Home', recipient: '', phone: '', address_line: '', locality: '', city: 'Bengaluru', pincode: '', landmark: '', is_default: false }
    : { ...open };
  return <AddressSheetInner key={open === 'new' ? 'new' : open.id} initial={initial} onClose={onClose} onSubmit={onSubmit} />;
}

function AddressSheetInner({
  initial, onClose, onSubmit,
}: { initial: Omit<Address, 'id'>; onClose: () => void; onSubmit: SheetProps['onSubmit'] }) {
  const [v, setV] = useState(initial);
  const set = <K extends keyof typeof v>(k: K, val: typeof v[K]) => setV(p => ({ ...p, [k]: val }));

  const canSubmit = v.address_line.trim().length > 5 && v.city.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center bg-black/45 animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full sm:max-w-md bg-surface-container-lowest rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[92vh] animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="absolute top-2 left-0 right-0 flex justify-center pointer-events-none">
          <div className="w-10 h-1.5 bg-surface-dim/50 rounded-pill" />
        </div>
        <button
          onClick={onClose}
          className="absolute top-4 right-4 size-9 grid place-items-center rounded-full bg-surface-container-low text-on-surface"
          aria-label="Close"
        >
          <Icon name="close" size={20} />
        </button>

        <div className="px-container-margin pt-7 pb-2">
          <h2 className="font-display text-headline-md text-on-surface">
            {initial.address_line ? 'Edit address' : 'Add new address'}
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto px-container-margin pb-4 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">Type</p>
            <div className="grid grid-cols-3 gap-2">
              {LABELS.map(l => (
                <button
                  key={l}
                  onClick={() => set('label', l)}
                  className={cls(
                    'flex items-center justify-center gap-1.5 rounded-xl border-2 py-2.5 font-semibold transition',
                    v.label === l ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant',
                  )}
                >
                  <Icon name={LABEL_ICON[l]} size={16} />
                  {l}
                </button>
              ))}
            </div>
          </div>

          <Field label="Recipient name">
            <input
              value={v.recipient}
              onChange={e => set('recipient', e.target.value)}
              placeholder="Person to contact at this address"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary"
            />
          </Field>
          <Field label="Phone">
            <input
              type="tel" inputMode="numeric"
              value={v.phone}
              onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="98xxxxxxxx"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary"
            />
          </Field>
          <Field label="Address line" required>
            <textarea
              value={v.address_line}
              onChange={e => set('address_line', e.target.value)}
              rows={2}
              placeholder="Flat / building / street"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary resize-none"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Locality">
              <input
                value={v.locality}
                onChange={e => set('locality', e.target.value)}
                placeholder="Indiranagar"
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary"
              />
            </Field>
            <Field label="Pincode">
              <input
                value={v.pincode}
                onChange={e => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="560038"
                className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary"
              />
            </Field>
          </div>
          <Field label="City" required>
            <input
              value={v.city}
              onChange={e => set('city', e.target.value)}
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary"
            />
          </Field>
          <Field label="Landmark (optional)">
            <input
              value={v.landmark}
              onChange={e => set('landmark', e.target.value)}
              placeholder="Opp. metro station"
              className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-4 py-3 outline-none focus:border-primary"
            />
          </Field>

          <label className="flex items-center gap-3 cursor-pointer pt-2">
            <input
              type="checkbox"
              checked={v.is_default}
              onChange={e => set('is_default', e.target.checked)}
              className="size-5 rounded border-outline-variant accent-primary"
            />
            <span className="text-sm">Set as default address</span>
          </label>
        </div>

        <div className="border-t border-outline-variant/15 px-container-margin py-4">
          <button
            onClick={() => onSubmit(v)}
            disabled={!canSubmit}
            className={cls(
              'w-full rounded-pill bg-primary text-on-primary font-display font-bold text-body-lg py-4 shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2',
              !canSubmit && 'opacity-50 cursor-not-allowed',
            )}
          >
            {initial.address_line ? 'Save changes' : 'Save address'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant mb-2">
        {label} {required && <span className="text-error">*</span>}
      </span>
      {children}
    </label>
  );
}
