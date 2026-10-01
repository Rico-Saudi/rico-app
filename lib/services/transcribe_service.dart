import 'dart:convert';
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';
import '../brand.dart';

/// نتيجة تحويل مقطع صوتي إلى نص.
///
/// نميّز بين ثلاث حالات لأن رسالة المستخدم تختلف في كل وحدة: نجاح بنص،
/// ونجاح بلا كلام مفهوم (سكوت/ضجيج — يعيد المحاولة بنفسه)، وفشل فعلي
/// (شبكة/خادم — مشكلة ليست من المستخدم).
enum TranscriptionStatus { ok, noSpeech, failed }

class TranscriptionResult {
  final TranscriptionStatus status;
  final String text;

  const TranscriptionResult(this.status, [this.text = '']);
}

/// يحوّل تسجيل المستخدم الصوتي إلى نص عبر rico-backend (POST /transcribe،
/// والذي بدوره ينادي Groq Whisper). لا بحث ولا تحويل مباشر من التطبيق لأي
/// خدمة خارجية — المفتاح يبقى على الخادم فقط، تماماً مثل [PlacesService]
/// و[ComposeService].
///
/// لا يُلقي أي استثناء أبداً؛ كل الأعطال تصل كـ[TranscriptionStatus.failed].
class TranscribeService {
  // للتجربة المحلية بدّلها لـ http://localhost:3000/transcribe (iOS
  // Simulator/سطح المكتب) أو http://10.0.2.2:3000/transcribe (Android
  // Emulator).
  static const String _url = 'https://app.rico-go.com/transcribe';

  /// أطول من مهلة /compose (٥ ثوانٍ) لأن هنا رفع ملف فعلي فوق زمن المعالجة —
  /// مقطع ٣٠ ثانية على شبكة جوال متوسطة قد يحتاج معظم هذي المهلة.
  static const Duration _timeout = Duration(seconds: 20);

  Future<TranscriptionResult> transcribe(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) return const TranscriptionResult(TranscriptionStatus.failed);

      final request = http.MultipartRequest('POST', Uri.parse(_url))
        ..fields['brand'] = Brand.slug
        ..files.add(await http.MultipartFile.fromPath(
          'audio',
          filePath,
          // بدون تحديد صريح ترسل الحزمة application/octet-stream، وهو نوع لا
          // يقول شيئاً عن الملف — نرسل نوع الحاوية الفعلي (m4a هي MP4) عشان
          // الخادم وGroq يعرفان بأي فاكّ ترميز يفتحانه.
          contentType: MediaType('audio', 'mp4'),
        ));

      final streamed = await request.send().timeout(_timeout);
      final response = await http.Response.fromStream(streamed);

      if (response.statusCode != 200) return const TranscriptionResult(TranscriptionStatus.failed);

      final data = jsonDecode(utf8.decode(response.bodyBytes)) as Map<String, dynamic>;
      final text = (data['text'] as String?)?.trim() ?? '';

      // الخادم يرجّع نصاً فارغاً للسكوت (وللهلوسات المعروفة اللي يطلعها
      // Whisper على الضجيج) — هذي ليست عطلاً، هي "ما سمعتك".
      return text.isEmpty
          ? const TranscriptionResult(TranscriptionStatus.noSpeech)
          : TranscriptionResult(TranscriptionStatus.ok, text);
    } catch (_) {
      return const TranscriptionResult(TranscriptionStatus.failed);
    }
  }
}
