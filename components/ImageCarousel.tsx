'use client';

import React, { useEffect, useRef, useState } from 'react';

type ImageCarouselProps = {
  images?: string[];
  className?: string;
  wrapperClassName?: string;
  itemClassName?: string;
  imgClassName?: string;
  emptyLabel?: string;
  emptyClassName?: string;
  renderItem?: (url: string, index: number) => React.ReactNode;
  showArrows?: boolean;
  arrowClassName?: string;
};

export default function ImageCarousel({
  images = [],
  className = '',
  wrapperClassName = '',
  itemClassName = '',
  imgClassName = '',
  emptyLabel = 'No Image',
  emptyClassName = '',
  renderItem,
  showArrows = true,
  arrowClassName = '',
}: ImageCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const dragState = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const resetTimer = useRef<number | null>(null);

  const updateScrollState = () => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  };

  useEffect(() => {
    updateScrollState();
  }, [images?.length]);

  const handleScroll = () => {
    updateScrollState();
  };

  const scrollByAmount = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = Math.max(120, Math.floor(el.clientWidth * 0.9));
    const delta = direction === 'left' ? -amount : amount;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (resetTimer.current) {
      window.clearTimeout(resetTimer.current);
      resetTimer.current = null;
    }

    dragState.current.isDragging = true;
    dragState.current.startX = event.clientX;
    dragState.current.startY = event.clientY;
    dragState.current.startScrollLeft = el.scrollLeft;
    dragState.current.moved = false;

    if (el.setPointerCapture) {
      el.setPointerCapture(event.pointerId);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragState.current;
    const el = scrollRef.current;
    if (!el || !state.isDragging) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (!state.moved && Math.abs(dx) > 6) {
      state.moved = true;
    }

    if (Math.abs(dx) > Math.abs(dy)) {
      el.scrollLeft = state.startScrollLeft - dx;
    }
  };

  const endDrag = (event?: React.PointerEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (el && event?.pointerId != null && el.releasePointerCapture) {
      try {
        if (el.hasPointerCapture?.(event.pointerId)) {
          el.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Ignore capture errors on some browsers.
      }
    }

    dragState.current.isDragging = false;
    if (dragState.current.moved && !resetTimer.current) {
      resetTimer.current = window.setTimeout(() => {
        dragState.current.moved = false;
        resetTimer.current = null;
      }, 200);
    }
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (dragState.current.moved) {
      event.preventDefault();
      event.stopPropagation();
      dragState.current.moved = false;
    }
  };

  if (!images || images.length === 0) {
    return (
      <div className={emptyClassName || 'flex items-center justify-center text-gray-400 text-xs'}>
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <div
        ref={scrollRef}
        className={`flex gap-3 overflow-x-auto snap-x snap-mandatory select-none touch-pan-y ${className}`}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={handleClickCapture}
      >
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
                draggable={false}
              />
            )}
          </div>
        ))}
      </div>

      {showArrows && images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => scrollByAmount('left')}
            disabled={!canScrollLeft}
            aria-label="Previous image"
            className={`absolute left-2 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-white/85 border border-gray-200 text-gray-700 shadow-sm flex items-center justify-center transition-opacity disabled:opacity-30 ${arrowClassName}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount('right')}
            disabled={!canScrollRight}
            aria-label="Next image"
            className={`absolute right-2 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-white/85 border border-gray-200 text-gray-700 shadow-sm flex items-center justify-center transition-opacity disabled:opacity-30 ${arrowClassName}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
