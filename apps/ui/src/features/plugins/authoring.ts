// Holds the types devpul create writes (contract/create) to the ones the UI
// implements, and both to plugin API 1 (contract/plugin-api.d.ts); tsc fails
// when they drift. Nothing imports this file.
import type * as Authoring from '../../../../../contract/create/my_plugin/devpul';
import type * as Api1 from '../../../../../contract/plugin-api';
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

// A plugin written for API 1 still loads, and what it is handed has every
// member API 1 promised.
export type Api1Types = [
  Holds<Assignable<Api1.DevpulPlugin, DevpulPlugin>>,
  Holds<Assignable<PluginContext, Api1.PluginContext>>,
  Holds<Assignable<PluginEvent, Api1.PluginEvent>>,
  Holds<Assignable<DevpulApi, Api1.DevpulApi>>,
];
