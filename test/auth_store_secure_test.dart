import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:rico_app/services/auth_store.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// الرمز ينتقل من التفضيلات (نص صريح) لمخزن النظام بلا ما يطلع العميل.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('a token saved by an older build moves to secure storage on restore', () async {
    SharedPreferences.setMockInitialValues({
      'customer_auth_token': 'legacy-token',
      'customer_auth_profile': '{"id":"c1","name":"ماهر","email":"m@rico.test","phone":"0500000000"}',
    });
    FlutterSecureStorage.setMockInitialValues({});

    await AuthStore.instance.restore();

    expect(AuthStore.instance.token, 'legacy-token');
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString('customer_auth_token'), isNull);
    expect(await const FlutterSecureStorage().read(key: 'customer_auth_token'), 'legacy-token');
  });
}
