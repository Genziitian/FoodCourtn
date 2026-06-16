// Profile placeholder — full feature set (orders, coupons, FoodCoins,
// addresses) lands in follow-up sessions.

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import '../auth/auth_controller.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).user;
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Row(children: [
                CircleAvatar(
                  radius: 26,
                  backgroundColor: BrandColors.brand100,
                  child: Text(
                    (user?.name.isNotEmpty ?? false) ? user!.name[0].toUpperCase() : '?',
                    style: const TextStyle(color: BrandColors.brand700, fontWeight: FontWeight.w800, fontSize: 22),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(user?.name ?? 'Guest', style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 17)),
                    if (user?.phone != null) Text(user!.phone!, style: const TextStyle(color: BrandColors.slate500)),
                    if (user?.isGuest == true)
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: Text('Guest session', style: TextStyle(color: BrandColors.amber700, fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                  ]),
                ),
              ]),
            ),
          ),
          const SizedBox(height: 16),
          if (user?.isGuest == false)
            Card(
              child: ListTile(
                leading: const Icon(Icons.monetization_on_outlined, color: BrandColors.brand700),
                title: const Text('FoodCoins'),
                trailing: Text('${user?.loyaltyBalance ?? 0}', style: const TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          const SizedBox(height: 8),
          Card(
            child: Column(children: [
              ListTile(
                leading: const Icon(Icons.history),
                title: const Text('Order history'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Order history — coming in the next session.')),
                ),
              ),
              const Divider(height: 1),
              ListTile(
                leading: const Icon(Icons.logout, color: BrandColors.rose600),
                title: const Text('Sign out', style: TextStyle(color: BrandColors.rose600)),
                onTap: () async {
                  await ref.read(authProvider.notifier).signOut();
                  if (context.mounted) context.go('/login');
                },
              ),
            ]),
          ),
        ],
      ),
    );
  }
}
