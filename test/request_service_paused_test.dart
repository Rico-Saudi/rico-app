import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/request_service.dart';

void main() {
  group('رفض المحل الموقف للطلبات', () {
    final now = DateTime(2026, 10, 4, 12);

    test('يقول متى يرجع المحل وكلمته', () {
      final body = jsonEncode({
        'error': 'orders_paused',
        'resumesAt': DateTime(2026, 10, 4, 18, 30).toUtc().toIso8601String(),
        'note': 'مسكّرين للجرد',
      });
      final message = RequestService.ordersPausedMessage(body, now: now)!;
      expect(message, contains('موقف استقبال الطلبات'));
      expect(message, contains('6:30م'));
      expect(message, contains('«مسكّرين للجرد»'));
    });

    test('يذكر اليوم إذا الرجوع مو اليوم', () {
      final body = jsonEncode({'error': 'orders_paused', 'resumesAt': DateTime(2026, 10, 5, 9).toUtc().toIso8601String()});
      expect(RequestService.ordersPausedMessage(body, now: now), contains('5/10 الساعة 9:00ص'));
    });

    test('موقف لين يفتح: بلا وقت', () {
      final message = RequestService.ordersPausedMessage(jsonEncode({'error': 'orders_paused', 'resumesAt': null}), now: now)!;
      expect(message, isNot(contains('يرجع')));
    });

    test('يتجاهل أي رفض ثاني أو جسم مو JSON', () {
      expect(RequestService.ordersPausedMessage(jsonEncode({'error': 'invalid_stage_transition'})), isNull);
      expect(RequestService.ordersPausedMessage('<html>'), isNull);
    });
  });
}
