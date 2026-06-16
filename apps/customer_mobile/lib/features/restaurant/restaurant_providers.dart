import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/env.dart';
import '../../data/models.dart';
import '../../data/repository.dart';

/// Selected branch slug — single source of truth shared by every screen.
/// Defaults to the env-configured demo slug; can be overridden via deep link
/// or after the user picks a branch on the (TODO) discover screen.
final activeSlugProvider = StateProvider<String>((ref) => Env.defaultRestaurantSlug);

final restaurantProvider = FutureProvider<Restaurant?>((ref) async {
  final slug = ref.watch(activeSlugProvider);
  return ref.read(repositoryProvider).getRestaurantBySlug(slug);
});

final categoriesProvider = FutureProvider<List<Category>>((ref) async {
  final r = await ref.watch(restaurantProvider.future);
  if (r == null) return const [];
  return ref.read(repositoryProvider).listCategories(r.id);
});

final menuItemsProvider = FutureProvider<List<MenuItem>>((ref) async {
  final r = await ref.watch(restaurantProvider.future);
  if (r == null) return const [];
  return ref.read(repositoryProvider).listMenuItems(r.id);
});

final activeTablesProvider = FutureProvider<List<DiningTable>>((ref) async {
  final r = await ref.watch(restaurantProvider.future);
  if (r == null) return const [];
  return ref.read(repositoryProvider).listActiveTables(r.id);
});
