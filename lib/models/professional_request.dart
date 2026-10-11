/// طلب وصل **لي** كصاحب مهنة — العميل اللي ضغط "أرسل طلب" على بطاقتي.
///
/// يحمل رقم العميل عشان أتصل فيه: هو اللي بدأ التواصل وهو اللي بعث رقمه،
/// بعكس الاتجاه الثاني (رقمي أنا ما يظهر في نتائج البحث لأحد).
class IncomingProfessionalRequest {
  final String id;
  final String customerName;
  final String customerPhone;
  final String professionLabel;
  final String? note;
  final int? distanceMeters;
  final bool handled;
  final DateTime createdAt;

  const IncomingProfessionalRequest({
    required this.id,
    required this.customerName,
    required this.customerPhone,
    required this.professionLabel,
    required this.handled,
    required this.createdAt,
    this.note,
    this.distanceMeters,
  });

  factory IncomingProfessionalRequest.fromJson(Map<String, dynamic> json) => IncomingProfessionalRequest(
        id: json['id'] as String,
        customerName: (json['customerName'] as String?) ?? '',
        customerPhone: (json['customerPhone'] as String?) ?? '',
        professionLabel: (json['professionLabel'] as String?) ?? '',
        note: json['note'] as String?,
        distanceMeters: (json['distanceMeters'] as num?)?.round(),
        handled: json['status'] == 'handled',
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '')?.toLocal() ?? DateTime.now(),
      );

  IncomingProfessionalRequest copyWith({bool? handled}) => IncomingProfessionalRequest(
        id: id,
        customerName: customerName,
        customerPhone: customerPhone,
        professionLabel: professionLabel,
        note: note,
        distanceMeters: distanceMeters,
        handled: handled ?? this.handled,
        createdAt: createdAt,
      );

  String? get distanceLabel {
    final meters = distanceMeters;
    if (meters == null) return null;
    return meters < 1000 ? '$meters م' : '${(meters / 1000).toStringAsFixed(1)} كم';
  }
}
