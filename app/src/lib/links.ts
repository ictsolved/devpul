import site from '../../site.json';

export const repoUrl = site.repo;

/** Static pages sit next to the app; the downloaded file links to the site. */
export const pageUrl = (path: string): string =>
  (location.protocol === 'file:' ? site.url : './') + path;
