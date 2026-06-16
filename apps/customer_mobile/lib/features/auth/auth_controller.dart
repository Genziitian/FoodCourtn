// Customer auth — mirrors apps/customer/src/lib/auth.tsx.
//
// Two paths today:
//   - Guest sign-in (instant; no OTP; can't earn coins / use coupons).
//   - Phone OTP — delegated to the same `send-otp` + `verify-otp` Edge
//     Functions the web app uses (2factor.in under the hood).
//
// State is persisted to shared_preferences with a 7-day TTL (same window as
// the web app's localStorage TTL).

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/supabase.dart';

class CustomerUser {
  final String id;
  final String name;
  final String? phone;
  final bool isGuest;
  final int loyaltyBalance;

  CustomerUser({
    required this.id,
    required this.name,
    this.phone,
    this.isGuest = false,
    this.loyaltyBalance = 0,
  });

  Map<String, dynamic> toMap() => {
        'id': id,
        'name': name,
        'phone': phone,
        'isGuest': isGuest,
        'loyaltyBalance': loyaltyBalance,
      };

  factory CustomerUser.fromMap(Map<String, dynamic> m) => CustomerUser(
        id: m['id'] as String,
        name: m['name'] as String,
        phone: m['phone'] as String?,
        isGuest: (m['isGuest'] as bool?) ?? false,
        loyaltyBalance: (m['loyaltyBalance'] as int?) ?? 0,
      );
}

const _keyUser = 'fc_customer_user';
const _keyUserTs = 'fc_customer_user_ts';
const _ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days

class AuthState {
  final CustomerUser? user;
  final bool initialising;
  AuthState({this.user, this.initialising = true});

  AuthState copyWith({CustomerUser? user, bool? initialising, bool clearUser = false}) =>
      AuthState(
        user: clearUser ? null : (user ?? this.user),
        initialising: initialising ?? this.initialising,
      );

  bool get signedIn => user != null;
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(AuthState()) {
    _restore();
  }
  final Ref _ref;

  Future<void> _restore() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_keyUser);
    final tsStr = p.getString(_keyUserTs);
    if (raw == null || tsStr == null) {
      state = AuthState(initialising: false);
      return;
    }
    final ts = int.tryParse(tsStr) ?? 0;
    if (DateTime.now().millisecondsSinceEpoch - ts > _ttlMs) {
      await p.remove(_keyUser);
      await p.remove(_keyUserTs);
      state = AuthState(initialising: false);
      return;
    }
    final user = CustomerUser.fromMap(jsonDecode(raw) as Map<String, dynamic>);
    state = AuthState(user: user, initialising: false);
  }

  Future<void> _persist(CustomerUser u) async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_keyUser, jsonEncode(u.toMap()));
    await p.setString(_keyUserTs, '${DateTime.now().millisecondsSinceEpoch}');
  }

  Future<void> signInAsGuest({String? name}) async {
    final guest = CustomerUser(
      // Web app uses a synthetic 'guest-<ms>' id; matching that shape here.
      id: 'guest-${DateTime.now().millisecondsSinceEpoch}',
      name: (name ?? '').trim().isEmpty ? 'Guest' : name!.trim(),
      isGuest: true,
    );
    await _persist(guest);
    state = AuthState(user: guest, initialising: false);
  }

  /// Calls the send-otp Edge Function (delivered via 2factor.in upstream).
  Future<void> sendOtp(String phone) async {
    final sb = _ref.read(supabaseProvider);
    final res = await sb.functions.invoke('send-otp', body: {'phone': phone});
    final data = res.data as Map<String, dynamic>?;
    if (data?['ok'] != true) {
      throw Exception(data?['error'] ?? 'Could not send OTP');
    }
  }

  /// Verifies the OTP and creates/links a `customers` row.
  Future<void> verifyOtp(String phone, String code, {String? name}) async {
    final sb = _ref.read(supabaseProvider);
    final res = await sb.functions.invoke('verify-otp', body: {
      'phone': phone,
      'code': code,
      'name': name,
    });
    final data = res.data as Map<String, dynamic>?;
    if (data?['ok'] != true || data?['customer_id'] == null) {
      throw Exception(data?['error'] ?? 'Invalid OTP');
    }
    final user = CustomerUser(
      id: data!['customer_id'] as String,
      name: (data['name'] as String?) ?? (name ?? 'Customer'),
      phone: phone,
      loyaltyBalance: (data['loyalty_balance'] as int?) ?? 0,
    );
    await _persist(user);
    state = AuthState(user: user, initialising: false);
  }

  Future<void> signOut() async {
    final p = await SharedPreferences.getInstance();
    await p.remove(_keyUser);
    await p.remove(_keyUserTs);
    state = AuthState(user: null, initialising: false);
  }
}

final authProvider = StateNotifierProvider<AuthController, AuthState>((ref) => AuthController(ref));
