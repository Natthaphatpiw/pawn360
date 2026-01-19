'use client';

import React from 'react';

type ImageCarouselProps = {
  images?: string[];
  className?: string;
  itemClassName?: string;
  imgClassName?: string;
  emptyLabel?: string;
  emptyClassName?: string;
  renderItem?: (url: string, index: number) => React.ReactNode;
};

export default function ImageCarousel({
  images = [],
  className = '',
  itemClassName = '',
  imgClassName = '',
  emptyLabel = 'No Image',
  emptyClassName = '',
  renderItem,
}: ImageCarouselProps) {
  if (!images || images.length === 0) {
    return (
      <div className={emptyClassName || 'flex items-center justify-center text-gray-400 text-xs'}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`flex gap-3 overflow-x-auto snap-x snap-mandatory ${className}`}>
      {images.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className={`flex-shrink-0 snap-center ${itemClassName}`}
        >
          {renderItem ? (
            renderItem(url, index)
          ) : (
            <img
              src={url}
              alt={`Image ${index + 1}`}
              className={`w-full h-full object-cover ${imgClassName}`}
              loading="lazy"
            />
          )}
        </div>
      ))}
    </div>
  );
}
