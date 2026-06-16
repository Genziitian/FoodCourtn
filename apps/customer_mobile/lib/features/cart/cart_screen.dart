// Cart screen with the same line-edit + 3-way order-type segmented control
// the web app exposes. Place-order delegates to the same Edge Function.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../data/repository.dart';
import '../auth/auth_controller.dart';
import '../restaurant/restaurant_providers.dart';
import 'cart_controller.dart';

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});
  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen> {
  bool _placing = false;
  String? _err;

  Future<void> _place(String restaurantId) async {
    final cart = ref.read(cartProvider);
    final user = ref.read(authProvider).user;
    if (cart.isEmpty) return;

    setState(() { _placing = true; _err = null; });

    final isTakeaway = cart.orderType == OrderType.takeaway;
    final isDelivery = cart.orderType == OrderType.delivery;

    final parcelCharges = isTakeaway
        ? cart.lines.fold<double>(0, (s, l) => s + l.parcelChargePerUnit * l.qty)
        : 0.0;
    final deliveryCharges = isDelivery
        ? cart.lines.fold<double>(0, (s, l) => s + l.deliveryChargePerUnit * l.qty)
        : 0.0;
    final subtotal = cart.subtotal;
    final taxes = subtotal * 0.05;
    final total = subtotal + parcelCharges + deliveryCharges + taxes;

    final breakdown = {
      'subtotal': subtotal,
      'discount': 0,
      'parcel_charges': parcelCharges,
      'delivery_charges': deliveryCharges,
      'platform_fee': 0,
      'taxes': taxes,
      'coins_used': 0,
      'total': total,
      'applied_coupon': null,
    };

    try {
      await ref.read(repositoryProvider).placeOrder(
            restaurantId: restaurantId,
            tableId: cart.tableId,
            orderType: cart.orderType.wire,
            cartLines: cart.lines.map((l) => l.toMap()).toList(),
            breakdown: breakdown,
            customerNotes: cart.customerNotes,
            customerId: user?.isGuest == true ? null : user?.id,
          );
      if (!mounted) return;
      ref.read(cartProvider.notifier).clear();
      context.go('/order/placed');
    } catch (e) {
      setState(() { _err = e.toString(); _placing = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final restaurant = ref.watch(restaurantProvider).asData?.value?.id;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Your cart'),
        actions: [
          if (cart.isNotEmpty)
            TextButton(
              onPressed: () => ref.read(cartProvider.notifier).clear(),
              child: const Text('Clear', style: TextStyle(color: BrandColors.rose600)),
            ),
        ],
      ),
      body: cart.isEmpty
          ? const _EmptyCart()
          : Column(
              children: [
                Expanded(
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
                    children: [
                      _OrderTypeSelector(),
                      const SizedBox(height: 16),
                      ...cart.lines.map((l) => Card(
                            child: Padding(
                              padding: const EdgeInsets.all(12),
                              child: Row(children: [
                                Expanded(child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(l.name, style: const TextStyle(fontWeight: FontWeight.w700)),
                                    const SizedBox(height: 4),
                                    Text(rupee(l.unitPrice), style: const TextStyle(color: BrandColors.slate500, fontSize: 12)),
                                  ],
                                )),
                                Container(
                                  decoration: BoxDecoration(
                                    border: Border.all(color: BrandColors.brand500),
                                    borderRadius: BorderRadius.circular(999),
                                  ),
                                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                                    IconButton(
                                      icon: const Icon(Icons.remove, size: 16, color: BrandColors.brand700),
                                      onPressed: () => ref.read(cartProvider.notifier).decQty(l.menuItemId),
                                      constraints: const BoxConstraints(minWidth: 36, minHeight: 32),
                                      padding: EdgeInsets.zero,
                                    ),
                                    Text('${l.qty}', style: const TextStyle(fontWeight: FontWeight.w800, color: BrandColors.brand700)),
                                    IconButton(
                                      icon: const Icon(Icons.add, size: 16, color: BrandColors.brand700),
                                      onPressed: () => ref.read(cartProvider.notifier).incQty(l.menuItemId),
                                      constraints: const BoxConstraints(minWidth: 36, minHeight: 32),
                                      padding: EdgeInsets.zero,
                                    ),
                                  ]),
                                ),
                                const SizedBox(width: 10),
                                SizedBox(
                                  width: 60,
                                  child: Text(rupee(l.lineTotal), textAlign: TextAlign.right, style: const TextStyle(fontWeight: FontWeight.w800)),
                                ),
                              ]),
                            ),
                          )),
                      const SizedBox(height: 16),
                      _BillSummary(),
                      if (_err != null) ...[
                        const SizedBox(height: 12),
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(color: const Color(0xFFFEE2E2), borderRadius: BorderRadius.circular(10)),
                          child: Text(_err!, style: const TextStyle(color: BrandColors.rose600, fontSize: 13)),
                        ),
                      ],
                    ],
                  ),
                ),
                SafeArea(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                    child: FilledButton(
                      onPressed: (restaurant != null && !_placing) ? () => _place(restaurant) : null,
                      child: _placing
                          ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                          : Text('Place order · ${rupee(cart.subtotal)}'),
                    ),
                  ),
                ),
              ],
            ),
    );
  }
}

class _OrderTypeSelector extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final type = ref.watch(cartProvider).orderType;
    Widget seg(OrderType t, String label, IconData icon) => Expanded(
          child: GestureDetector(
            onTap: () => ref.read(cartProvider.notifier).setOrderType(t),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: type == t ? Colors.white : Colors.transparent,
                borderRadius: BorderRadius.circular(999),
                boxShadow: type == t ? const [BoxShadow(blurRadius: 4, color: Colors.black12)] : null,
              ),
              child: Column(children: [
                Icon(icon, size: 18, color: type == t ? BrandColors.brand700 : BrandColors.slate500),
                const SizedBox(height: 2),
                Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: type == t ? BrandColors.slate900 : BrandColors.slate500)),
              ]),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: BrandColors.slate100, borderRadius: BorderRadius.circular(999)),
      child: Row(children: [
        seg(OrderType.dineIn, 'Dine-in', Icons.restaurant_outlined),
        seg(OrderType.takeaway, 'Takeaway', Icons.shopping_bag_outlined),
        seg(OrderType.delivery, 'Delivery', Icons.delivery_dining_outlined),
      ]),
    );
  }
}

class _BillSummary extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cart = ref.watch(cartProvider);
    final isTakeaway = cart.orderType == OrderType.takeaway;
    final isDelivery = cart.orderType == OrderType.delivery;
    final parcel = isTakeaway ? cart.lines.fold<double>(0, (s, l) => s + l.parcelChargePerUnit * l.qty) : 0.0;
    final delivery = isDelivery ? cart.lines.fold<double>(0, (s, l) => s + l.deliveryChargePerUnit * l.qty) : 0.0;
    final taxes = cart.subtotal * 0.05;
    final total = cart.subtotal + parcel + delivery + taxes;
    Widget row(String l, num v, {bool bold = false}) => Padding(
          padding: const EdgeInsets.symmetric(vertical: 3),
          child: Row(children: [
            Expanded(child: Text(l, style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w500, color: bold ? BrandColors.slate900 : BrandColors.slate600))),
            Text(rupee(v), style: TextStyle(fontWeight: bold ? FontWeight.w800 : FontWeight.w600)),
          ]),
        );
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(children: [
          row('Subtotal', cart.subtotal),
          if (parcel > 0) row('Parcel charges', parcel),
          if (delivery > 0) row('Delivery charges', delivery),
          row('Taxes', taxes),
          const Divider(),
          row('Total', total, bold: true),
        ]),
      ),
    );
  }
}

class _EmptyCart extends StatelessWidget {
  const _EmptyCart();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.shopping_basket_outlined, size: 56, color: BrandColors.slate400),
        const SizedBox(height: 12),
        const Text('Your cart is empty.', style: TextStyle(color: BrandColors.slate600, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        TextButton(onPressed: () => Navigator.of(context).maybePop(), child: const Text('Back to menu')),
      ]),
    );
  }
}

