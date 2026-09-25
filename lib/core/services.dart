import 'package:app_links/app_links.dart';
import 'package:url_launcher/url_launcher.dart';

abstract interface class DeepLinkService {
  Stream<Uri> get links;
  Future<Uri?> getInitialLink();
}

class AppLinksDeepLinkService implements DeepLinkService {
  AppLinksDeepLinkService({AppLinks? appLinks})
    : _appLinks = appLinks ?? AppLinks();

  final AppLinks _appLinks;

  @override
  Stream<Uri> get links => _appLinks.uriLinkStream;

  @override
  Future<Uri?> getInitialLink() => _appLinks.getInitialLink();
}

abstract interface class AuthorizationLauncher {
  Future<void> open(Uri url);
}

class ExternalAuthorizationLauncher implements AuthorizationLauncher {
  const ExternalAuthorizationLauncher();

  @override
  Future<void> open(Uri url) async {
    if (url.scheme != 'https' || url.host.isEmpty) {
      throw const FormatException('Authorization URL must use HTTPS');
    }
    final opened = await launchUrl(url, mode: LaunchMode.externalApplication);
    if (!opened) {
      throw StateError('The authorization page could not be opened');
    }
  }
}
