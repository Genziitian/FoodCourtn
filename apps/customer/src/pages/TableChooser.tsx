import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRestaurant } from '../lib/data';
import { listActiveTables } from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Single-QR landing. Restaurant uses ONE poster QR for the whole branch;
 * scanning lands here. Customer picks their table from the dropdown, then we
 * route into the standard per-table flow at `/{slug}/t/{qr_token}/menu`.
 *
 * Customers who haven't signed in are sent through /login first — the auth
 * gate kicks in on the destination route anyway, but doing it here keeps the
 * post-login redirect pointing at this branch instead of falling back to the
 * demo URL.
 */
export default function TableChooser() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { restaurant, loading: restaurantLoading } = useRestaurant(slug ?? '');
  const { user } = useAuth();
  const isSignedIn = !!user;

  const [tables, setTables] = useState<Array<{ id: string; label: string; qr_token: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!restaurant?.id) return;
    let cancelled = false;
    setLoading(true); setErr(null);
    listActiveTables(restaurant.id)
      .then(rows => { if (!cancelled) { setTables(rows); setLoading(false); } })
      .catch(e => { if (!cancelled) { setErr(e.message ?? 'Could not load tables'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [restaurant?.id]);

  // If admin hasn't switched to single mode, this URL is unexpected — but we
  // still try to be helpful: if there are no tables registered, fall back to
  // takeaway. Otherwise just show the chooser.
  const hero = restaurant?.hero_images?.[0] ?? restaurant?.hero_image ?? null;

  const goWithGate = (dest: string) => {
    // Login reads `location.state.from` to bounce back after sign-in.
    if (!isSignedIn) navigate('/login', { state: { from: dest } });
    else navigate(dest);
  };

  const continueToMenu = () => {
    const t = tables.find(x => x.id === selected);
    if (!t) return;
    goWithGate(`/${slug}/t/${t.qr_token}/menu`);
  };

  const continueAsTakeaway = () => goWithGate(`/${slug}/menu`);

  if (restaurantLoading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <div className="text-center max-w-sm">
          <p className="text-rose-600 font-semibold">Restaurant not found.</p>
          <p className="text-sm text-slate-500 mt-1">Check the QR code or ask the staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <div
        className="h-44 sm:h-56 bg-slate-200 relative"
        style={hero ? { backgroundImage: `url(${hero})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wider opacity-90">Welcome to</p>
          <h1 className="text-2xl font-extrabold mt-0.5 drop-shadow">{restaurant.name}</h1>
          {restaurant.area_name && (
            <p className="text-sm opacity-90">{restaurant.area_name}{restaurant.city ? `, ${restaurant.city}` : ''}</p>
          )}
        </div>
      </div>

      <div className="flex-1 max-w-md w-full mx-auto p-5">
        <div className="bg-white rounded-2xl shadow-card p-5">
          <h2 className="text-base font-bold">Which table are you at?</h2>
          <p className="text-sm text-slate-500 mt-1">
            Pick your table number so we can route your order to the right server.
          </p>

          {loading ? (
            <div className="mt-4 text-sm text-slate-500">Loading tables…</div>
          ) : err ? (
            <div className="mt-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>
          ) : tables.length === 0 ? (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">
              No tables are registered yet. Ask the staff, or continue as takeaway.
            </div>
          ) : (
            <div className="mt-4">
              <label className="block">
                <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">Table</span>
                <select
                  value={selected}
                  onChange={e => setSelected(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500 bg-white text-base"
                >
                  <option value="">— Choose your table —</option>
                  {tables.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <button
            disabled={!selected}
            onClick={continueToMenu}
            className="mt-5 w-full rounded-full bg-brand-600 text-white py-3 text-sm font-bold hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to menu
          </button>

          <button
            onClick={continueAsTakeaway}
            className="mt-2 w-full rounded-full border border-slate-200 text-slate-700 py-3 text-sm font-semibold hover:bg-slate-50"
          >
            Order takeaway instead
          </button>

          <p className="mt-4 text-center text-xs text-slate-400">
            Not at this restaurant? Just close this page.
          </p>
        </div>
      </div>
    </div>
  );
}
