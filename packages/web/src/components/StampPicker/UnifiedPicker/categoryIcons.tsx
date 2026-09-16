import type { ReactNode } from 'react';
import { Categories, type CategoryIcons } from 'emoji-picker-react';
import cometIconUrl from '../../../assets/comet-icon.png';

/**
 * カテゴリタブのアイコン。
 * ライブラリ標準のスプライト画像は色が固定なので、currentColor で描く線画に差し替え、
 * 未選択（補助テキスト色）／選択中（ブルー）の色分けを style.scss 側で行えるようにする
 */
/**
 * 検索タブ（先頭タブ）のアイコンに付けるマーカークラス。
 * categoryIcons を渡すとライブラリは epr-icn-* クラスを付けなくなるため、
 * UnifiedPicker の判定と style.scss の :has() はこのクラスを使う
 */
export const SEARCH_TAB_ICON_CLASS = 'stamp-tab-icon-search';

// コンポーネントではなく関数にしておく（この module は定数を export するため、
// react-refresh の only-export-components ルールに掛からないようにする）
function lineIcon(children: ReactNode, className?: string): ReactNode {
  return (
    <svg
      className={className}
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const CATEGORY_ICONS: CategoryIcons = {
  // 先頭タブは検索タブとして使う（UnifiedPicker 参照）
  [Categories.SUGGESTED]: lineIcon(
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>,
    SEARCH_TAB_ICON_CLASS
  ),
  [Categories.SMILEYS_PEOPLE]: lineIcon(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5s1.3 1.8 3.5 1.8 3.5-1.8 3.5-1.8" />
      <path d="M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  [Categories.ANIMALS_NATURE]: lineIcon(
    <>
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z" />
    </>
  ),
  [Categories.FOOD_DRINK]: lineIcon(
    <>
      <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />
      <path d="M7 2v20" />
      <path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />
    </>
  ),
  [Categories.TRAVEL_PLACES]: lineIcon(
    <>
      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <circle cx="7" cy="17" r="2" />
      <path d="M9 17h6" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  [Categories.ACTIVITIES]: lineIcon(
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M19.13 5.09C15.22 9.14 10 10.44 2.25 10.94" />
      <path d="M21.75 12.84c-6.62-1.41-12.14 1-16.38 6.32" />
      <path d="M8.56 2.75c4.37 6 6 9.42 8 17.72" />
    </>
  ),
  [Categories.OBJECTS]: lineIcon(
    <>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </>
  ),
  [Categories.SYMBOLS]: lineIcon(
    <>
      <path d="M4 9h16" />
      <path d="M4 15h16" />
      <path d="M10 3 8 21" />
      <path d="M16 3l-2 18" />
    </>
  ),
  [Categories.FLAGS]: lineIcon(
    <>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22v-7" />
    </>
  ),
  // カスタム（オリジナルスタンプ）は Comet のアイコン画像。色フィルターは掛けず濃淡だけで状態を表す
  [Categories.CUSTOM]: (
    <img
      className="epr-cat-icon-image"
      src={cometIconUrl}
      alt=""
      width={22}
      height={22}
    />
  ),
};
