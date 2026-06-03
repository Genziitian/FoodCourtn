import { useNavigate, useParams } from 'react-router-dom';
import { inr } from '@foodcourt/shared';
import { useAuth } from '../lib/auth';
import { Icon } from '../components/Icon';
import { BottomNav } from '../components/BottomNav';

const EARN_RULES = [
  { icon: 'restaurant',         title: 'Order food',            sub: 'Earn 1 coin for every ₹10 spent' },
  { icon: 'rate_review',        title: 'Leave a review',        sub: '+5 coins on each completed order' },
  { icon: 'share',              title: 'Share with friends',    sub: '+25 coins when a friend places their first order' },
  { icon: 'cake',               title: 'Birthday surprise',     sub: '50 bonus coins on your birthday' },
];

const REDEEM_TIERS = [
  { coins: 50,  reward: '₹50 off',  sub: 'Use on any order above ₹250' },
  { coins: 100, reward: '₹100 off', sub: 'Use on any order above ₹400' },
  { coins: 250, reward: 'Free dessert', sub: 'Choose any dessert on us' },
  { coins: 500, reward: '20% off',  sub: 'Up to ₹300 off any order' },
];

export default function FoodCoins() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = qrToken ? `/${slug}/t/${qrToken}` : `/${slug ?? 'the-spice-route'}`;

  if (!user) {
    navigate(`${base}/profile`, { replace: true });
    return null;
  }

  const coins = user.loyalty_balance ?? 0;
  const nextTier = REDEEM_TIERS.find(t => t.coins > coins) ?? REDEEM_TIERS[REDEEM_TIERS.length - 1];
  const progress = Math.min(100, Math.round((coins / nextTier.coins) * 100));

  return (
    <div className="min-h-screen bg-background pb-24 font-sans">
      <header className="bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30 sticky top-0 z-40 flex items-center justify-between px-container-margin h-16">
        <button onClick={() => navigate(`${base}/profile`)} className="size-10 grid place-items-center rounded-full hover:bg-surface-container-high/50">
          <Icon name="arrow_back" size={22} className="text-primary" />
        </button>
        <h1 className="font-display text-headline-md text-on-surface">FoodCoins</h1>
        <span className="w-10" />
      </header>

      <main className="max-w-md mx-auto px-container-margin pt-6 space-y-5">
        {/* Balance card */}
        <section className="rounded-3xl bg-gradient-to-br from-primary to-primary/80 text-on-primary p-6 shadow-cta relative overflow-hidden">
          <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-2xl" />
          <div className="absolute -bottom-10 -left-10 size-32 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <p className="text-label-bold uppercase tracking-widest opacity-85">Your balance</p>
            <div className="flex items-end gap-2 mt-2">
              <span className="font-display text-[44px] font-extrabold leading-none">{coins}</span>
              <span className="text-body-lg font-semibold pb-1.5 opacity-90">coins</span>
            </div>
            <p className="text-sm opacity-85 mt-1">≈ {inr(coins)} in rewards</p>

            <div className="mt-5">
              <div className="flex justify-between text-xs font-semibold opacity-85 mb-1.5">
                <span>{coins} / {nextTier.coins}</span>
                <span>{nextTier.reward}</span>
              </div>
              <div className="h-2 rounded-full bg-white/25 overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs opacity-85 mt-2">
                {coins >= nextTier.coins
                  ? `You can redeem "${nextTier.reward}" now!`
                  : `${nextTier.coins - coins} coins to unlock "${nextTier.reward}"`}
              </p>
            </div>
          </div>
        </section>

        {/* How to earn */}
        <section>
          <h3 className="section-label px-1 mb-2">How to earn</h3>
          <div className="card overflow-hidden divide-y divide-outline-variant/15">
            {EARN_RULES.map(r => (
              <div key={r.title} className="px-4 py-3.5 flex items-center gap-3">
                <span className="size-10 grid place-items-center rounded-xl bg-primary/10 text-primary shrink-0">
                  <Icon name={r.icon} size={20} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-on-surface">{r.title}</p>
                  <p className="text-label-sm text-on-surface-variant">{r.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Redeem tiers */}
        <section>
          <h3 className="section-label px-1 mb-2">Redeem your coins</h3>
          <ul className="space-y-2">
            {REDEEM_TIERS.map(t => {
              const unlocked = coins >= t.coins;
              return (
                <li
                  key={t.coins}
                  className={`card p-4 flex items-center gap-3 transition ${unlocked ? '' : 'opacity-75'}`}
                >
                  <span className={`size-12 grid place-items-center rounded-2xl shrink-0 ${unlocked ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}>
                    <Icon name={unlocked ? 'redeem' : 'lock'} size={22} fill={unlocked} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-on-surface">{t.reward}</p>
                    <p className="text-label-sm text-on-surface-variant">{t.sub}</p>
                  </div>
                  <span className="text-label-bold text-on-surface inline-flex items-center gap-1 shrink-0">
                    <Icon name="paid" size={16} className="text-amber-500" />
                    {t.coins}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Recent activity (placeholder until loyalty_transactions is wired) */}
        <section>
          <h3 className="section-label px-1 mb-2">Recent activity</h3>
          <div className="card p-6 text-center">
            <Icon name="history" size={36} className="mx-auto text-on-surface-variant/40" />
            <p className="mt-3 text-on-surface-variant text-sm">
              No coin transactions yet. Place your first order to start earning!
            </p>
            <button
              onClick={() => navigate(`${base}/menu`)}
              className="mt-4 rounded-pill bg-primary text-on-primary font-semibold px-5 py-2.5 active:scale-95"
            >
              Browse menu
            </button>
          </div>
        </section>

        <p className="text-center text-label-sm text-on-surface-variant/70 px-4">
          Coins never expire. Redemptions apply at checkout when the order total meets the minimum.
        </p>
      </main>

      <BottomNav />
    </div>
  );
}
