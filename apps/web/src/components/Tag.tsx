import type { Tone } from '@/lib/words';
import { Icon, type IconName } from './Icon';

const ICON: Record<Tone, IconName | undefined> = {
  risk: 'alert',
  caution: 'flag',
  settled: 'check',
  accent: undefined,
  neutral: undefined,
};

/** A status pill: tint background, matching dark text, and an icon so color is never alone. */
export function Tag({
  tone,
  children,
  icon,
}: {
  tone: Tone;
  children: React.ReactNode;
  icon?: IconName | null;
}) {
  const i = icon === null ? undefined : (icon ?? ICON[tone]);
  return (
    <span className={`tag tone-${tone}`}>
      {i && <Icon name={i} size={12} />}
      {children}
    </span>
  );
}
