import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import type { Loader } from 'astro/loaders';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pluginPages, readRegistry } from './plugins.ts';

// The marketplace at /plugins/, from the output of tool/build_registry.dart.
// Builds without DEVPUL_REGISTRY have none.
function withRegistry(docs: Loader, dir = process.env.DEVPUL_REGISTRY): Loader {
  if (!dir) return docs;
  return {
    name: 'devpul-docs',
    async load(context) {
      await docs.load(context);
      // Each call renders a new document, so Expressive Code links its CSS and JS on every
      // block; the first block of a page keeps them.
      const render = (id: string) => {
        let first = true;
        return async (markdown: string) => {
          const assets = first;
          first = false;
          const fileURL = pathToFileURL(join(dir, 'readme', `${id}.md`));
          const { html } = await context.renderMarkdown(markdown, { fileURL });
          return assets
            ? html
            : html.replace(/<link rel="stylesheet"[^>]*>|<script type="module" src=[^>]*><\/script>/g, '');
        };
      };
      for (const page of await pluginPages(readRegistry(dir), render)) {
        const data = await context.parseData({
          id: page.id,
          data: {
            title: page.title,
            description: page.description,
            heading: page.heading,
            tableOfContents: false,
            prev: false,
            next: false,
          },
        });
        context.store.set({
          id: page.id,
          data,
          rendered: { html: page.html },
          digest: context.generateDigest(JSON.stringify(page)),
        });
      }
    },
  };
}

export const collections = {
  docs: defineCollection({
    loader: withRegistry(docsLoader()),
    schema: docsSchema({
      extend: z.object({ heading: z.object({ before: z.string(), after: z.string(), below: z.string() }).optional() }),
    }),
  }),
};
