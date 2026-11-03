# Terrain Query Implementation Plan

> Execute with superpowers:executing-plans. User requires one agent; no delegation.

**Goal:** 広域地図と実寸の対応を保つ、読取専用の地形問い合わせを追加する。
**Architecture:** 独立ESモジュール。配列を共有し、既存HTMLには接続しない。
**Tech Stack:** JavaScript ES modules / Node test runner
**Spec:** ../specs/2026-11-03-terrain-query-design.md

## Global Constraints
単一エージェント。main直接変更・マージ・配信なし。既存HTML・Seed・保存形式・交通アダプターを変更しない。

## Review Focus
端点、半セルずれ、矩形の世界、配列変更後の読み取り、未確定の水面を誤って地面と扱うこと。

## Task 1: Coordinates and base terrain queries
**Files:** src/geography/world-terrain.mjs, tests/world-terrain.test.mjs
**Interfaces:** createWorldTerrain(world, options) → 座標変換とsampleBaseを持つ読取専用アダプター。
- [x] 独立した期待値で座標・標高・水域・入力境界のテストを書く。
- [x] 実装前に失敗を確認する。
- [x] 上記仕様だけを実装する。
- [x] 全テストを実行し、元HTMLのblob SHAを検証する。
- [x] 単独レビュー後、mainから新規作業ブランチに1コミットを作る。main不変とコミット差分を確認する。
