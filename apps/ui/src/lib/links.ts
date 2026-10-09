import site from '../../../../site.json';

export const repoUrl = site.repo;
export const registryUrl = site.registry;

/** Static pages sit next to the app. */
export const pageUrl = (path: string): string => `./${path}`;
