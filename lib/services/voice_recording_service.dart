import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

/// تسجيل صوتي قصير لطلب المستخدم، تمهيداً لتحويله نصاً عبر
/// [TranscribeService]. مقطع بحث لا رسالة صوتية: mono ١٦kHz بمعدل بت منخفض
/// (Whisper ينزل العينة لـ١٦kHz على أي حال) — ٣٠ ثانية تطلع أقل من ١٠٠ كيلوبايت،
/// فالرفع سريع حتى على شبكة جوال ضعيفة.
class VoiceRecordingService {
  /// أقصى مدة تسجيل. هذا صندوق بحث لا مسجّل رسائل — طلب مثل «أقرب صيدلية
  /// مفتوحة الحين» ما يحتاج أكثر من بضع ثوانٍ، والسقف يحمي من جيب يسجّل
  /// دقائق بالغلط ثم نرفعها ونحوّلها.
  static const Duration maxDuration = Duration(seconds: 30);

  /// أقصر تسجيل معتبر. أقل من كذا هي ضغطة عرضية على الزر لا كلام، و Whisper
  /// على مقطع شبه فارغ يهلوس جملة من بيانات تدريبه بدل ما يرجّع فراغ.
  static const Duration minDuration = Duration(milliseconds: 700);

  static const RecordConfig _config = RecordConfig(
    encoder: AudioEncoder.aacLc,
    sampleRate: 16000,
    numChannels: 1,
    bitRate: 24000,
    // كبت الضجيج مفيد هنا تحديداً: الاستخدام المتوقّع بالسيارة أو بالشارع،
    // وأي ضجيج خلفية يصل Whisper يزيد احتمال هلوسته على الفراغات.
    noiseSuppress: true,
    autoGain: true,
  );

  final AudioRecorder _recorder = AudioRecorder();
  String? _currentPath;

  /// موجة السعة للعرض أثناء التسجيل — قيم dBFS سالبة (الصمت قرب ١٦٠-).
  Stream<Amplitude> amplitudeStream() => _recorder.onAmplitudeChanged(const Duration(milliseconds: 120));

  Future<bool> hasPermission() => _recorder.hasPermission();

  /// يبدأ التسجيل، ويرجع false إذا رُفض إذن المايك أو فشل بدء الجهاز.
  Future<bool> start() async {
    try {
      if (!await _recorder.hasPermission()) return false;

      // ملف واحد ثابت بالمجلد المؤقت: التسجيل يُرفع ثم يُحذف مباشرة، فلا
      // داعي لتراكم ملفات باسم فريد لكل محاولة.
      final dir = await getTemporaryDirectory();
      final path = '${dir.path}/rico_voice.m4a';
      _currentPath = path;

      await _recorder.start(_config, path: path);
      return true;
    } catch (_) {
      _currentPath = null;
      return false;
    }
  }

  /// ينهي التسجيل ويرجع مسار الملف، أو null إذا فشل أو طلع فاضي.
  Future<String?> stop() async {
    try {
      final path = await _recorder.stop() ?? _currentPath;
      _currentPath = null;
      if (path == null) return null;

      final file = File(path);
      if (!await file.exists() || await file.length() == 0) return null;
      return path;
    } catch (_) {
      _currentPath = null;
      return null;
    }
  }

  /// يلغي التسجيل ويحذف الملف — لا رفع ولا تحويل.
  Future<void> cancel() async {
    final path = _currentPath;
    _currentPath = null;
    try {
      await _recorder.cancel();
    } catch (_) {
      // حتى لو فشل الإلغاء على مستوى الجهاز، نكمل لحذف الملف.
    }
    await deleteFile(path);
  }

  /// يحذف مقطعاً بعد رفعه — أفضل جهد، فشل الحذف ما يستاهل تعطيل أي شي.
  static Future<void> deleteFile(String? path) async {
    if (path == null) return;
    try {
      final file = File(path);
      if (await file.exists()) await file.delete();
    } catch (_) {}
  }

  Future<void> dispose() => _recorder.dispose();
}
