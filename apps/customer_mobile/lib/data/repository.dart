// Repository — every Supabase query the customer app needs.
// Riverpod providers are defined where they're consumed; this file is pure
// data access and is unit-testable in isolation.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../core/supabase.dart';
import 'models.dart';

class Repository {
  Repository(this._sb);
  final SupabaseClient _sb;

  // ──────────────────────── Restaurant ────────────────────────

  Future<Restaurant?> getRestaurantBySlug(String slug) async {
    final row = await _sb
        .from('restaurants')
        .select()
        .eq('slug', slug)
        .maybeSingle();
    if (row == null) return null;
    return Restaurant.fromMap(row);
  }

  // ──────────────────────── Tables ────────────────────────

  Future<DiningTable?> getTableByToken(String restaurantId, String qrToken) async {
    final row = await _sb
        .from('dining_tables')
        .select('id, label, qr_token, is_active')
        .eq('restaurant_id', restaurantId)
        .eq('qr_token', qrToken)
        .maybeSingle();
    if (row == null) return null;
    return DiningTable.fromMap(row);
  }

  Future<List<DiningTable>> listActiveTables(String restaurantId) async {
    final rows = await _sb
        .from('dining_tables')
        .select('id, label, qr_token, is_active')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('label');
    return (rows as List).map((r) => DiningTable.fromMap(r as Map<String, dynamic>)).toList();
  }

  // ──────────────────────── Menu ────────────────────────

  Future<List<Category>> listCategories(String restaurantId) async {
    final rows = await _sb
        .from('categories')
        .select('id, name, sort_order')
        .eq('restaurant_id', restaurantId)
        .order('sort_order');
    return (rows as List).map((r) => Category.fromMap(r as Map<String, dynamic>)).toList();
  }

  Future<List<MenuItem>> listMenuItems(String restaurantId) async {
    // Try with combo_items; fall back if the column hasn't been migrated.
    try {
      final rows = await _sb
          .from('menu_items')
          .select('id, restaurant_id, category_id, name, description, image_url, '
              'base_price, parcel_charge, delivery_charge, food_type, rating, '
              'rating_count, is_bestseller, is_recommended, is_combo, combo_items, '
              'in_stock, sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order');
      return (rows as List).map((r) => MenuItem.fromMap(r as Map<String, dynamic>)).toList();
    } on PostgrestException catch (e) {
      if (!RegExp(r'column.*combo_items', caseSensitive: false).hasMatch(e.message)) rethrow;
      final rows = await _sb
          .from('menu_items')
          .select('id, restaurant_id, category_id, name, description, image_url, '
              'base_price, parcel_charge, delivery_charge, food_type, rating, '
              'rating_count, is_bestseller, is_recommended, is_combo, in_stock, sort_order')
          .eq('restaurant_id', restaurantId)
          .order('sort_order');
      return (rows as List).map((r) => MenuItem.fromMap(r as Map<String, dynamic>)).toList();
    }
  }

  // ──────────────────────── Orders ────────────────────────

  Future<String> placeOrder({
    required String restaurantId,
    String? tableId,
    required String orderType, // 'dine_in' | 'takeaway' | 'delivery'
    required List<Map<String, dynamic>> cartLines,
    required Map<String, dynamic> breakdown,
    String? customerNotes,
    String? customerId,
  }) async {
    // Mirrors the place-order Edge Function the web app uses.
    final res = await _sb.functions.invoke('place-order', body: {
      'restaurant_id': restaurantId,
      'table_id': tableId,
      'customer_id': customerId,
      'order_type': orderType,
      'cart': {'lines': cartLines, 'order_type': orderType},
      'breakdown': breakdown,
      'customer_notes': customerNotes,
    });
    final data = res.data as Map<String, dynamic>;
    if (data['order_id'] == null) {
      throw Exception(data['error'] ?? 'place-order failed');
    }
    return data['order_id'] as String;
  }
}

final repositoryProvider = Provider<Repository>((ref) {
  return Repository(ref.read(supabaseProvider));
});
