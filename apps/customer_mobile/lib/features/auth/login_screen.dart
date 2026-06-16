import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme.dart';
import 'auth_controller.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.redirectTo});
  final String? redirectTo;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

enum _Step { phone, otp }

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneCtrl = TextEditingController();
  final _otpCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  _Step _step = _Step.phone;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _phoneCtrl.dispose();
    _otpCtrl.dispose();
    _nameCtrl.dispose();
    super.dispose();
  }

  Future<void> _sendOtp() async {
    final phone = _phoneCtrl.text.trim();
    if (phone.length < 10) {
      setState(() => _error = 'Enter a 10-digit phone number.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).sendOtp(phone);
      setState(() { _step = _Step.otp; _busy = false; });
    } catch (e) {
      setState(() { _error = e.toString(); _busy = false; });
    }
  }

  Future<void> _verifyOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.length < 4) {
      setState(() => _error = 'Enter the OTP you received.');
      return;
    }
    setState(() { _busy = true; _error = null; });
    try {
      await ref.read(authProvider.notifier).verifyOtp(
        _phoneCtrl.text.trim(),
        code,
        name: _nameCtrl.text.trim().isEmpty ? null : _nameCtrl.text.trim(),
      );
      if (mounted) _bounce();
    } catch (e) {
      setState(() { _error = e.toString(); _busy = false; });
    }
  }

  Future<void> _guest() async {
    setState(() { _busy = true; _error = null; });
    await ref.read(authProvider.notifier).signInAsGuest();
    if (mounted) _bounce();
  }

  void _bounce() {
    final dest = widget.redirectTo ?? '/';
    context.go(dest);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 24),
              Row(
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [BrandColors.brand500, BrandColors.brand700],
                      ),
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Text('FoodCourt',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: BrandColors.slate900)),
                ],
              ),
              const SizedBox(height: 36),
              Text(
                _step == _Step.phone ? 'Sign in to order' : 'Enter the code',
                style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w800, color: BrandColors.slate900),
              ),
              const SizedBox(height: 8),
              Text(
                _step == _Step.phone
                    ? 'We\'ll send a one-time code to your phone.'
                    : 'Code sent to ${_phoneCtrl.text}.',
                style: const TextStyle(color: BrandColors.slate500),
              ),
              const SizedBox(height: 24),
              if (_step == _Step.phone)
                TextField(
                  controller: _phoneCtrl,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(
                    labelText: 'Phone',
                    prefixText: '+91 ',
                    hintText: '98xxxxxxxx',
                  ),
                )
              else ...[
                TextField(
                  controller: _otpCtrl,
                  keyboardType: TextInputType.number,
                  textAlign: TextAlign.center,
                  decoration: const InputDecoration(labelText: 'OTP', hintText: '000000'),
                  style: const TextStyle(letterSpacing: 6, fontSize: 22, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(labelText: 'Your name (optional)'),
                ),
              ],
              if (_error != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEE2E2),
                    border: Border.all(color: const Color(0xFFFCA5A5)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(_error!, style: const TextStyle(color: BrandColors.rose600, fontSize: 13)),
                ),
              ],
              const SizedBox(height: 18),
              FilledButton(
                onPressed: _busy ? null : (_step == _Step.phone ? _sendOtp : _verifyOtp),
                child: _busy
                    ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                    : Text(_step == _Step.phone ? 'Send OTP' : 'Verify & continue'),
              ),
              if (_step == _Step.otp) ...[
                TextButton(
                  onPressed: _busy ? null : () => setState(() { _step = _Step.phone; _error = null; }),
                  child: const Text('Change number', style: TextStyle(color: BrandColors.brand700)),
                ),
              ],
              const SizedBox(height: 10),
              const Row(children: [
                Expanded(child: Divider(color: BrandColors.slate200)),
                Padding(padding: EdgeInsets.symmetric(horizontal: 10), child: Text('OR', style: TextStyle(color: BrandColors.slate400))),
                Expanded(child: Divider(color: BrandColors.slate200)),
              ]),
              const SizedBox(height: 10),
              OutlinedButton(
                onPressed: _busy ? null : _guest,
                child: const Text('Continue as guest'),
              ),
              const Spacer(),
              const Padding(
                padding: EdgeInsets.only(bottom: 8),
                child: Text(
                  'Guests can order but can\'t earn FoodCoins or use coupons.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: BrandColors.slate400, fontSize: 12),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
