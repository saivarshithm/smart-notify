/**
 * Spring physics and swipe-to-dismiss helper for Smart Notify
 */

export interface DragState {
  startX: number;
  startY: number;
  currentX: number;
  isDragging: boolean;
  startTime: number;
}

export function attachSwipePhysics(
  cardEl: HTMLElement,
  onDismiss: () => void,
  onHoverStateChange?: (hovering: boolean) => void
) {
  let dragState: DragState | null = null;
  let hasMoved = false;

  const onPointerDown = (e: PointerEvent) => {
    // Only primary button
    if (e.button !== 0) return;
    // Don't intercept clicks on buttons (like dismiss or clear all)
    if ((e.target as HTMLElement).closest('.card-close-btn') || (e.target as HTMLElement).closest('.stack-clear-btn')) {
      return;
    }

    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      isDragging: false,
      startTime: Date.now(),
    };
    hasMoved = false;
    cardEl.setPointerCapture(e.pointerId);
    cardEl.style.transition = 'none';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragState) return;

    const dx = e.clientX - dragState.startX;
    const dy = Math.abs(e.clientY - dragState.startY);

    // If mostly horizontal movement
    if (Math.abs(dx) > 6 && Math.abs(dx) > dy) {
      dragState.isDragging = true;
      hasMoved = true;
      dragState.currentX = e.clientX;

      // Only allow dragging to the right (positive dx) or minimal resistance to left
      const displayDx = dx > 0 ? dx : dx * 0.2;
      const opacity = Math.max(0.2, 1 - displayDx / 320);

      cardEl.style.transform = `translateX(${displayDx}px) scale(${Math.max(0.92, 1 - (displayDx / 1000))})`;
      cardEl.style.opacity = `${opacity}`;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!dragState) return;

    if (cardEl.hasPointerCapture(e.pointerId)) {
      try {
        cardEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    }

    const dx = e.clientX - dragState.startX;
    const elapsed = Date.now() - dragState.startTime;
    const velocity = dx / Math.max(elapsed, 1); // px per ms

    if (dragState.isDragging && (dx > 90 || (dx > 30 && velocity > 0.45))) {
      // Swiped away to the right!
      cardEl.style.transition = 'transform 250ms cubic-bezier(0.4, 0, 0.2, 1), opacity 250ms ease';
      cardEl.style.transform = 'translateX(115%) scale(0.92)';
      cardEl.style.opacity = '0';
      setTimeout(() => {
        onDismiss();
      }, 240);
    } else {
      // Spring return to 0
      cardEl.style.transition = 'transform 360ms cubic-bezier(0.22, 1.12, 0.36, 1), opacity 200ms ease';
      cardEl.style.transform = 'translateX(0) scale(1)';
      cardEl.style.opacity = '1';
    }

    dragState = null;
  };

  cardEl.addEventListener('pointerdown', onPointerDown);
  cardEl.addEventListener('pointermove', onPointerMove);
  cardEl.addEventListener('pointerup', onPointerUp);
  cardEl.addEventListener('pointercancel', onPointerUp);

  if (onHoverStateChange) {
    cardEl.addEventListener('mouseenter', () => onHoverStateChange(true));
    cardEl.addEventListener('mouseleave', () => onHoverStateChange(false));
  }

  return () => {
    cardEl.removeEventListener('pointerdown', onPointerDown);
    cardEl.removeEventListener('pointermove', onPointerMove);
    cardEl.removeEventListener('pointerup', onPointerUp);
    cardEl.removeEventListener('pointercancel', onPointerUp);
  };
}
