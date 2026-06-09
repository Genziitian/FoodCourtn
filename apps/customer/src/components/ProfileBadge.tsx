import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Icon } from './Icon';

interface Props {
  /** Tailwind size class for the circle. Defaults to `size-10` (40px). */
  sizeClass?: string;
  /** Override the destination if you don't want the default `/profile` route. */
  to?: string;
}

/**
 * Top-right header avatar.
 *
 * Signed-in customer → solid primary circle with the FIRST letter of their
 * name (e.g. "V" for "Varun Singh"). One letter, not two — that matches
 * the spec and keeps the badge readable at 40px.
 *
 * No name or signed out → person icon fallback. Tapping always navigates
 * to the Profile page, scoped to the current restaurant URL (`/{slug}/t/{qr}/profile`
 * or `/{slug}/profile`).
 */
export function ProfileBadge({ sizeClass = 'size-10', to }: Props) {
  const navigate = useNavigate();
  const { slug, qrToken } = useParams();
  const { user } = useAuth();

  // First letter of the trimmed name. Falls back to the email's first letter,
  // then to '?' (which the icon-branch replaces visually).
  const firstLetter =
    (user?.name?.trim()?.[0]
      ?? user?.email?.trim()?.[0]
      ?? ''
    ).toUpperCase();

  const dest =
    to
      ?? (qrToken ? `/${slug}/t/${qrToken}/profile` : `/${slug ?? 'the-spice-route'}/profile`);

  return (
    <button
      onClick={() => navigate(dest)}
      className={`${sizeClass} grid place-items-center rounded-full bg-primary text-on-primary font-display font-bold text-label-bold shadow-sm hover:opacity-90 active:scale-95 transition`}
      aria-label={user?.name ? `Open profile (${user.name})` : 'Open profile'}
      title={user?.name ?? 'Open profile'}
    >
      {firstLetter
        ? <span>{firstLetter}</span>
        : <Icon name="person" size={20} className="text-on-primary" />}
    </button>
  );
}
