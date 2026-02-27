# Changelog

## [1.5.3](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.5.2...v1.5.3) (2026-02-27)


### Bug Fixes

* add p-4 prefix expansion and deduplicate class name regex ([b7d9fad](https://github.com/vitalis/tailwindcss-docs-mcp/commit/b7d9fad7fb34d15c718fcf3373eb608759acf78b))

## [1.5.2](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.5.1...v1.5.2) (2026-02-27)


### Bug Fixes

* improve search quality and break circular type dependency ([1022f12](https://github.com/vitalis/tailwindcss-docs-mcp/commit/1022f123338d57d2712ee9eb5898272b0d86200d))

## [1.5.1](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.5.0...v1.5.1) (2026-02-27)


### Bug Fixes

* address critical review findings across search, config, and tests ([2082143](https://github.com/vitalis/tailwindcss-docs-mcp/commit/208214327d58b46422ff80b151a342e618821b9a))

## [1.5.0](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.4.0...v1.5.0) (2026-02-27)


### Features

* stronger presentation guidance in tool descriptions ([#18](https://github.com/vitalis/tailwindcss-docs-mcp/issues/18)) ([8c1bf5d](https://github.com/vitalis/tailwindcss-docs-mcp/commit/8c1bf5d97ec72de488ef07f8fb097bea883c56b2))

## [1.4.0](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.3.0...v1.4.0) (2026-02-27)


### Features

* show server version in check_status output ([#16](https://github.com/vitalis/tailwindcss-docs-mcp/issues/16)) ([33918f1](https://github.com/vitalis/tailwindcss-docs-mcp/commit/33918f160e7e38e2b307517e35e96e929208ee19))

## [1.3.0](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.2.0...v1.3.0) (2026-02-27)


### Features

* improve MCP tool descriptions for better LLM guidance ([#14](https://github.com/vitalis/tailwindcss-docs-mcp/issues/14)) ([64089d5](https://github.com/vitalis/tailwindcss-docs-mcp/commit/64089d5759dffcda8ee12d5f9f9f83ab15172e4f))


### Bug Fixes

* consistent v4-first ordering in check_status parameter description ([521eacf](https://github.com/vitalis/tailwindcss-docs-mcp/commit/521eacf6b119867a9b799bc9de30f6181628bd94))

## [1.2.0](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.1.0...v1.2.0) (2026-02-27)


### Features

* auto-index documentation on startup ([fb7e4ae](https://github.com/vitalis/tailwindcss-docs-mcp/commit/fb7e4ae59f6dbcdc4c1bbe8f19a751d83126ff9e))


### Reverts

* remove smithery support (stdio deprecated) ([#7](https://github.com/vitalis/tailwindcss-docs-mcp/issues/7)) ([68341e2](https://github.com/vitalis/tailwindcss-docs-mcp/commit/68341e295bbd778f7468e94a6797793d7f61c583))

## [1.1.0](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.0.2...v1.1.0) (2026-02-27)


### Features

* add smithery support for marketplace distribution ([#5](https://github.com/vitalis/tailwindcss-docs-mcp/issues/5)) ([a069bb3](https://github.com/vitalis/tailwindcss-docs-mcp/commit/a069bb36339217ccbd37b9df2558cd43de3e9a0e))

## [1.0.2](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.0.1...v1.0.2) (2026-02-27)


### Bug Fixes

* list v4 first in tool schema enums to fix LLM default ([ca63789](https://github.com/vitalis/tailwindcss-docs-mcp/commit/ca63789bb2b7ef2436389258d791a7677820476d))

## [1.0.1](https://github.com/vitalis/tailwindcss-docs-mcp/compare/v1.0.0...v1.0.1) (2026-02-27)


### Bug Fixes

* **ci:** configure npm registry auth for publish step ([9fe24de](https://github.com/vitalis/tailwindcss-docs-mcp/commit/9fe24def2156c882e5a1f1853eb2606388b527b3))

## 1.0.0 (2026-02-27)


### Features

* automatic ONNX embedding model lifecycle management ([196c4c5](https://github.com/vitalis/tailwindcss-docs-mcp/commit/196c4c55128d03e9b4799b8f5d8ef34787554e3a))
* change default tailwind version from v3 to v4 ([8479d5e](https://github.com/vitalis/tailwindcss-docs-mcp/commit/8479d5e25e1295283d39eb1e690bde351fd2fcde))
* implement core pipeline (similarity, parser, chunker) ([4d7e8de](https://github.com/vitalis/tailwindcss-docs-mcp/commit/4d7e8de1084d296b8e53b98e84ce0c1fe0b83b25))
* implement embedder with ONNX model integration ([df6d70e](https://github.com/vitalis/tailwindcss-docs-mcp/commit/df6d70ed84d2a682a73379ae73c51ca4c6a1067f))
* implement github fetcher with disk caching ([2d42acc](https://github.com/vitalis/tailwindcss-docs-mcp/commit/2d42acc56d8fe90db6aad8912d042d9d1b51df88))
* implement mcp server with tool handlers and entry point ([c2d069a](https://github.com/vitalis/tailwindcss-docs-mcp/commit/c2d069a71737443bcaefbee37fdf94448749beb3))
* implement storage layer and hybrid search ([eb1b385](https://github.com/vitalis/tailwindcss-docs-mcp/commit/eb1b385e71267ae11471c9247208377bb6366b8c))
* improve search accuracy with weighted RRF, query expansion, and expanded benchmark ([d2db30b](https://github.com/vitalis/tailwindcss-docs-mcp/commit/d2db30be33996f3aa4bd2a7a21b319330c9addda))
* replace octokit with raw github fetch, add E2E tests, production readiness fixes ([0b1665d](https://github.com/vitalis/tailwindcss-docs-mcp/commit/0b1665d1724358f38a5efccfc358c31a3d5edd5f))
* scaffold tailwindcss-docs-mcp project ([a6f1ae5](https://github.com/vitalis/tailwindcss-docs-mcp/commit/a6f1ae5cd7378575253b4fda30f13f15861adf80))


### Bug Fixes

* address all critical review findings ([423f9d1](https://github.com/vitalis/tailwindcss-docs-mcp/commit/423f9d1d8a44b43cef3c61ceb16bdae5e46bcb2f))
* address round-11 review findings ([12bf397](https://github.com/vitalis/tailwindcss-docs-mcp/commit/12bf39783c1bda35a8f1b49d875de6d50b99fe53))
* address round-2 review findings ([8d91aef](https://github.com/vitalis/tailwindcss-docs-mcp/commit/8d91aef3c224316711fdf7b697b14d79aa496bfb))
* address round-3 critical review findings ([2b2755c](https://github.com/vitalis/tailwindcss-docs-mcp/commit/2b2755c37a236ca7771716aa4301e70f4f828ca9))
* address round-4 critical review findings ([ec36854](https://github.com/vitalis/tailwindcss-docs-mcp/commit/ec368544c33891bb7478c09578005e469184396d))
* address round-5 critical review findings ([cf5dd19](https://github.com/vitalis/tailwindcss-docs-mcp/commit/cf5dd1995a52f35daa16632d01aab12e0705600b))
* address round-6 critical review findings ([0e4e5a3](https://github.com/vitalis/tailwindcss-docs-mcp/commit/0e4e5a39c5343b232f9131a5c021455bd1006d2a))
* address round-7 critical review findings ([0b102b3](https://github.com/vitalis/tailwindcss-docs-mcp/commit/0b102b34e2044aec56031196504478a5bc622983))
* address round-8 critical review findings ([6a222be](https://github.com/vitalis/tailwindcss-docs-mcp/commit/6a222be28129ce77a057c31ad6cec5a2c08aacd3))
* align blobToEmbedding buffer, remove dead async, clean up check-status ([4f3869f](https://github.com/vitalis/tailwindcss-docs-mcp/commit/4f3869f190f1a28dc897041f9b9ce5b8542357da))
* ci cache key, remove dead async, type bun:sqlite import ([a424d6b](https://github.com/vitalis/tailwindcss-docs-mcp/commit/a424d6b834533ac7a7446eccd4e0effc9266690e))
* remove duplicate .mise.toml, use existing mise.toml ([7a67f4b](https://github.com/vitalis/tailwindcss-docs-mcp/commit/7a67f4b4de6d5dd47fd1e179234b24fac1343337))
