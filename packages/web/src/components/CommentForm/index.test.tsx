import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInMemoryLocalStorage } from '../../test-utils/local-storage';
import { CommentForm } from '.';

const STORAGE_KEY = 'comet_comment_style_settings';

// 職人設定はチップを押すとメニューが開くので、チップを開いてから選択肢を選ぶ
function chooseSetting(label: string, optionLabel: string) {
  fireEvent.click(
    screen.getByRole('button', { name: new RegExp(`^${label}:`) })
  );
  fireEvent.click(screen.getByRole('menuitemradio', { name: optionLabel }));
}

describe('CommentForm', () => {
  useInMemoryLocalStorage();
  afterEach(cleanup);

  it('shows the current settings as chips and opens a menu on click', () => {
    render(<CommentForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'サイズ: 中' })).toBeTruthy();
    expect(screen.queryByRole('menu', { name: 'サイズ' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'サイズ: 中' }));
    expect(screen.getByRole('menu', { name: 'サイズ' })).toBeTruthy();
    expect(
      screen
        .getByRole('menuitemradio', { name: '中' })
        .getAttribute('aria-checked')
    ).toBe('true');

    fireEvent.click(screen.getByRole('menuitemradio', { name: '大' }));

    // 選んだらメニューは閉じ、チップの表示が新しい値になる
    expect(screen.queryByRole('menu', { name: 'サイズ' })).toBeNull();
    expect(screen.getByRole('button', { name: 'サイズ: 大' })).toBeTruthy();
  });

  it('does not submit while a Room is joining', () => {
    const onSubmit = vi.fn();
    render(<CommentForm disabled onSubmit={onSubmit} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('saves and restores the selected appearance when enabled', () => {
    const { unmount } = render(<CommentForm onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '設定を保存' }));
    chooseSetting('サイズ', '大');
    chooseSetting('速度', '速い');

    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toMatchObject(
      { size: 'large', speedOption: 'fast' }
    );

    unmount();
    render(<CommentForm onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'サイズ: 大' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '速度: 速い' })).toBeTruthy();
    expect(
      screen.getByRole<HTMLInputElement>('checkbox', { name: '設定を保存' })
        .checked
    ).toBe(true);
  });

  it('submits with the chosen style', () => {
    const onSubmit = vi.fn();
    render(<CommentForm onSubmit={onSubmit} />);
    chooseSetting('色', '赤');
    chooseSetting('サイズ', '大');
    chooseSetting('速度', '速い');
    chooseSetting('アニメーション', 'バウンド');

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.submit(input.closest('form')!);
    expect(onSubmit).toHaveBeenCalledWith('hello', {
      color: '#FF0000',
      size: 'large',
      speed: expect.any(Number),
      animation: 'bounce',
    });
  });

  it('previews the entered comment with the selected appearance', () => {
    render(<CommentForm onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'プレビューするコメント' },
    });
    chooseSetting('色', '赤');
    chooseSetting('サイズ', '大');
    chooseSetting('アニメーション', 'バウンド');

    const preview = screen.getByLabelText('コメントのプレビュー');
    const text = preview.querySelector<HTMLElement>('.comment-preview-text');
    expect(text?.textContent).toBe('プレビューするコメント');
    expect(text?.style.color).toBe('rgb(255, 0, 0)');
    expect(text?.style.fontSize).toBe('78px');
    expect(text?.classList.contains('comment-preview-animation-bounce')).toBe(
      true
    );
  });

  it('shows guidance before a comment is entered', () => {
    render(<CommentForm onSubmit={vi.fn()} />);
    expect(
      screen.getByText('コメントを入力するとプレビューできます')
    ).toBeTruthy();
  });

  it('resets every setting to the defaults with one click', () => {
    render(<CommentForm onSubmit={vi.fn()} />);
    const reset = screen.getByRole<HTMLButtonElement>('button', {
      name: '設定をリセット',
    });
    // 初期値のままなら押せない
    expect(reset.disabled).toBe(true);

    chooseSetting('サイズ', '大');
    chooseSetting('速度', '速い');
    fireEvent.click(screen.getByRole('button', { name: '盛り上げモード' }));
    expect(reset.disabled).toBe(false);

    fireEvent.click(reset);
    expect(screen.getByRole('button', { name: 'サイズ: 中' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '速度: 普通' })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: '盛り上げモード' })
        .getAttribute('aria-pressed')
    ).toBe('false');
    expect(reset.disabled).toBe(true);
  });

  it('disables the style chips while the danmaku mode is on', () => {
    render(<CommentForm onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '盛り上げモード' }));
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'サイズ: 中' })
        .disabled
    ).toBe(true);
  });
});
