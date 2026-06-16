import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';

class OrderPlacedScreen extends StatelessWidget {
  const OrderPlacedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Spacer(),
              Container(
                width: 96, height: 96,
                decoration: const BoxDecoration(color: BrandColors.emerald600, shape: BoxShape.circle),
                child: const Icon(Icons.check, color: Colors.white, size: 56),
              ),
              const SizedBox(height: 28),
              const Text('Order placed!',
                  style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: BrandColors.slate900)),
              const SizedBox(height: 8),
              const Text(
                'The kitchen has it. We\'ll update you when it\'s ready.',
                textAlign: TextAlign.center,
                style: TextStyle(color: BrandColors.slate500, fontSize: 15),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: () => context.go('/menu'),
                  child: const Text('Back to menu'),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
