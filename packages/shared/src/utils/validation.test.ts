import { describe, expect, it } from 'vitest';
import {
  isValidCommentContent,
  isValidCommentColor,
  validatePostCommentRequest,
  applyDefaultCommentStyle,
  sanitizeCommentStyle,
  isAllowedStampImageUrl,
} from './validation.js';
import { COMMENT_COLORS } from '../constants/index.js';

describe('isValidCommentContent', () => {
  it('通常のコメントを許可する', () => {
    expect(isValidCommentContent('こんにちは')).toBe(true);
  });

  it('100文字ちょうどを許可する', () => {
    expect(isValidCommentContent('あ'.repeat(100))).toBe(true);
  });

  it('101文字を拒否する', () => {
    expect(isValidCommentContent('あ'.repeat(101))).toBe(false);
  });

  it('空文字を拒否する', () => {
    expect(isValidCommentContent('')).toBe(false);
  });

  it('空白のみを拒否する', () => {
    expect(isValidCommentContent('   ')).toBe(false);
  });
});

describe('isValidCommentColor', () => {
  it('定義済みの色を許可する', () => {
    expect(isValidCommentColor(COMMENT_COLORS.WHITE)).toBe(true);
    expect(isValidCommentColor(COMMENT_COLORS.RED)).toBe(true);
  });

  it('定義外の色を拒否する', () => {
    expect(isValidCommentColor('#123456')).toBe(false);
    expect(isValidCommentColor('red')).toBe(false);
    expect(isValidCommentColor('')).toBe(false);
  });
});

describe('validatePostCommentRequest', () => {
  it('有効なリクエストを許可する', () => {
    expect(validatePostCommentRequest({ content: 'test' }).valid).toBe(true);
  });

  it('無効な内容はエラーメッセージ付きで拒否する', () => {
    const result = validatePostCommentRequest({ content: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('applyDefaultCommentStyle', () => {
  it('未指定の項目をデフォルトで埋める', () => {
    expect(applyDefaultCommentStyle()).toEqual({
      color: COMMENT_COLORS.WHITE,
      size: 'medium',
      speed: 5,
      animation: 'none',
    });
  });

  it('指定された項目はそのまま使う', () => {
    const style = applyDefaultCommentStyle({
      color: COMMENT_COLORS.RED,
      size: 'large',
    });
    expect(style.color).toBe(COMMENT_COLORS.RED);
    expect(style.size).toBe('large');
  });
});

describe('sanitizeCommentStyle', () => {
  it('有効なスタイルはそのまま通す', () => {
    const style = {
      color: COMMENT_COLORS.BLUE,
      size: 'large',
      speed: 6,
      animation: 'bounce',
    } as const;
    expect(sanitizeCommentStyle(style)).toEqual(style);
  });

  it('不正な色をデフォルトに置き換える', () => {
    expect(sanitizeCommentStyle({ color: 'javascript:evil' }).color).toBe(
      COMMENT_COLORS.WHITE
    );
  });

  it('不正なサイズをmediumに置き換える', () => {
    expect(
      sanitizeCommentStyle({ size: 'huge' as unknown as 'medium' }).size
    ).toBe('medium');
  });

  it('範囲外・非数値の速度を5に置き換える', () => {
    expect(sanitizeCommentStyle({ speed: 9999 }).speed).toBe(5);
    expect(sanitizeCommentStyle({ speed: -1 }).speed).toBe(5);
    expect(sanitizeCommentStyle({ speed: NaN }).speed).toBe(5);
  });

  it('不正なアニメーションをnoneに置き換える', () => {
    expect(
      sanitizeCommentStyle({ animation: 'spin' as unknown as 'none' }).animation
    ).toBe('none');
  });
});

describe('isAllowedStampImageUrl', () => {
  it('CloudFrontのhttps URLを許可する', () => {
    expect(
      isAllowedStampImageUrl('https://d1234abcd.cloudfront.net/custom/x.png')
    ).toBe(true);
  });

  it('httpを拒否する', () => {
    expect(
      isAllowedStampImageUrl('http://d1234abcd.cloudfront.net/x.png')
    ).toBe(false);
  });

  it('許可外のホストを拒否する', () => {
    expect(isAllowedStampImageUrl('https://evil.example.com/x.png')).toBe(
      false
    );
    // サブドメイン偽装（evil-cloudfront.netのような紛らわしいホスト）も拒否する
    expect(
      isAllowedStampImageUrl('https://xcloudfront.net/x.png')
    ).toBe(false);
  });

  it('data:やURLとして不正な文字列を拒否する', () => {
    expect(isAllowedStampImageUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isAllowedStampImageUrl('not a url')).toBe(false);
    expect(isAllowedStampImageUrl('')).toBe(false);
  });
});
