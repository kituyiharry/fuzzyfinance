import 'package:dio/dio.dart';
import 'package:passkeys/authenticator.dart';
import 'package:passkeys/types.dart';

import '../api/api_client.dart';
import '../api/endpoints.dart';

class PasskeyService {
  PasskeyService(this._client);
  final ApiClient _client;

  final _authenticator = PasskeyAuthenticator();

  Future<void> registerPasskey() async {
    final optionsResp = await _client.dio.post<Map<String, dynamic>>(
      Endpoints.passkeyRegisterOptions,
    );

    final request = RegisterRequestType.fromJson(optionsResp.data!);
    final response = await _authenticator.register(request);

    await _client.dio.post<void>(
      Endpoints.passkeyVerifyRegistration,
      data: response.toJson(),
    );
  }

  Future<String> authenticateWithPasskey() async {
    final optionsResp = await _client.dio.post<Map<String, dynamic>>(
      Endpoints.passkeyAuthenticateOptions,
    );

    final challengeId = optionsResp.data!['challengeId'] as String;
    final options = optionsResp.data!['options'] as Map<String, dynamic>;

    final request = AuthenticateRequestType.fromJson(
      options,
      mediation: MediationType.Optional,
      preferImmediatelyAvailableCredentials: true,
    );
    final response = await _authenticator.authenticate(request);

    final verifyResp = await _client.dio.post<Map<String, dynamic>>(
      Endpoints.passkeyVerifyAuthentication,
      data: {'challengeId': challengeId, 'credential': response.toJson()},
      options: Options(
        followRedirects: false,
        validateStatus: (s) => s != null && s < 400,
      ),
    );

    final setCookie = verifyResp.headers.value('set-cookie');
    if (setCookie != null) {
      await _client.persistSession(setCookie);
      await _client.ensureSessionInJar();
    }

    return verifyResp.data?['email'] as String? ?? '';
  }
}
