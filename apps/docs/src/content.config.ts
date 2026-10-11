import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { defineCollection } from 'astro:content';
import type { Loader } from 'astro/loaders';
import { pluginPages, readRegistry } from './plugins.ts';

// The marketplace at /plugins/, from the output of tool/build_registry.dart.
// Builds without DEVPUL_REGISTRY have none.
function withRegistry(docs: Loader, dir = process.env.DEVPUL_REGISTRY): Loader {
  if (!dir) return docs;
  return {
    name: 'devpul-docs',
    async load(context) {
      await docs.load(context);
      for (const page of pluginPages(readRegistry(dir))) {
        const data = await context.parseData({
          id: page.id,
          data: { title: page.title, description: page.description, tableOfContents: false, prev: false, next: false },
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
  docs: defineCollection({ loader: withRegistry(docsLoader()), schema: docsSchema() }),
};
