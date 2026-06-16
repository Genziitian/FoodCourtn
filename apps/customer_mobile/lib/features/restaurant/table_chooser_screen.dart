// Mirror of apps/customer/src/pages/TableChooser.tsx. Used when the branch
// is in qr_mode='single' — one poster QR scans into here and the customer
// picks a table from the dropdown.

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../cart/cart_controller.dart';
import 'restaurant_providers.dart';

class TableChooserScreen extends ConsumerStatefulWidget {
  const TableChooserScreen({super.key});
  @override
  ConsumerState<TableChooserScreen> createState() => _TableChooserScreenState();
}

class _TableChooserScreenState extends ConsumerState<TableChooserScreen> {
  String? _selected;

  @override
  Widget build(BuildContext context) {
    final restaurantAsync = ref.watch(restaurantProvider);
    final tablesAsync = ref.watch(activeTablesProvider);

    return Scaffold(
      body: restaurantAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Could not load: $e')),
        data: (restaurant) {
          if (restaurant == null) {
            return const Center(child: Text('Restaurant not found.'));
          }
          final hero = restaurant.heroImages.isNotEmpty ? restaurant.heroImages.first : restaurant.heroImage;
          return CustomScrollView(
            slivers: [
              SliverAppBar(
                expandedHeight: 220,
                pinned: true,
                backgroundColor: Colors.transparent,
                flexibleSpace: FlexibleSpaceBar(
                  background: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (hero != null)
                        CachedNetworkImage(imageUrl: hero, fit: BoxFit.cover, errorWidget: (_, __, ___) => Container(color: BrandColors.slate200))
                      else
                        Container(color: BrandColors.slate200),
                      const DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter, end: Alignment.bottomCenter,
                            colors: [Colors.transparent, Colors.black54],
                          ),
                        ),
                      ),
                      Positioned(
                        left: 20, right: 20, bottom: 18,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('WELCOME TO',
                                style: TextStyle(color: Colors.white70, fontSize: 11, letterSpacing: 1.5, fontWeight: FontWeight.w700)),
                            const SizedBox(height: 4),
                            Text(restaurant.name,
                                style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800)),
                            if (restaurant.areaName != null)
                              Text('${restaurant.areaName}${restaurant.city != null ? ', ${restaurant.city}' : ''}',
                                  style: const TextStyle(color: Colors.white70)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.all(16),
                sliver: SliverToBoxAdapter(
                  child: Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text('Which table are you at?',
                              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800)),
                          const SizedBox(height: 6),
                          const Text('Pick your table so we can route your order to the right server.',
                              style: TextStyle(color: BrandColors.slate500, fontSize: 13)),
                          const SizedBox(height: 18),
                          tablesAsync.when(
                            loading: () => const LinearProgressIndicator(),
                            error: (e, _) => Text('$e', style: const TextStyle(color: BrandColors.rose600)),
                            data: (tables) {
                              if (tables.isEmpty) {
                                return Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: BrandColors.amber50,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Text(
                                    'No tables registered yet. Ask staff, or continue as takeaway.',
                                    style: TextStyle(color: BrandColors.amber700, fontSize: 13),
                                  ),
                                );
                              }
                              return DropdownButtonFormField<String>(
                                value: _selected,
                                hint: const Text('— Choose your table —'),
                                items: tables.map((t) => DropdownMenuItem(value: t.qrToken, child: Text(t.label))).toList(),
                                onChanged: (v) => setState(() => _selected = v),
                              );
                            },
                          ),
                          const SizedBox(height: 18),
                          FilledButton(
                            onPressed: _selected == null ? null : () {
                              ref.read(cartProvider.notifier).setOrderType(OrderType.dineIn);
                              // The downstream Menu screen will resolve qr_token → table_id.
                              context.go('/menu?qr=${Uri.encodeComponent(_selected!)}');
                            },
                            child: const Text('Continue to menu'),
                          ),
                          const SizedBox(height: 10),
                          OutlinedButton(
                            onPressed: () {
                              ref.read(cartProvider.notifier).setOrderType(OrderType.takeaway);
                              ref.read(cartProvider.notifier).setTable(null);
                              context.go('/menu');
                            },
                            child: const Text('Order takeaway instead'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}
