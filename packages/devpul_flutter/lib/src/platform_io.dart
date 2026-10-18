import 'dart:io';

// Set in every process the iOS simulator launches.
bool get iosSimulator =>
    Platform.isIOS && Platform.environment.containsKey('SIMULATOR_DEVICE_NAME');

String get osVersion => Platform.operatingSystemVersion;
