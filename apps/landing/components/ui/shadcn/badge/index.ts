import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Badge } from './Badge.vue';

export const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-white/15 text-white border border-white/20',
        accent: 'bg-[#A8FF35]/20 text-[#D9FF9A] border border-[#C7FF75]/35',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export type BadgeVariants = VariantProps<typeof badgeVariants>;
