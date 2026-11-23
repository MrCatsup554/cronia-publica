import type { ReactNode } from 'react';

interface Campaign {
  sponsor: string;
  headline: string;
  url: string;
}

// Configura aquí una campaña por ubicación cuando haya un patrocinador.
const campaigns: Partial<Record<'editor' | 'preview', Campaign>> = {};

export function AdPlacement({ placement, children }: {
  placement: 'editor' | 'preview';
  children: ReactNode;
}) {
  const campaign = campaigns[placement];
  return (
    <aside className="ad-placement" data-ad-slot={placement} aria-label="Publicidad">
      <small>Publicidad · {campaign?.sponsor ?? 'Cronia'}</small>
      {campaign
        ? <a href={campaign.url} rel="sponsored noopener" target="_blank">{campaign.headline}</a>
        : children}
    </aside>
  );
}
