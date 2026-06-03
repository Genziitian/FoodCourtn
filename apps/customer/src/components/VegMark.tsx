import type { FoodType } from '@foodcourt/shared';
import { cls } from '@foodcourt/shared';

/** FSSAI veg/non-veg marker — small square with inner dot. */
export function VegMark({ type, size = 16 }: { type: FoodType; size?: number }) {
  const isVeg = type === 'veg';
  return (
    <span
      style={{ width: size, height: size }}
      className={cls(
        'inline-flex items-center justify-center rounded-sm border bg-white shrink-0',
        isVeg ? 'border-veg' : 'border-nonveg',
      )}
      aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
    >
      <span
        style={{ width: size * 0.42, height: size * 0.42 }}
        className={cls('rounded-full', isVeg ? 'bg-veg' : 'bg-nonveg')}
      />
    </span>
  );
}
