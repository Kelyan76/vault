import type { GoalIcon } from '@shared/domain/savings.ts';
import type { IconName } from '@/ui/Icon';

export const GOAL_ICONS: Record<GoalIcon, { icon: IconName; label: string }> = {
  plane: { icon: 'plane', label: 'Voyage' },
  laptop: { icon: 'laptop', label: 'Équipement' },
  shield: { icon: 'shield', label: 'Sécurité' },
  home: { icon: 'home', label: 'Logement' },
  gift: { icon: 'gift', label: 'Cadeau' },
  bike: { icon: 'bike', label: 'Mobilité' },
  book: { icon: 'book', label: 'Études' },
  star: { icon: 'star', label: 'Autre' },
  moto: { icon: 'moto', label: 'Moto' },
  car: { icon: 'car', label: 'Voiture' },
  key: { icon: 'key', label: 'Permis' },
};
