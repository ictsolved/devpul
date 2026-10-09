import 'dart:io';

/// Holds the state of serving devpuls and git mirrors of plugin repositories.
String cacheDir() {
  final env = Platform.environment;
  if (Platform.isWindows) return '${env['LOCALAPPDATA']}\\devpul';
  if (Platform.isMacOS) return '${env['HOME']}/Library/Caches/devpul';
  return '${env['XDG_CACHE_HOME'] ?? '${env['HOME']}/.cache'}/devpul';
}
