import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/llm_intent_service.dart';

void main() {
  group('keyword and area from the classifier', () {
    test('reach the search intent', () {
      final intent = ResolvedIntent(kind: 'place', category: 'restaurant', keyword: 'مندي', area: 'النرجس').toQueryIntent()!;
      expect(intent.slug, 'restaurant');
      expect(intent.keyword, 'مندي');
      expect(intent.area, 'النرجس');
    });

    test('name what was actually looked for', () {
      final intent = ResolvedIntent(kind: 'place', category: 'restaurant', keyword: 'مندي', area: 'النرجس').toQueryIntent()!;
      expect(intent.displayLabel, '${intent.label} مندي في النرجس');
    });

    test('leave the label alone when absent', () {
      final intent = ResolvedIntent(kind: 'place', category: 'cafe').toQueryIntent()!;
      expect(intent.displayLabel, intent.label);
    });
  });
}
