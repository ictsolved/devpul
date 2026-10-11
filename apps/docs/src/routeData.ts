import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

const plain = (s: string) =>
  s
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

// Questions are the h3s under "## Questions"; answers are the paragraphs below them.
function faq(body: string) {
  const out: { q: string; a: string }[] = [];
  const section = body.split(/^## Questions$/m)[1]?.split(/^## /m)[0] ?? '';
  for (const block of section.split(/^### /m).slice(1)) {
    const [q = '', ...rest] = block.split('\n');
    out.push({ q: plain(q), a: plain(rest.join(' ')) });
  }
  return out;
}

export const onRequest = defineRouteMiddleware(({ locals }) => {
  const route = locals.starlightRoute;
  // The site root is the app.
  route.siteTitleHref = '/docs/';
  const questions = faq(route.entry.body ?? '');
  if (!questions.length) return;
  route.head.push({
    tag: 'script',
    attrs: { type: 'application/ld+json' },
    content: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: questions.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a },
      })),
    }),
  });
});
