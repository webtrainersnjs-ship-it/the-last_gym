# RIVA 長浜 WOMEN'S FITNESS — LP

女性専用フィットネス「RIVA 長浜 WOMEN'S FITNESS」のランディングページ。
Figma デザインをもとに、HTML + SCSS で実装しています。

## 構成

- 3カラムレイアウト
  - 左カラム：ロゴ（`position: fixed`）
  - 中央カラム：メインコンテンツ（最大幅 430px・中央配置・ここだけ縦スクロール）
  - 右カラム：グローバルナビ＋CTAボタン（`position: fixed`）
- 左右カラムは常に画面内に固定され、中央カラムのみスクロールします。
- `1080px` 未満では左右カラムを隠し、ハンバーガーメニュー（ドロワー）に切り替わります。

## ファイル

```
index.html          … マークアップ（BEM / セマンティックタグ）
css/style.css       … コンパイル済み CSS（scss/style.scss を出力したもの）
scss/
  style.scss        … メインの SCSS（各パーシャルを @use で読み込み）
  _variables.scss   … 色・フォント・サイズなどの共通変数
  mixin.scss        … 共通スタイルの mixin 集
  _reset.scss       … リセット CSS（支給されたもの・未編集）
images/             … 画像（現状はダミー。README 参照）
```

## ビルド

```bash
npx sass scss/style.scss css/style.css
```
