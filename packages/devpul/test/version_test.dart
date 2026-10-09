@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:devpul/src/version.dart';
import 'package:test/test.dart';

void main() {
  test('packageVersion matches the pubspec', () {
    expect(
      File('pubspec.yaml').readAsStringSync(),
      contains('\nversion: $packageVersion\n'),
    );
  });

  test('siteUrl matches site.json', () {
    final site = jsonDecode(File('../../site.json').readAsStringSync()) as Map;
    expect(siteUrl, site['url']);
  });
}
