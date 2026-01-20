'use client';

import React from 'react';

type MapEmbedProps = {
  embedHtml?: string | null;
  className?: string;
  title?: string;
};

const extractEmbedSrc = (embedHtml?: string | null): string | null => {
  if (!embedHtml) return null;
  const trimmed = embedHtml.trim();
  if (!trimmed) return null;

  const srcMatch = trimmed.match(/src=["']([^"']+)["']/i);
  if (srcMatch && srcMatch[1]) {
    return srcMatch[1];
  }

  if (trimmed.startsWith('http')) {
    return trimmed;
  }

  return null;
};

export default function MapEmbed({ embedHtml, className = '', title = 'แผนที่สาขา' }: MapEmbedProps) {
  const src = extractEmbedSrc(embedHtml);
  if (!src) return null;

  return (
    <div className={`w-full overflow-hidden rounded-xl border border-gray-200 ${className}`}>
      <iframe
        src={src}
        title={title}
        className="w-full h-full"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
