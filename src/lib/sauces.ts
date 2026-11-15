import { getCollection } from 'astro:content';
import { getImage } from 'astro:assets';

/** Everything the 3D shelf needs for one bottle. Plain JSON so it can be handed to the client. */
export type SauceForShelf = {
  id: string;
  name: string;
  year: number;
  heat?: string;
  ingredients: string[];
  labelUrl: string;
  labelAspect: number; // width / height of the PNG
  labelHeight: number;
  sauceColor: string;
  capColor: string;
};

/**
 * The single place the site reads sauce data. If the content moves to a CMS,
 * this is the function to change (or the collection loader behind it).
 */
export async function getSauces() {
  const entries = await getCollection('sauces', ({ data }) => import.meta.env.DEV || !data.draft);
  entries.sort((a, b) => (a.data.order ?? a.data.year) - (b.data.order ?? b.data.year));

  return Promise.all(
    entries.map(async (entry) => {
      const { data } = entry;
      // Labels arrive at all sizes (some 3000px / 3MB). Ship a WebP capped at 2048px, alpha kept.
      const optimized = await getImage({
        src: data.label,
        format: 'webp',
        width: Math.min(data.label.width, 2048),
        quality: 88,
      });
      const shelf: SauceForShelf = {
        id: entry.id,
        name: data.name,
        year: data.year,
        heat: data.heat,
        ingredients: data.ingredients,
        labelUrl: optimized.src,
        labelAspect: data.label.width / data.label.height,
        labelHeight: data.labelHeight,
        sauceColor: data.sauceColor,
        capColor: data.capColor,
      };
      return { entry, shelf };
    }),
  );
}
