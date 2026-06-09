import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cls, inr } from '@foodcourt/shared';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { useOrderHistory, useRestaurant } from '../lib/data';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';

type SupportSheet = null | 'help' | 'contact' | 'terms';

export default function Profile() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const { user, customerId, logout, updateUser } = useAuth();
  const cartCount = useCart(s => s.cart.lines.reduce((n, l) => n + l.qty, 0));
  // For Contact restaurant we want the current restaurant's phone if known.
  const { restaurant } = useRestaurant(slug ?? '');
  // Recent (completed) orders so the customer can re-order in one tap.
  const { orders: pastOrders } = useOrderHistory(customerId);
  const recentCompleted = (pastOrders ?? [])
    .filter(o => o.status === 'completed')
    .slice(0, 3);

  const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug ?? 'the-spice-route'}`;

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [support, setSupport] = useState<SupportSheet>(null);

  if (!user) return <SignedOut base={base} />;

  const startEdit = () => { setDraftName(user.name); setEditing(true); };
  const saveEdit = () => {
    const next = draftName.trim();
    if (next && next !== user.name) updateUser({ name: next });
    setEditing(false);
  };
  const cancelEdit = () => { setDraftName(user.name); setEditing(false); };

  return (
    <div className="min-h-screen bg-background pb-24 font-sans">
      {/* Header */}
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex items-center justify-between px-container-margin h-16">
        <button
          onClick={() => navigate(base)}
          className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50 active:scale-95 transition"
        >
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <h1 className="font-display text-headline-md text-on-surface">Profile</h1>
        <span className="w-10" />
      </header>

      <main className="max-w-md mx-auto px-container-margin pt-6 space-y-5">
        {/* Profile card */}
        <section className="card p-6 flex items-center gap-4">
          <span className="size-16 grid place-items-center rounded-full bg-primary text-on-primary font-display font-bold text-xl shrink-0">
            {user.initials}
          </span>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                  autoFocus
                  placeholder="Your name"
                  className="w-full rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 outline-none focus:border-primary text-on-surface font-display font-bold text-lg"
                />
                <div className="flex gap-2">
                  <button
                    onClick={saveEdit}
                    disabled={!draftName.trim()}
                    className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-label-sm font-semibold active:scale-95 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="px-3 py-1.5 rounded-full bg-surface-container-low text-on-surface text-label-sm font-semibold active:scale-95"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="font-display text-headline-md text-on-surface truncate">{user.name}</h2>
                <p className="text-sm text-on-surface-variant inline-flex items-center gap-1.5 mt-0.5">
                  <Icon name="phone" size={14} />
                  +91 {user.phone}
                </p>
                <p className="text-label-sm text-on-surface-variant/70 mt-0.5">
                  Member since {new Date(user.joined_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </p>
              </>
            )}
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="size-10 grid place-items-center rounded-full hover:bg-surface-container-low transition active:scale-95"
              aria-label="Edit name"
            >
              <Icon name="edit" size={20} className="text-on-surface-variant" />
            </button>
          )}
        </section>

        {/* Stats */}
        <section className="grid grid-cols-3 gap-2">
          <StatTile label="Orders"   value={String(user.total_orders)} />
          <StatTile label="Spent"    value={inr(user.total_spent)} />
          <StatTile label="Coins"    value={String(user.loyalty_balance)} highlight />
        </section>

        {/* Account */}
        <Group title="Account">
          <Row
            icon="receipt_long"
            label="Order Status"
            sub={`${user.total_orders} past orders`}
            onClick={() => navigate(`${base}/profile/orders`)}
            badge={cartCount > 0 ? `${cartCount} in cart` : undefined}
          />
          <Row
            icon="loyalty"
            label="FoodCoins & Rewards"
            sub={`${user.loyalty_balance} coins · ≈ ${inr(user.loyalty_balance)}`}
            onClick={() => navigate(`${base}/profile/coins`)}
          />
        </Group>

        {/* Recent orders — completed only, with one-tap re-order */}
        {recentCompleted.length > 0 && (
          <section>
            <div className="flex items-end justify-between px-1 mb-2">
              <h3 className="section-label">Recent Orders</h3>
              <button
                onClick={() => navigate(`${base}/profile/orders`)}
                className="text-label-sm text-primary font-bold"
              >
                See all
              </button>
            </div>
            <ul className="space-y-2">
              {recentCompleted.map(o => {
                const itemPreview = (o.items ?? [])
                  .slice(0, 2)
                  .map((it: any) => `${it.qty}× ${it.item_name}`)
                  .join(' · ') || 'View details';
                const moreCount = Math.max(0, (o.items?.length ?? 0) - 2);
                return (
                  <li key={o.id} className="card p-3 flex items-center gap-3">
                    <span className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <Icon name="restart_alt" size={20} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-mono text-label-sm font-bold text-on-surface">{o.code}</p>
                        <span className="text-label-sm text-on-surface-variant">·</span>
                        <span className="text-label-sm font-semibold text-on-surface">{inr(Number(o.total))}</span>
                      </div>
                      <p className="text-label-sm text-on-surface-variant truncate">
                        {itemPreview}{moreCount > 0 ? ` +${moreCount} more` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => navigate(`${base}/order/${o.code}`)}
                      className="rounded-pill bg-primary text-on-primary text-label-bold font-bold px-3 py-1.5 active:scale-95 shrink-0"
                      aria-label={`Re-order ${o.code}`}
                    >
                      Re-order
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Preferences */}
        <Group title="Preferences">
          <ToggleRow
            icon="restaurant_menu"
            label="Order updates"
            sub="Notify me when status changes"
            checked={user.notify_order_updates}
            onToggle={() => updateUser({ notify_order_updates: !user.notify_order_updates })}
          />
          <ToggleRow
            icon="local_offer"
            label="Promotions & offers"
            sub="Discount codes & seasonal menus"
            checked={user.notify_promotions}
            onToggle={() => updateUser({ notify_promotions: !user.notify_promotions })}
          />
          <ToggleRow
            icon="paid"
            label="Loyalty updates"
            sub="Coins earned, expiring soon"
            checked={user.notify_loyalty}
            onToggle={() => updateUser({ notify_loyalty: !user.notify_loyalty })}
          />
        </Group>

        {/* Support */}
        <Group title="Support">
          <Row icon="help"        label="Help & FAQ"           sub="Common questions"          onClick={() => setSupport('help')} />
          <Row icon="chat_bubble" label="Contact restaurant"   sub="Reach the team directly"   onClick={() => setSupport('contact')} />
          <Row icon="gavel"       label="Terms & Privacy"      sub="Legal"                     onClick={() => setSupport('terms')} />
        </Group>

        <button
          onClick={() => { logout(); navigate(base); }}
          className="w-full rounded-pill bg-surface-container-lowest border border-outline-variant/40 text-error font-semibold py-3.5 active:scale-[0.98] transition flex items-center justify-center gap-2"
        >
          <Icon name="logout" size={20} />
          Sign out
        </button>

        <p className="text-center text-label-sm text-on-surface-variant/60">
          FoodCourt v0.1 · Made with care in Bengaluru
        </p>
      </main>

      <SupportSheetView
        kind={support}
        onClose={() => setSupport(null)}
        restaurantName={restaurant?.name ?? null}
        restaurantPhone={restaurant?.phone ?? null}
      />

      <BottomNav />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Signed-out fallback
// ────────────────────────────────────────────────────────────

function SignedOut({ base }: { base: string }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex flex-col font-sans bg-background pb-24">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex items-center justify-between px-container-margin h-16">
        <button onClick={() => navigate(base)} className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50">
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <h1 className="font-display text-headline-md text-on-surface">Profile</h1>
        <span className="w-10" />
      </header>

      <main className="flex-1 max-w-md mx-auto w-full px-container-margin py-8 flex flex-col items-center text-center">
        <span className="size-24 grid place-items-center rounded-full bg-primary/10 text-primary mb-5">
          <Icon name="person" size={48} />
        </span>
        <h2 className="font-display text-headline-lg text-on-surface">Sign in to your account</h2>
        <p className="text-on-surface-variant mt-2">
          Track orders, save your favourites, earn FoodCoins, and pick up where you left off.
        </p>

        <ul className="mt-8 w-full space-y-3 text-left">
          <Benefit icon="history" label="Reorder in two taps from your history" />
          <Benefit icon="loyalty" label="Earn FoodCoins on every order" />
          <Benefit icon="notifications_active" label="Get notified when your food is ready" />
        </ul>

        <button
          onClick={() => navigate('/login', { state: { from: base + '/profile' } })}
          className="mt-8 w-full rounded-pill bg-primary text-on-primary font-display font-bold text-body-lg py-4 shadow-cta active:scale-[0.97] transition flex items-center justify-center gap-2"
        >
          Sign in / Create account
          <Icon name="arrow_forward" size={20} />
        </button>

        <p className="mt-3 text-label-sm text-on-surface-variant">
          We'll send a one-time password — no password to remember.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}

function Benefit({ icon, label }: { icon: string; label: string }) {
  return (
    <li className="flex items-start gap-3 bg-surface-container-lowest rounded-2xl border border-outline-variant/20 px-4 py-3">
      <span className="size-9 grid place-items-center rounded-full bg-primary/10 text-primary shrink-0">
        <Icon name={icon} size={18} fill />
      </span>
      <p className="text-sm text-on-surface flex-1 leading-relaxed">{label}</p>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Support bottom-sheet — Help, Contact restaurant, Terms
// ────────────────────────────────────────────────────────────

function SupportSheetView({
  kind, onClose, restaurantName, restaurantPhone,
}: {
  kind: SupportSheet;
  onClose: () => void;
  restaurantName: string | null;
  restaurantPhone: string | null;
}) {
  if (!kind) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-surface w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
      >
        {kind === 'help' && <HelpContent />}
        {kind === 'contact' && <ContactContent name={restaurantName} phone={restaurantPhone} />}
        {kind === 'terms' && <TermsContent />}

        <div className="px-5 py-3 border-t border-outline-variant/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-pill bg-surface-container-low text-on-surface font-semibold text-label-bold active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SheetHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="px-5 pt-5 pb-3 flex items-center gap-3 border-b border-outline-variant/30">
      <span className="size-11 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon name={icon} size={22} fill />
      </span>
      <div>
        <h3 className="font-display text-headline-md text-on-surface">{title}</h3>
        <p className="text-label-sm text-on-surface-variant">{subtitle}</p>
      </div>
    </div>
  );
}

function HelpContent() {
  const faqs = [
    { q: 'How do I place an order?', a: 'Scan the QR code on your table or browse the menu, add items to your cart, then tap "Place order". Your kitchen will receive it immediately.' },
    { q: 'When do FoodCoins land?', a: 'Coins are credited automatically as soon as the order is placed. The rate depends on the restaurant — check the FoodCoins page to see your balance.' },
    { q: 'Can I cancel an order?', a: 'Orders can be cancelled within ~1 minute, before the kitchen accepts them. Open the order from "Order Status" and tap Cancel.' },
    { q: 'How do I redeem coins?', a: 'On the cart, tap "Use FoodCoins" and choose how many to redeem (subject to the restaurant\'s max redemption percent).' },
    { q: 'I didn\'t get my OTP?', a: 'Tap "Resend OTP" after the 30s timer expires. Check spam, or verify your phone is correct.' },
  ];
  return (
    <>
      <SheetHeader icon="help" title="Help & FAQ" subtitle="Quick answers to common questions" />
      <div className="overflow-y-auto px-5 py-4 space-y-3">
        {faqs.map((f, i) => (
          <details key={i} className="bg-surface-container-lowest rounded-2xl border border-outline-variant/20 group">
            <summary className="px-4 py-3 cursor-pointer list-none flex items-start justify-between gap-3 text-on-surface font-semibold">
              <span>{f.q}</span>
              <Icon name="expand_more" size={20} className="text-on-surface-variant shrink-0 transition group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-4 text-sm text-on-surface-variant leading-relaxed">{f.a}</p>
          </details>
        ))}
        <p className="text-center text-label-sm text-on-surface-variant/70 pt-2">
          Still stuck? Use "Contact restaurant" to reach the team directly.
        </p>
      </div>
    </>
  );
}

function ContactContent({ name, phone }: { name: string | null; phone: string | null }) {
  const cleanedPhone = phone?.replace(/[^\d+]/g, '') ?? '';
  return (
    <>
      <SheetHeader icon="chat_bubble" title="Contact restaurant" subtitle={name ?? 'Reach the team directly'} />
      <div className="overflow-y-auto px-5 py-5 space-y-3">
        {phone ? (
          <>
            <a
              href={`tel:${cleanedPhone}`}
              className="flex items-center gap-3 bg-primary/10 text-primary rounded-2xl px-4 py-4 active:scale-95 transition"
            >
              <span className="size-11 grid place-items-center rounded-full bg-primary text-on-primary shrink-0">
                <Icon name="phone" size={22} fill />
              </span>
              <div className="flex-1">
                <p className="font-display font-bold text-on-surface">Call {name ?? 'the restaurant'}</p>
                <p className="text-sm font-mono text-on-surface-variant">{phone}</p>
              </div>
              <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
            </a>
            <a
              href={`sms:${cleanedPhone}`}
              className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant/30 rounded-2xl px-4 py-4 active:scale-95 transition"
            >
              <span className="size-11 grid place-items-center rounded-full bg-surface-container-high text-on-surface shrink-0">
                <Icon name="sms" size={22} />
              </span>
              <div className="flex-1">
                <p className="font-semibold text-on-surface">Send a text</p>
                <p className="text-sm text-on-surface-variant">Quick questions or special requests</p>
              </div>
              <Icon name="chevron_right" size={20} className="text-on-surface-variant" />
            </a>
          </>
        ) : (
          <div className="rounded-2xl bg-surface-container-lowest border border-outline-variant/30 px-4 py-6 text-center text-on-surface-variant">
            <Icon name="phone_disabled" size={32} className="mx-auto text-on-surface-variant/50" />
            <p className="mt-2 text-sm">No contact number on file. Ask staff at the counter.</p>
          </div>
        )}

        <p className="text-center text-label-sm text-on-surface-variant/70 pt-2">
          For order-status issues, the kitchen tablet receives updates instantly — staff can resolve most things on the spot.
        </p>
      </div>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <SheetHeader icon="gavel" title="Terms & Privacy" subtitle="Plain-English version" />
      <div className="overflow-y-auto px-5 py-5 space-y-4 text-sm text-on-surface-variant leading-relaxed">
        <section>
          <h4 className="font-bold text-on-surface mb-1">Your data</h4>
          <p>We store your name, phone, and order history so you can reorder, track deliveries, and earn FoodCoins. We don't sell it.</p>
        </section>
        <section>
          <h4 className="font-bold text-on-surface mb-1">Payments</h4>
          <p>Card and UPI details are handled by Razorpay. FoodCourt never sees your card number or CVV.</p>
        </section>
        <section>
          <h4 className="font-bold text-on-surface mb-1">Order accuracy</h4>
          <p>Orders are placed directly with the restaurant. Refunds for missing or wrong items are handled by the restaurant at their discretion — usually as a coin refund or comp on your next visit.</p>
        </section>
        <section>
          <h4 className="font-bold text-on-surface mb-1">FoodCoins</h4>
          <p>Coins are issued by the restaurant and only redeemable at that restaurant. Rate and cap are set by the restaurant.</p>
        </section>
        <section>
          <h4 className="font-bold text-on-surface mb-1">Contact</h4>
          <p>Privacy questions: <a href="mailto:privacy@foodcourt.app" className="text-primary font-semibold">privacy@foodcourt.app</a></p>
        </section>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Tiles + rows
// ────────────────────────────────────────────────────────────

function StatTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cls(
      'card p-4 text-center',
      highlight && 'bg-gradient-to-br from-primary-container to-primary text-on-primary',
    )}>
      <p className={cls('text-label-sm font-medium', highlight ? 'text-white/85' : 'text-on-surface-variant')}>{label}</p>
      <p className={cls('font-display text-headline-md font-bold mt-1', !highlight && 'text-on-surface')}>{value}</p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="section-label px-1 mb-2">{title}</h3>
      <div className="card overflow-hidden divide-y divide-outline-variant/15">
        {children}
      </div>
    </section>
  );
}

function Row({
  icon, label, sub, onClick, badge,
}: { icon: string; label: string; sub: string; onClick: () => void; badge?: string }) {
  return (
    <button onClick={onClick} className="w-full text-left px-4 py-3.5 flex items-center gap-3 hover:bg-surface-container-low transition">
      <span className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon name={icon} size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-surface">{label}</p>
        <p className="text-label-sm text-on-surface-variant truncate">{sub}</p>
      </div>
      {badge && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
          {badge}
        </span>
      )}
      <Icon name="chevron_right" size={20} className="text-on-surface-variant/60" />
    </button>
  );
}

function ToggleRow({
  icon, label, sub, checked, onToggle,
}: { icon: string; label: string; sub: string; checked: boolean; onToggle: () => void }) {
  return (
    <div className="px-4 py-3.5 flex items-center gap-3">
      <span className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
        <Icon name={icon} size={20} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-on-surface">{label}</p>
        <p className="text-label-sm text-on-surface-variant">{sub}</p>
      </div>
      <button
        onClick={onToggle}
        className={cls(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition',
          checked ? 'bg-primary' : 'bg-surface-variant',
        )}
        aria-label={checked ? `Disable ${label}` : `Enable ${label}`}
      >
        <span className={cls(
          'inline-block size-5 rounded-full bg-white shadow transition',
          checked ? 'translate-x-[22px]' : 'translate-x-0.5',
        )} />
      </button>
    </div>
  );
}
