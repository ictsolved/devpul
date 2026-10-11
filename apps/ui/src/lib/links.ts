import site from '../../../../site.json';
import { cli } from './cli';
import { devtools } from './devtools';

export const repoUrl = site.repo;
export const registryUrl = site.registry;

/** Docs and plugin pages: next to the app on the site, the site itself from the CLI and DevTools. */
export const pageUrl = (path: string): string => (cli || devtools ? `${site.url}${path}` : `./${path}`);
export const marketUrl = pageUrl('plugins/');
