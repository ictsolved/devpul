import { isObject } from './events';
import { locationText, type SourceLocation } from './location';

type Call = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export interface EditorDeps {
  /** A VM service call on the app's connection. */
  vm: Call;
  isolateId?: string;
  /** A call on the Dart Tooling Daemon DevTools passed, if any. */
  dtd?: Call;
  copy: (text: string) => Promise<boolean>;
}

/** `editor`: an editor on DTD opened it. `ide`: sent to the IDE's debug session, which gives no answer. */
export type Opened = { how: 'editor' | 'ide'; location: SourceLocation } | { how: 'copied' | 'failed'; text: string };

async function resolve(file: string, { vm, isolateId }: EditorDeps): Promise<string> {
  if (!file.startsWith('package:') || !isolateId) return file;
  try {
    const result = await vm('lookupResolvedPackageUris', { isolateId, uris: [file], local: true });
    const uri = isObject(result) && Array.isArray(result.uris) ? result.uris[0] : undefined;
    return typeof uri === 'string' ? uri : file;
  } catch {
    return file;
  }
}

/**
 * Opens a source location in the editor: DTD's Editor service, then the IDE
 * that launched the app through DDS's ToolEvent stream, else copies `file:line`.
 */
export async function openInEditor(source: SourceLocation, deps: EditorDeps): Promise<Opened> {
  const location = { ...source, file: await resolve(source.file, deps) };
  if (location.file.startsWith('file:')) {
    // Editors skip a navigation without a column.
    const { file: uri, line, column = 1 } = location;
    if (deps.dtd) {
      try {
        await deps.dtd('Editor.navigateToCode', { uri, line, column });
        return { how: 'editor', location };
      } catch {
        // No editor registered the method.
      }
    }
    try {
      const eventData = { fileUri: uri, line, column, source: 'devpul' };
      await deps.vm('postEvent', { stream: 'ToolEvent', eventKind: 'navigate', eventData });
      return { how: 'ide', location };
    } catch {
      // No IDE listens on ToolEvent, or no DDS.
    }
  }
  const text = locationText(location);
  return (await deps.copy(text)) ? { how: 'copied', text } : { how: 'failed', text };
}
