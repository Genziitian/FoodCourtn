import { useCallback, useState } from 'react';

/**
 * Haversine distance in kilometres between two lat/lng pairs.
 *
 * Accurate to within ~0.5% for distances < 50km, which is plenty for
 * "can we deliver to this customer?" gating. We use Earth's mean radius
 * of 6371km (the WGS84 mean radius).
 */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type GeoState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'ready'; coords: { lat: number; lng: number }; accuracyMeters: number }
  | { status: 'denied' }
  | { status: 'unavailable'; reason: string };

/**
 * Browser geolocation hook with explicit states. Designed for "Use my
 * location" buttons rather than auto-fetch on mount — we want the
 * customer to consciously share location, not have a permission dialog
 * pop the moment they open the cart.
 *
 * Usage:
 *   const { state, request, reset } = useGeolocation();
 *   <button onClick={request}>Use my location</button>
 *   {state.status === 'ready' && <p>Lat: {state.coords.lat}</p>}
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const request = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ status: 'unavailable', reason: 'Your browser does not support location services.' });
      return;
    }
    setState({ status: 'requesting' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          status: 'ready',
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracyMeters: pos.coords.accuracy ?? 0,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setState({ status: 'denied' });
        } else {
          setState({ status: 'unavailable', reason: err.message || 'Could not determine your location.' });
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { state, request, reset };
}
