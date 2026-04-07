---
name: cursor-global-rules-placement
description: >-
  Cursor で「グローバルルール」「User Rules」「プロジェクトルール」の置き場所を扱うとき。
  ユーザーがグローバル設定の追加・移行・誤配置の修正を依頼したときに従う。
---

# Cursor ルールの置き場所（グローバルとプロジェクト）

## いつ読むか

- ユーザーが **グローバルルール**、**全プロジェクトで効かせたい**、**Cursor の設定に書きたい**と言ったとき。
- **`.cursor/rules` に書けばグローバルになるか**と聞かれたとき、または誤ってそう実装しそうになったとき。

## 公式の区分（要点）

| 置き場所 | 意味 |
|----------|------|
| **User Rules**（Cursor Settings） | そのユーザーの **全ワークスペース**向け。 |
| **Project Rules**（`.cursor/rules/*.mdc`） | **そのリポジトリ**向け。Git で共有される。 |

公式ドキュメント: https://docs.cursor.com/context/rules

## 従う手順

1. **グローバル向けの運用ルールの長文**は、**`.cursor/rules` に置かない**（メタの短い誤防止ルール用 `.mdc` は別）。
2. このリポジトリでは、貼り付け用の正本を **`docs/cursor-user-rules-global.md`** に置く。ユーザーには **Cursor → Settings → Rules（User Rules）** へこの内容をコピーするよう案内する。
3. **チーム全員に同じルールをリポジトリで配布したい**場合のみ、**Project Rules** に書く。
4. **User Rules と Project Rules に同じ長文を二重に書かない**。

## やってはいけないこと

- 「グローバルに書いて」と言われて、**`alwaysApply: true` の Project Rules に長文を書いて代替したつもりになる**こと。
- 公式の **User Rules** を経由せず、**グローバル効果を期待して `.cursor/rules` だけを更新**すること（それはプロジェクトローカルである）。
