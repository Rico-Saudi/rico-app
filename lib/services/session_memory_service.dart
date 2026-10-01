import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/chat_message.dart';

/// موقع محفوظ محلياً (مثل "بيتي")
class SavedLocation {
  final double lat;
  final double lng;
  SavedLocation(this.lat, this.lng);
}

/// يحفظ تفضيلات خفيفة عبر الجلسات محلياً على الجهاز (بدون خادم أو حساب):
/// موقع "بيتي" وآخر فئة بحث ناجحة ونص المحادثة الأخيرة، لدعم طلبات مثل
/// "قريب من بيتي" أو استكمال طلب سابق بدون كلمة فئة صريحة، أو استعادة
/// المحادثة بعد إغلاق التطبيق.
class SessionMemoryService {
  static const _homeLatKey = 'home_lat';
  static const _homeLngKey = 'home_lng';
  static const _lastCategoryKey = 'last_category_slug';
  static const _transcriptKey = 'conversation_transcript';
  static const _maxTranscriptEntries = 40; // ~20 تبادل رسائل
  static const _transcriptTtl = Duration(hours: 24);

  Future<SavedLocation?> getHome() async {
    final prefs = await SharedPreferences.getInstance();
    final lat = prefs.getDouble(_homeLatKey);
    final lng = prefs.getDouble(_homeLngKey);
    if (lat == null || lng == null) return null;
    return SavedLocation(lat, lng);
  }

  Future<void> saveHome(double lat, double lng) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_homeLatKey, lat);
    await prefs.setDouble(_homeLngKey, lng);
  }

  Future<String?> getLastCategorySlug() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_lastCategoryKey);
  }

  Future<void> saveLastCategorySlug(String slug) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastCategoryKey, slug);
  }

  /// يحفظ نص المحادثة فقط (بلا أزرار أو بطاقات تفاعلية — غير قابلة للاستعادة
  /// بمعنى صحيح بعد إغلاق التطبيق)، محدوداً بعدد أقصى من الرسائل.
  Future<void> saveTranscript(List<ChatMessage> messages) async {
    final capped = messages.length > _maxTranscriptEntries
        ? messages.sublist(messages.length - _maxTranscriptEntries)
        : messages;
    final encoded = jsonEncode(capped
        .map((m) => {
              'role': m.sender == MessageSender.user ? 'user' : 'assistant',
              'text': m.text,
              'ts': m.timestamp.toIso8601String(),
            })
        .toList());
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_transcriptKey, encoded);
  }

  /// يستعيد نص المحادثة المحفوظ إن لم تنقض صلاحيته (24 ساعة من عدم النشاط)،
  /// وإلا يرجع قائمة فارغة لعرض رسالة الترحيب من جديد.
  Future<List<ChatMessage>> loadTranscript() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_transcriptKey);
    if (raw == null) return [];
    try {
      final cutoff = DateTime.now().subtract(_transcriptTtl);
      return (jsonDecode(raw) as List)
          .cast<Map<String, dynamic>>()
          .map((e) => (
                role: e['role'] as String,
                text: e['text'] as String,
                ts: DateTime.tryParse(e['ts'] as String? ?? '') ?? DateTime.now(),
              ))
          .where((e) => e.ts.isAfter(cutoff))
          .map((e) => ChatMessage(
                text: e.text,
                sender: e.role == 'user' ? MessageSender.user : MessageSender.bot,
                timestamp: e.ts,
              ))
          .toList();
    } catch (_) {
      return [];
    }
  }
}
