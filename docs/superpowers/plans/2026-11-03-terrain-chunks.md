# Terrain Chunks Implementation Plan

> Execute inline with superpowers:executing-plans. Single agent, no delegation.

**Goal:** 小範囲の描画地形と同じ三角形を使う接地判定を作る。
**Architecture:** world-terrainを読む純粋なチャンク生成モジュールと独立した検証ページ。
**Tech Stack:** ES modules / Three.js r128 / Node test runner / Playwright
**Spec:** ../specs/2026-11-03-terrain-chunks-design.md

## Global Constraints
既存HTML、main、保存形式、配信中サイトは変更しない。単一エージェント。

## Review Focus
三角形内部の高さ、共有辺、世界端、Float32局所座標、標高変更後のスナップショット。

## Task 1
- [x] tests/terrain-chunk.test.mjsを先に作成し、未実装の失敗を確認。
- [x] src/geography/terrain-chunk.mjsにcreateTerrainChunk(terrain, options)を追加。
- [x] previews/terrain-chunks.htmlとpreviews/terrain-chunks.mjsで9チャンクと1.7mの目印を描画。
- [x] 全Nodeテスト、Three.js Raycaster比較、既存生成器を使ったブラウザ確認を行う。
- [x] 差分レビュー後、既存の作業ブランチに1コミット。mainと配信は維持。
