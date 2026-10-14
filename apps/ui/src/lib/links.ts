import site from '../../../../site.json';
import { devtools } from './devtools';

export const repoUrl = site.repo;
export const registryUrl = site.registry;

/**
 * The copy in the devpul package, which the CLI and DevTools serve and which
 * holds no docs; `build:extension` marks it.
 */
const packaged = document.querySelector('meta[name="devpul-package"]') !== null;

/** The hosted site, with the docs next to the app. */
export const onSite = !packaged && !devtools;

export const pageUrl = (path: string): string => (onSite ? `./${path}` : `${site.url}${path}`);
export const marketUrl = pageUrl('plugins/');
