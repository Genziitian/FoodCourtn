// Placeholder smoke test. We don't boot the real app here because main.dart
// initialises Supabase + dotenv, which would fail in the bare test harness.
// Add real screen tests in feature folders alongside their widgets.

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('placeholder', () {
    expect(1 + 1, 2);
  });
}
