import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRestaurant, useTable } from '../lib/data';
import { useCart } from '../lib/cart';
import { Icon } from '../components/Icon';
import { HeroSlider } from '../components/HeroSlider';

const HERO_FALLBACKS = [
  'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=1600',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600',
  'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1600',
];

export default function Landing() {
  const { slug, qrToken } = useParams();
  const navigate = useNavigate();
  const { restaurant, loading } = useRestaurant(slug ?? '');
  const { tableId, tableLabel } = useTable(restaurant?.id, qrToken);
  const init = useCart(s => s.init);

  useEffect(() => {
    if (restaurant?.id) init(restaurant.id, tableId);
  }, [restaurant?.id, tableId, init]);

  // Hero gallery: prefer hero_images[], fall back to hero_image, then defaults.
  // We bail out unused entries (empty strings) here so the slider has clean data.
  const heroImages = useMemo(() => {
    if (!restaurant) return HERO_FALLBACKS;
    const fromArray = (restaurant.hero_images ?? []).filter(Boolean);
    if (fromArray.length) return fromArray.slice(0, 5);
    if (restaurant.hero_image) return [restaurant.hero_image];
    return HERO_FALLBACKS;
  }, [restaurant]);

  if (loading) return <Loading />;
  if (!restaurant) return <NotFound />;

  const goMenu = () => {
    if (qrToken) navigate(`/${slug}/t/${qrToken}/menu`);
    else navigate(`/${slug}/menu`);
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden flex flex-col font-sans">
      {/* Hero (top ~60%) — auto-rotating image carousel */}
      <HeroSlider
        images={heroImages}
        style={{ height: '62vh', minHeight: '420px' }}
      >
        <div className="absolute inset-0">
          {/* Floating Table badge */}
          {tableLabel && (
            <div className="absolute top-6 right-4 z-30">
              <div className="inline-flex items-center gap-2 bg-primary text-on-primary px-4 py-2 rounded-pill shadow-cta backdrop-blur font-bold text-label-bold border border-primary-container/30">
                <Icon name="table_restaurant" size={18} />
                {tableLabel}
              </div>
            </div>
          )}

          {/* Bottom overlay content */}
          <div className="absolute bottom-0 left-0 right-0 px-container-margin pb-8 z-30 flex flex-col gap-4 text-on-primary">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Icon name="restaurant" size={22} className="text-on-primary" />
                <span className="text-label-bold tracking-widest uppercase opacity-90">
                  {restaurant.name}
                </span>
              </div>
              <h1 className="font-display text-[40px] leading-[1.05] font-extrabold tracking-tight">
                {restaurant.name}
              </h1>
            </div>

            <div className="flex flex-wrap gap-2">
              {restaurant.cuisines.map(c => (
                <span
                  key={c}
                  className="bg-white/15 backdrop-blur-md text-on-primary border border-white/25 px-3 py-1 rounded-pill text-label-sm"
                >
                  {c}
                </span>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-1 text-on-primary/90">
              <div className="flex items-center gap-1.5 text-label-bold">
                <Icon name="star" size={16} fill className="text-yellow-400" />
                {restaurant.rating.toFixed(1)}
                <span className="font-normal text-label-sm opacity-80 ml-0.5">
                  ({(restaurant.review_count / 1000).toFixed(1)}k+ reviews)
                </span>
              </div>
              <span className="size-1 rounded-full bg-white/50" />
              <div className="flex items-center gap-1.5 text-label-bold">
                <Icon name="schedule" size={16} />
                {restaurant.prep_time_min}–{restaurant.prep_time_max} mins
              </div>
            </div>
          </div>
        </div>
      </HeroSlider>

      {/* Bottom sheet (rises into hero) */}
      <div className="relative -mt-7 flex-1 bg-surface rounded-t-3xl shadow-topfloat flex flex-col px-container-margin pt-8 pb-10 z-20">
        {/* Drag handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-surface-variant rounded-pill" />

        <div className="flex-1 flex flex-col justify-center items-center text-center max-w-sm mx-auto w-full">
          <h2 className="font-display text-headline-md text-on-surface mb-2">Welcome!</h2>
          <p className="text-body-md text-on-surface-variant mb-8 leading-relaxed">
            {restaurant.welcome_text}
          </p>

          <button
            onClick={goMenu}
            className="w-full inline-flex items-center justify-center gap-2 rounded-pill bg-primary text-on-primary font-display font-bold text-body-lg py-4 shadow-cta active:scale-[0.97] transition"
          >
            <Icon name="restaurant_menu" size={22} />
            Start Ordering
          </button>

          <div className="mt-6 flex items-center justify-center gap-2 text-secondary text-label-sm">
            <Icon name="verified" size={16} fill />
            {tableLabel ? 'Dine-in table detected automatically' : 'Takeaway order'}
          </div>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="min-h-screen grid place-items-center text-on-surface-variant">
      <div className="size-8 rounded-full border-2 border-surface-container-high border-t-primary animate-spin" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center text-center px-6">
      <div>
        <h1 className="font-display text-headline-lg">Restaurant not found</h1>
        <p className="text-on-surface-variant mt-2">Please scan the QR again or ask staff for help.</p>
      </div>
    </div>
  );
}
