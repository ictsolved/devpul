# files

A Files tab for DevPul: the app's `path_provider` directories (support, documents, cache, temporary, and library, external storage or downloads where the platform has them) with sizes. Browse them, preview text, JSON, images and a hex head of anything else, and download any file. With Allow writes on in the Plugins tab, delete files and folders.

```sh
devpul add files
```

```dart
import 'devpul/plugins.dart';

void main() {
  DevpulPlugins.install();
  DevpulFiles.install();
  runApp(const App());
}
```

It does nothing unless `Devpul.included`. Reads and deletes stay inside those directories; the directories themselves cannot be deleted. Folder sizes stop counting after 2 seconds and show as a lower bound. Web apps have no files.
