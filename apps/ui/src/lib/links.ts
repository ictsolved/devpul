import site from '../../../../site.json';

export const repoUrl = site.repo;

/** Static pages sit next to the app. */
export const pageUrl = (path: string): string => `./${path}`;
