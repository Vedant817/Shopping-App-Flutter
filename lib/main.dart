import 'dart:async';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import 'app/app_shell.dart';
import 'app/app_theme.dart';
import 'app/app_widgets.dart';
import 'core/auth_service.dart';
import 'core/commerce_repository.dart';
import 'core/config.dart';
import 'core/insights_provider.dart';
import 'core/services.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final config = RuntimeConfig.fromEnvironment();
  if (!config.isValid) {
    runApp(ConfigSetupApp(config: config));
    return;
  }
  try {
    final authService = await SupabaseAuthService.initialize(config);
    final apiClient = ApiClient(
      baseUrl: config.apiBaseUrl!,
      accessToken: () async => authService.currentUser?.accessToken,
      clientFactory: http.Client.new,
    );
    final controller = AppController(
      authService: authService,
      repository: HttpCommerceRepository(client: apiClient),
      deepLinkService: AppLinksDeepLinkService(),
      authorizationLauncher: const ExternalAuthorizationLauncher(),
      shopifyMobileReturnUrl: config.shopifyMobileReturnUrl!,
    );
    runApp(ThreadlineApp(controller: controller));
    unawaited(controller.initialize());
  } catch (error) {
    runApp(BootstrapErrorApp(message: error.toString()));
  }
}

class ThreadlineApp extends StatelessWidget {
  const ThreadlineApp({required this.controller, super.key});

  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider<AppController>.value(
      value: controller,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        title: 'Threadline Commerce Intelligence',
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.system,
        home: const AppShell(),
      ),
    );
  }
}

class ConfigSetupApp extends StatelessWidget {
  const ConfigSetupApp({required this.config, super.key});

  final RuntimeConfig config;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Threadline setup',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: ConfigSetupView(config: config),
    );
  }
}

class ConfigSetupView extends StatelessWidget {
  const ConfigSetupView({required this.config, super.key});

  final RuntimeConfig config;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 680),
              child: AppSurface(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.tune_rounded,
                      size: 42,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Threadline needs runtime configuration',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Provide these values with --dart-define when building or running the app. No production URL or key is bundled in the client.',
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 22),
                    for (final name in RuntimeConfig.defineNames)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: SelectableText(
                          '--dart-define=$name=<value>',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                      ),
                    if (config.issues.isNotEmpty) ...[
                      const Divider(height: 28),
                      Text(
                        'Resolve these issues',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 10),
                      for (final issue in config.issues)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: Text('${issue.name}: ${issue.message}'),
                        ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class BootstrapErrorApp extends StatelessWidget {
  const BootstrapErrorApp({required this.message, super.key});

  final String message;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Threadline unavailable',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: Scaffold(
        body: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 560),
                child: AppSurface(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.cloud_off_rounded,
                        size: 42,
                        color: Theme.of(context).colorScheme.error,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Threadline could not start',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Check the runtime defines and try the build again.',
                      ),
                      const SizedBox(height: 12),
                      SelectableText(
                        message,
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
