// Plain data classes matching the same Postgres columns the web app reads.
// Kept hand-rolled (no codegen) so it's obvious what each field maps to.

import 'dart:convert';

class Restaurant {
  final String id;
  final String slug;
  final String name;
  final String? heroImage;
  final List<String> heroImages;
  final List<String> menuHeroImages;
  final String? welcomeText;
  final bool isOpen;
  final String? areaName;
  final String? city;
  final String qrMode; // 'per_table' | 'single'
  final Map<String, dynamic> settings;

  Restaurant({
    required this.id,
    required this.slug,
    required this.name,
    this.heroImage,
    this.heroImages = const [],
    this.menuHeroImages = const [],
    this.welcomeText,
    required this.isOpen,
    this.areaName,
    this.city,
    required this.qrMode,
    required this.settings,
  });

  factory Restaurant.fromMap(Map<String, dynamic> m) {
    List<String> _list(dynamic v) {
      if (v == null) return const [];
      if (v is List) return v.whereType<String>().toList();
      return const [];
    }

    return Restaurant(
      id: m['id'] as String,
      slug: m['slug'] as String,
      name: m['name'] as String,
      heroImage: m['hero_image'] as String?,
      heroImages: _list(m['hero_images']),
      menuHeroImages: _list(m['menu_hero_images']),
      welcomeText: m['welcome_text'] as String?,
      isOpen: (m['is_open'] as bool?) ?? true,
      areaName: m['area_name'] as String?,
      city: m['city'] as String?,
      qrMode: (m['qr_mode'] as String?) ?? 'per_table',
      settings: (m['settings'] as Map?)?.cast<String, dynamic>() ?? const {},
    );
  }
}

class Category {
  final String id;
  final String name;
  final int sortOrder;
  Category({required this.id, required this.name, required this.sortOrder});

  factory Category.fromMap(Map<String, dynamic> m) => Category(
        id: m['id'] as String,
        name: m['name'] as String,
        sortOrder: (m['sort_order'] as int?) ?? 0,
      );
}

class MenuItem {
  final String id;
  final String restaurantId;
  final String categoryId;
  final String name;
  final String? description;
  final String? imageUrl;
  final double basePrice;
  final double parcelCharge;
  final double deliveryCharge;
  final String foodType; // 'veg' | 'non_veg' | 'egg'
  final double rating;
  final int ratingCount;
  final bool isBestseller;
  final bool isRecommended;
  final bool isCombo;
  final bool inStock;
  final List<Map<String, dynamic>> comboItems;

  MenuItem({
    required this.id,
    required this.restaurantId,
    required this.categoryId,
    required this.name,
    this.description,
    this.imageUrl,
    required this.basePrice,
    this.parcelCharge = 0,
    this.deliveryCharge = 0,
    required this.foodType,
    required this.rating,
    required this.ratingCount,
    required this.isBestseller,
    required this.isRecommended,
    this.isCombo = false,
    required this.inStock,
    this.comboItems = const [],
  });

  factory MenuItem.fromMap(Map<String, dynamic> m) {
    List<Map<String, dynamic>> _ci(dynamic v) {
      if (v == null) return const [];
      if (v is List) return v.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
      if (v is String) {
        try {
          final j = jsonDecode(v);
          if (j is List) return j.whereType<Map>().map((e) => e.cast<String, dynamic>()).toList();
        } catch (_) {}
      }
      return const [];
    }

    return MenuItem(
      id: m['id'] as String,
      restaurantId: m['restaurant_id'] as String,
      categoryId: m['category_id'] as String,
      name: m['name'] as String,
      description: m['description'] as String?,
      imageUrl: m['image_url'] as String?,
      basePrice: (m['base_price'] as num).toDouble(),
      parcelCharge: ((m['parcel_charge'] ?? 0) as num).toDouble(),
      deliveryCharge: ((m['delivery_charge'] ?? 0) as num).toDouble(),
      foodType: (m['food_type'] as String?) ?? 'veg',
      rating: ((m['rating'] ?? 0) as num).toDouble(),
      ratingCount: (m['rating_count'] as int?) ?? 0,
      isBestseller: (m['is_bestseller'] as bool?) ?? false,
      isRecommended: (m['is_recommended'] as bool?) ?? false,
      isCombo: (m['is_combo'] as bool?) ?? false,
      inStock: (m['in_stock'] as bool?) ?? true,
      comboItems: _ci(m['combo_items']),
    );
  }
}

class DiningTable {
  final String id;
  final String label;
  final String qrToken;
  final bool isActive;
  DiningTable({required this.id, required this.label, required this.qrToken, required this.isActive});

  factory DiningTable.fromMap(Map<String, dynamic> m) => DiningTable(
        id: m['id'] as String,
        label: m['label'] as String,
        qrToken: m['qr_token'] as String,
        isActive: (m['is_active'] as bool?) ?? true,
      );
}
