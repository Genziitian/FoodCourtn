// GoRouter setup with an auth gate. Mirrors the web app's route structure
// (Login, Menu, Cart, Profile) plus the single-QR /scan landing.

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/auth_controller.dart';
import '../features/auth/login_screen.dart';
import '../features/cart/cart_screen.dart';
import '../features/menu/menu_screen.dart';
import '../features/orders/order_placed_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/restaurant/table_chooser_screen.dart';

GoRouter buildRouter(Ref ref) {
  return GoRouter(
    // Default entry is the menu. /scan is only hit when a customer arrives via
    // a single-QR poster deep-link or types it explicitly — it's not where
    // every app launch should land.
    initialLocation: '/menu',
    refreshListenable: _AuthListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      if (auth.initialising) return null;
      final loggingIn = state.matchedLocation == '/login';
      final isPublic = state.matchedLocation == '/scan' || loggingIn;
      if (!auth.signedIn && !isPublic) {
        return '/login?from=${Uri.encodeComponent(state.matchedLocation)}';
      }
      if (auth.signedIn && loggingIn) {
        final from = state.uri.queryParameters['from'];
        return from ?? '/menu';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/scan', builder: (_, __) => const TableChooserScreen()),
      GoRoute(
        path: '/login',
        builder: (_, st) => LoginScreen(redirectTo: st.uri.queryParameters['from']),
      ),
      GoRoute(
        path: '/menu',
        builder: (_, st) => MenuScreen(qrToken: st.uri.queryParameters['qr']),
      ),
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/order/placed', builder: (_, __) => const OrderPlacedScreen()),
      GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
    ],
  );
}

class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen(authProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
}

final routerProvider = Provider<GoRouter>((ref) => buildRouter(ref));
