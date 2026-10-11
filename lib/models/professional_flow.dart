import 'professional.dart';

enum ProfessionalFlowStage { browsing, confirming, submitting, submitted }

/// حالة "اختر صاحب مهنة من القائمة ثم أكّد إرسال طلب تواصل" داخل رسالة
/// دردشة واحدة — نظير [RequestFlow] لكن بلا كتالوج: صاحب المهنة ما عنده
/// منتجات تُتصفّح، الاختيار هو الشخص نفسه.
class ProfessionalFlow {
  final List<Professional> professionals;
  final ProfessionalFlowStage stage;

  /// الشخص المختار — null في مرحلة التصفّح.
  final Professional? selected;

  /// وصف الشغلة كما كتبه العميل ("أبي أدهن غرفتين"). اختياري: المقصود من
  /// الطلب أن يتصل صاحب المهنة، لا أن يُسعّر من الرسالة.
  final String? note;

  final String? errorMessage;

  const ProfessionalFlow({
    required this.professionals,
    this.stage = ProfessionalFlowStage.browsing,
    this.selected,
    this.note,
    this.errorMessage,
  });

  ProfessionalFlow copyWith({
    ProfessionalFlowStage? stage,
    Professional? selected,
    String? note,
    String? errorMessage,
    bool clearError = false,
    bool clearSelection = false,
  }) {
    return ProfessionalFlow(
      professionals: professionals,
      stage: stage ?? this.stage,
      selected: clearSelection ? null : (selected ?? this.selected),
      note: clearSelection ? null : (note ?? this.note),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}
