// Menu — categories chip row + items list. Tap an item to add to cart.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../../data/models.dart';
import '../cart/cart_controller.dart';
import '../restaurant/restaurant_providers.dart';

class MenuScreen extends ConsumerStatefulWidget {
  const MenuScreen({super.key, this.qrToken});
  final String? qrToken;

  @override
  ConsumerState<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends ConsumerState<MenuScreen> {
  String _activeCat = 'all';

  @override
  Widget build(BuildContext context) {
    final restaurantAsync = ref.watch(restaurantProvider);
    final catsAsync = ref.watch(categoriesProvider);
    final itemsAsync = ref.watch(menuItemsProvider);
    final cart = ref.watch(cartProvider);

    return Scaffold(
      appBar: AppBar(
        title: restaurantAsync.when(
          data: (r) => Text(r?.name ?? 'Menu'),
          loading: () => const Text('Menu'),
          error: (_, __) => const Text('Menu'),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.person_outline, color: BrandColors.slate700),
            onPressed: () => context.push('/profile'),
          ),
        ],
      ),
      body: Column(
        children: [
          catsAsync.when(
            loading: () => const SizedBox(height: 4, child: LinearProgressIndicator()),
            error: (e, _) => Padding(padding: const EdgeInsets.all(12), child: Text('$e')),
            data: (cats) => SizedBox(
              height: 50,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                children: [
                  _CategoryChip(label: 'All', active: _activeCat == 'all', onTap: () => setState(() => _activeCat = 'all')),
                  if (itemsAsync.asData?.value.any((i) => i.isCombo) ?? false)
                    _CategoryChip(label: '🎁 Combos', active: _activeCat == 'combos', onTap: () => setState(() => _activeCat = 'combos')),
                  for (final c in cats)
                    _CategoryChip(label: c.name, active: _activeCat == c.id, onTap: () => setState(() => _activeCat = c.id)),
                ],
              ),
            ),
          ),
          Expanded(
            child: itemsAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(child: Text('Could not load menu: $e')),
              data: (items) {
                final filtered = items.where((i) {
                  if (_activeCat == 'all') return true;
                  if (_activeCat == 'combos') return i.isCombo;
                  return i.categoryId == _activeCat;
                }).toList();
                if (filtered.isEmpty) {
                  return const Center(child: Text('Nothing here yet.'));
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 100),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    final item = filtered[i];
                    final inCart = cart.lines.where((l) => l.menuItemId == item.id).fold(0, (s, l) => s + l.qty);
                    return _ItemCard(item: item, inCart: inCart);
                  },
                );
              },
            ),
          ),
        ],
      ),
      floatingActionButton: cart.isEmpty
          ? null
          : FloatingActionButton.extended(
              onPressed: () => context.push('/cart'),
              backgroundColor: BrandColors.brand600,
              icon: const Icon(Icons.shopping_bag_outlined, color: Colors.white),
              label: Text('${cart.itemCount} · ${rupee(cart.subtotal)} · View cart',
                  style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
            ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  const _CategoryChip({required this.label, required this.active, required this.onTap});
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          decoration: BoxDecoration(
            color: active ? BrandColors.brand600 : Colors.white,
            border: Border.all(color: active ? BrandColors.brand600 : BrandColors.slate200),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(label,
              style: TextStyle(
                color: active ? Colors.white : BrandColors.slate700,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              )),
        ),
      ),
    );
  }
}

class _ItemCard extends ConsumerWidget {
  const _ItemCard({required this.item, required this.inCart});
  final MenuItem item;
  final int inCart;

  Color get _markerColor => switch (item.foodType) {
        'veg' => const Color(0xFF16A34A),
        'egg' => const Color(0xFFCA8A04),
        _ => const Color(0xFFE11D48),
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                      width: 14, height: 14,
                      decoration: BoxDecoration(border: Border.all(color: _markerColor, width: 1.5), borderRadius: BorderRadius.circular(3)),
                      alignment: Alignment.center,
                      child: Container(width: 7, height: 7, decoration: BoxDecoration(color: _markerColor, shape: BoxShape.circle)),
                    ),
                    const SizedBox(width: 6),
                    if (item.isBestseller)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(color: const Color(0xFFFEF3C7), borderRadius: BorderRadius.circular(4)),
                        child: const Text('★ BESTSELLER', style: TextStyle(color: Color(0xFF92400E), fontSize: 9, fontWeight: FontWeight.w800)),
                      ),
                  ]),
                  const SizedBox(height: 6),
                  Text(item.name, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                  if ((item.description ?? '').isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(item.description!,
                        maxLines: 2, overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12, color: BrandColors.slate500)),
                  ],
                  const SizedBox(height: 8),
                  Text(rupee(item.basePrice), style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Column(
              children: [
                Container(
                  width: 96, height: 96,
                  decoration: BoxDecoration(
                    color: BrandColors.slate100,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  clipBehavior: Clip.antiAlias,
                  child: item.imageUrl != null
                      ? CachedNetworkImage(imageUrl: item.imageUrl!, fit: BoxFit.cover,
                          errorWidget: (_, __, ___) => const Icon(Icons.fastfood_outlined, color: BrandColors.slate400))
                      : const Icon(Icons.fastfood_outlined, color: BrandColors.slate400),
                ),
                const SizedBox(height: 6),
                if (inCart == 0)
                  OutlinedButton(
                    onPressed: item.inStock ? () => ref.read(cartProvider.notifier).addItem(item) : null,
                    style: OutlinedButton.styleFrom(
                      foregroundColor: BrandColors.brand700,
                      side: const BorderSide(color: BrandColors.brand500),
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                    ),
                    child: Text(item.inStock ? 'ADD' : 'OUT'),
                  )
                else
                  Container(
                    decoration: BoxDecoration(
                      color: BrandColors.brand600,
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.remove, color: Colors.white, size: 16),
                          onPressed: () => ref.read(cartProvider.notifier).decQty(item.id),
                          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                          padding: EdgeInsets.zero,
                        ),
                        Text('$inCart', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800)),
                        IconButton(
                          icon: const Icon(Icons.add, color: Colors.white, size: 16),
                          onPressed: () => ref.read(cartProvider.notifier).incQty(item.id),
                          constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                          padding: EdgeInsets.zero,
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
