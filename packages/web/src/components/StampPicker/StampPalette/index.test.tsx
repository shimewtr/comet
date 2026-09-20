import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StampPalette } from '.';

const originalAnimate = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'animate'
);

function animationStub() {
  return {
    cancel: vi.fn(),
    onfinish: null,
  } as unknown as Animation;
}

function renderPalette(onSelect = vi.fn()) {
  render(
    <StampPalette
      entries={[{ id: 'emoji-1f44f', name: '👏' }]}
      customStamps={[]}
      editing={false}
      onSelect={onSelect}
      onRemove={vi.fn()}
      onReorder={vi.fn()}
      onToggleEditing={vi.fn()}
    />
  );
  return {
    button: screen.getByRole('button', { name: '👏 を送る' }),
    onSelect,
  };
}

describe('StampPalette send feedback', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalAnimate) {
      Object.defineProperty(HTMLElement.prototype, 'animate', originalAnimate);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
    }
  });

  it('animates from the click event and restarts on repeated taps', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList)
    );
    const first = animationStub();
    const second = animationStub();
    const animate = vi
      .fn<typeof HTMLElement.prototype.animate>()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    const { button, onSelect } = renderPalette();

    fireEvent.click(button);
    fireEvent.click(button);

    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenLastCalledWith(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(0.9)', offset: 0.45 },
        { transform: 'scale(1)' },
      ],
      { duration: 180, easing: 'ease-out' }
    );
    expect(first.cancel).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('sends without animation when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }) as MediaQueryList)
    );
    const animate = vi.fn<typeof HTMLElement.prototype.animate>();
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      value: animate,
    });
    const { button, onSelect } = renderPalette();

    fireEvent.click(button);

    expect(animate).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
