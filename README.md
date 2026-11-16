# Fast Markdown renderer

[![make.fun bounty](https://make.fun/badge/markdown-render-speed-02.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![make.fun rank](https://make.fun/badge/markdown-render-speed-02/athemeroy/markdown-render-fast-v2/rank.svg)](https://make.fun/bounty/markdown-render-speed-02)
[![make.fun reward](https://make.fun/badge/markdown-render-speed-02/athemeroy/markdown-render-fast-v2/reward.svg)](https://make.fun/bounty/markdown-render-speed-02)

A dependency-free CommonMark and GFM renderer for the make.fun
markdown-render-speed-02 competition. `parse.js` exports synchronous
`parse(markdown)`, targeting byte-for-byte HTML compatibility with Marked 18.1.3
under its default options.

Run with Node.js 22.23.4 or newer:

```sh
node main.ts
```

The driver reads `/input/cases.json`, an array of objects with `id` and
`markdown`, and writes `/output/html.json`, an array of HTML strings in input
order. Set `MAKEFUN_INPUT_DIR` and `MAKEFUN_OUTPUT_DIR` to use local directories.
No dependency installation or network access is needed.

The vendored Marked implementation is unchanged and retains its license and
notice in `vendor/marked/`. The entry's own code uses the MIT license.

## Implementation

The renderer reuses one lexer and parser, and resets all document state on every
call. Plain inline text bypasses tokenization. Other inline tokens dispatch by
their first character when no emphasis delimiter mask is needed. GFM text uses
an equivalent expression without email searches when the remaining input has
no `@`. Code spans avoid redundant normalization, and the five list marker
expressions are compiled once. Complex syntax retains Marked's implementation.
No case output, input text or reference definitions are cached between calls.

The driver serializes each HTML string before rendering the next document,
then joins those JSON strings into the output array.

## Local validation and timing

Measured on 2026-11-16 with Node.js v24.21.0 and the kit's practice set.
These are local elapsed times, not the competition's container CPU scores.

- Initial implementation: 720/720, `elapsed_ms: 1238.54`.
- First optimization pass: 720/720, `elapsed_ms: 1183.31`.
- Final implementation: 720/720, `elapsed_ms: 1066.24`.
- Final differential checks: 12,000 generated Markdown strings matched Marked,
  including entities, malformed syntax, raw HTML and Unicode. Sequential calls
  also matched after reference definitions and unclosed raw HTML blocks.
- End to end: `node main.ts` rendered the practice input through both directory
  environment variables. All 720 output strings matched the expected HTML. The
  temporary output directory was removed in a `finally` block.

A three-pair check ran the baseline and final renderer in separate fresh Node
processes, alternating their order. Every run passed 720/720. Baseline times
were 1325.35, 1218.15 and 1264.32 ms; optimized times were 1060.14, 1148.52 and
1489.91 ms. Their medians were 1264.32 and 1148.52 ms, respectively: 1.10x
speedup, or 9.2% less elapsed time. One optimized run was slower than baseline.
A separate same-process comparison after full warm-up measured medians of
1030.43 ms for baseline and 1047.81 ms for this renderer. Performance depends
on process warm-up and host load; the competition starts a fresh process.

The competition's Node 22 container and undisclosed scored set have not been
run locally. The practice set and expected HTML are not included in this repo.
