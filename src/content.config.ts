import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * One entry per sauce. Each is a Markdown file in src/content/sauces/ with the
 * label PNG next to it in src/assets/labels/. The Markdown body is the description.
 *
 * This schema is the contract the page relies on. Swapping the source to a CMS
 * means replacing the `loader` below; nothing in the page needs to change.
 */
const sauces = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/sauces' }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      year: z.number().int(),
      /** Lower numbers come first along the shelf. Defaults to year. */
      order: z.number().optional(),
      heat: z.enum(['mild', 'medium', 'hot', 'extra hot']).optional(),
      /** Transparent PNG (any size or aspect ratio). */
      label: image(),
      /** How tall the label sits on the bottle, 0–1 of the label area. Width follows the PNG's aspect ratio. */
      labelHeight: z.number().min(0.2).max(1).default(0.9),
      /** Colour of the sauce inside the bottle. */
      sauceColor: z.string().default('#c1121f'),
      capColor: z.string().default('#111111'),
      ingredients: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { sauces };
