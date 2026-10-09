// Holds the types devpul create writes (contract/create) to the ones the UI
// implements; tsc fails when they drift. Nothing imports this file.
import type * as Authoring from '../../../../../contract/create/my_plugin/devpul';
import type { DevpulApi, DevpulPlugin, PluginContext, PluginEvent } from './plugins';

type Assignable<From, To> = [From] extends [To] ? true : false;
type Holds<T extends true> = T;

export type AuthoringTypes = [
  Holds<Assignable<Authoring.DevpulPlugin, DevpulPlugin>>,
  Holds<Assignable<PluginContext, Authoring.PluginContext>>,
  Holds<Assignable<PluginEvent, Authoring.PluginEvent>>,
  Holds<Assignable<DevpulApi, Authoring.DevpulApi>>,
  Holds<Assignable<(typeof import('../../../../../contract/create/my_plugin/my_plugin.js'))['default'], DevpulPlugin>>,
];
