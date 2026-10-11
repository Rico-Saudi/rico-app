import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/models/place_result.dart';
import 'package:rico_app/widgets/place_photo.dart';
import 'package:rico_app/widgets/place_result_card.dart';

/// البطاقة صارت تعرض صورة فوق النص، وثماني منها تُبنى في رد واحد — فالمهم
/// التأكد أن تخطيطها يصمد في الحالتين: مكان بصورة ومكان بلا صورة.
void main() {
  PlaceResult place({String? photoUrl, String? category}) => PlaceResult(
        osmId: 'abc123',
        name: 'كافيه الاختبار',
        address: 'طريق الملك فهد',
        lat: 24.7,
        lng: 46.6,
        distanceMeters: 320,
        rating: 4.6,
        ratingCount: 120,
        photoUrl: photoUrl,
        categorySlug: category,
      );

  Widget wrap(Widget child) => MaterialApp(
        locale: const Locale('ar', 'SA'),
        home: Directionality(
          textDirection: TextDirection.rtl,
          child: Scaffold(body: SingleChildScrollView(child: child)),
        ),
      );

  testWidgets('مكان بلا صورة يرسم رمز فئته بدلاً منها بلا أي تجاوز في التخطيط', (tester) async {
    await tester.pumpWidget(wrap(PlaceResultCard(place: place(category: 'cafe'), rank: 2)));
    await tester.pump();

    expect(find.byType(PlacePhoto), findsOneWidget);
    // رمز الكافيه هو ما يملأ مكان الصورة الغائبة.
    expect(find.byIcon(Icons.local_cafe_rounded), findsOneWidget);
    expect(find.text('كافيه الاختبار'), findsOneWidget);
    expect(find.text('2'), findsOneWidget); // شارة الترتيب فوق الصورة
  });

  testWidgets('البيانات المتوفرة تبقى ظاهرة تحت الصورة', (tester) async {
    await tester.pumpWidget(wrap(PlaceResultCard(place: place(category: 'cafe'), rank: 1)));
    await tester.pump();

    expect(find.text('320 م'), findsOneWidget);
    expect(find.text('4.6 (120)'), findsOneWidget);
  });

  testWidgets('مساحة الصورة محجوزة بنفس المقاس سواء وُجدت صورة أو لا', (tester) async {
    // هذا هو الضمان ضد قفز المحادثة: لو اختلف ارتفاع البطاقة بين الحالتين،
    // لتزحزح ما تحتها لحظة وصول الصور.
    await tester.pumpWidget(wrap(PlaceResultCard(place: place(category: 'cafe'), rank: 1)));
    await tester.pump();
    final withoutPhoto = tester.getSize(find.byType(PlacePhoto));

    await tester.pumpWidget(
      wrap(PlaceResultCard(place: place(photoUrl: 'https://example.test/photo', category: 'cafe'), rank: 1)),
    );
    await tester.pump();
    final withPhoto = tester.getSize(find.byType(PlacePhoto));

    expect(withPhoto, withoutPhoto);
  });
}
