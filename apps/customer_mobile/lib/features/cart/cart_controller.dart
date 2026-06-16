// Cart state — single-restaurant, single-table. Mirrors the cart structure
// the web app's place-order Edge Function expects.

import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../data/models.dart';

class CartLine {
  final String menuItemId;
  final String name;
  final String? imageUrl;
  final double unitPrice;
  final int qty;
  final double parcelChargePerUnit;
  final double deliveryChargePerUnit;
  final String foodType;
  final bool isCombo;

  CartLine({
    required this.menuItemId,
    required this.name,
    this.imageUrl,
    required this.unitPrice,
    required this.qty,
    this.parcelChargePerUnit = 0,
    this.deliveryChargePerUnit = 0,
    required this.foodType,
    this.isCombo = false,
  });

  double get lineTotal => unitPrice * qty;

  CartLine copyWith({int? qty}) => CartLine(
        menuItemId: menuItemId,
        name: name,
        imageUrl: imageUrl,
        unitPrice: unitPrice,
        qty: qty ?? this.qty,
        parcelChargePerUnit: parcelChargePerUnit,
        deliveryChargePerUnit: deliveryChargePerUnit,
        foodType: foodType,
        isCombo: isCombo,
      );

  Map<String, dynamic> toMap() => {
        'menu_item_id': menuItemId,
        'name': name,
        'image_url': imageUrl,
        'unit_price': unitPrice,
        'qty': qty,
        'line_total': lineTotal,
        'parcel_charge_per_unit': parcelChargePerUnit,
        'delivery_charge_per_unit': deliveryChargePerUnit,
        'food_type': foodType,
        'is_combo': isCombo,
      };

  factory CartLine.fromMap(Map<String, dynamic> m) => CartLine(
        menuItemId: m['menu_item_id'] as String,
        name: m['name'] as String,
        imageUrl: m['image_url'] as String?,
        unitPrice: (m['unit_price'] as num).toDouble(),
        qty: (m['qty'] as int?) ?? 1,
        parcelChargePerUnit: ((m['parcel_charge_per_unit'] ?? 0) as num).toDouble(),
        deliveryChargePerUnit: ((m['delivery_charge_per_unit'] ?? 0) as num).toDouble(),
        foodType: (m['food_type'] as String?) ?? 'veg',
        isCombo: (m['is_combo'] as bool?) ?? false,
      );
}

enum OrderType { dineIn, takeaway, delivery }

extension OrderTypeX on OrderType {
  String get wire => switch (this) {
        OrderType.dineIn => 'dine_in',
        OrderType.takeaway => 'takeaway',
        OrderType.delivery => 'delivery',
      };
}

class CartState {
  final List<CartLine> lines;
  final OrderType orderType;
  final String? tableId;
  final String? customerNotes;

  CartState({
    this.lines = const [],
    this.orderType = OrderType.dineIn,
    this.tableId,
    this.customerNotes,
  });

  double get subtotal => lines.fold(0, (s, l) => s + l.lineTotal);
  int get itemCount => lines.fold(0, (s, l) => s + l.qty);
  bool get isEmpty => lines.isEmpty;
  bool get isNotEmpty => lines.isNotEmpty;

  CartState copyWith({
    List<CartLine>? lines,
    OrderType? orderType,
    String? tableId,
    String? customerNotes,
    bool clearTable = false,
  }) =>
      CartState(
        lines: lines ?? this.lines,
        orderType: orderType ?? this.orderType,
        tableId: clearTable ? null : (tableId ?? this.tableId),
        customerNotes: customerNotes ?? this.customerNotes,
      );

  Map<String, dynamic> toMap() => {
        'lines': lines.map((l) => l.toMap()).toList(),
        'order_type': orderType.wire,
        'table_id': tableId,
        'customer_notes': customerNotes,
      };
}

const _keyCart = 'fc_cart';

class CartController extends StateNotifier<CartState> {
  CartController() : super(CartState()) {
    _restore();
  }

  Future<void> _restore() async {
    final p = await SharedPreferences.getInstance();
    final raw = p.getString(_keyCart);
    if (raw == null) return;
    try {
      final m = jsonDecode(raw) as Map<String, dynamic>;
      final lines = ((m['lines'] as List?) ?? const [])
          .map((e) => CartLine.fromMap(e as Map<String, dynamic>))
          .toList();
      final ot = (m['order_type'] as String?) ?? 'dine_in';
      state = CartState(
        lines: lines,
        orderType: switch (ot) {
          'takeaway' => OrderType.takeaway,
          'delivery' => OrderType.delivery,
          _ => OrderType.dineIn,
        },
        tableId: m['table_id'] as String?,
        customerNotes: m['customer_notes'] as String?,
      );
    } catch (_) { /* corrupt cart — ignore */ }
  }

  Future<void> _persist() async {
    final p = await SharedPreferences.getInstance();
    await p.setString(_keyCart, jsonEncode(state.toMap()));
  }

  void addItem(MenuItem item) {
    final idx = state.lines.indexWhere((l) => l.menuItemId == item.id);
    if (idx >= 0) {
      final next = [...state.lines];
      next[idx] = next[idx].copyWith(qty: next[idx].qty + 1);
      state = state.copyWith(lines: next);
    } else {
      state = state.copyWith(lines: [
        ...state.lines,
        CartLine(
          menuItemId: item.id,
          name: item.name,
          imageUrl: item.imageUrl,
          unitPrice: item.basePrice,
          qty: 1,
          parcelChargePerUnit: item.parcelCharge,
          deliveryChargePerUnit: item.deliveryCharge,
          foodType: item.foodType,
          isCombo: item.isCombo,
        ),
      ]);
    }
    _persist();
  }

  void incQty(String menuItemId) {
    state = state.copyWith(
      lines: state.lines
          .map((l) => l.menuItemId == menuItemId ? l.copyWith(qty: l.qty + 1) : l)
          .toList(),
    );
    _persist();
  }

  void decQty(String menuItemId) {
    state = state.copyWith(
      lines: state.lines
          .map((l) => l.menuItemId == menuItemId ? l.copyWith(qty: l.qty - 1) : l)
          .where((l) => l.qty > 0)
          .toList(),
    );
    _persist();
  }

  void remove(String menuItemId) {
    state = state.copyWith(lines: state.lines.where((l) => l.menuItemId != menuItemId).toList());
    _persist();
  }

  void setOrderType(OrderType t) {
    state = state.copyWith(orderType: t);
    _persist();
  }

  void setTable(String? tableId) {
    state = state.copyWith(tableId: tableId, clearTable: tableId == null);
    _persist();
  }

  void clear() {
    state = CartState(orderType: state.orderType, tableId: state.tableId);
    _persist();
  }
}

final cartProvider = StateNotifierProvider<CartController, CartState>((ref) => CartController());
