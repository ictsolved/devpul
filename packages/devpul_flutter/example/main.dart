import 'package:devpul/devpul.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/material.dart';

// flutter run, then paste the printed VM service URL into
// https://devpul.saradgajurel.com.np
void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'devpul_flutter example'});
  runApp(
    MaterialApp(
      home: Scaffold(
        body: Center(
          child: FilledButton(
            onPressed: () => throw StateError('Button handler failed'),
            child: const Text('Throw'),
          ),
        ),
      ),
    ),
  );
}
