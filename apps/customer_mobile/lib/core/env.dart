// Centralised env loader. Reads from assets/.env via flutter_dotenv.
// The real file is .gitignore'd; commit assets/.env.example with placeholders.

import 'package:flutter_dotenv/flutter_dotenv.dart';

class Env {
  static Future<void> load() async {
    await dotenv.load(fileName: 'assets/.env');
  }

  static String get supabaseUrl =>
      dotenv.env['SUPABASE_URL'] ?? (throw Exception('SUPABASE_URL missing in assets/.env'));
  static String get supabaseAnonKey =>
      dotenv.env['SUPABASE_ANON_KEY'] ?? (throw Exception('SUPABASE_ANON_KEY missing in assets/.env'));
  static String get defaultRestaurantSlug =>
      dotenv.env['DEFAULT_RESTAURANT_SLUG'] ?? 'the-spice-route';
}
