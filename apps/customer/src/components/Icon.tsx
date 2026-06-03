import { cls } from '@foodcourt/shared';

interface IconProps {
  name: string;
  size?: number;
  fill?: boolean;
  weight?: 300 | 400 | 500 | 600 | 700;
  className?: string;
}

/**
 * Material Symbols Outlined wrapper.
 * Font loaded via index.html. Pass `fill` to switch to the filled variant.
 */
export function Icon({ name, size = 24, fill = false, weight = 400, className }: IconProps) {
  return (
    <span
      className={cls('material-symbols-outlined select-none', className)}
      style={{
        fontSize: size,
        lineHeight: 1,
        fontVariationSettings: `'FILL' ${fill ? 1 : 0}, 'wght' ${weight}, 'GRAD' 0, 'opsz' ${size}`,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
