@TestOn('vm')
library;

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
}
