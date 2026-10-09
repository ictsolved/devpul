import 'dart:io';

import 'package:devpul_cli/src/cli.dart';

Future<void> main(List<String> args) async => exit(await runCli(args));
