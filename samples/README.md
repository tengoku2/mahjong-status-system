# TANKIサンプルの扱い

TANKIの原本ファイル、パッケージ、未加工ログ、スクリーンショット、抽出した生データはコミットしないでください。

ローカル専用フォルダとして使う場所:

- `samples/private/`: 原本を置く場所
- `samples/sanitized/`: 構造サマリや伏せ字済み出力を置く場所

どちらのフォルダもGit管理外です。

共有用の構造サマリを作る例:

```bat
scripts\with-node22.cmd exec -- tsx scripts\sanitize-tanki-sample.ts samples\private\sample.json --mode summary
```

`--mode redacted` はローカル確認用です。元のフィールド名が残る可能性があるため、ライセンス対象の内部構造が含まれていないことを手動確認するまでは共有しないでください。
