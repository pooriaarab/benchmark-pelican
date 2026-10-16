# Structural SVG grading

The grader reads SVG text without a browser, renderer, network call, or model judge. Each task carries its own `metadata.requiredParts` list, so a memorised drawing cannot ace every task. Labels, element IDs, and prose do not earn credit.

## Failure modes considered before implementation

1. Empty text, prose, JSON, or a tool call can be mistaken for a drawing.
2. An answer can claim every required part in element IDs without drawing it.
3. One circle can be reused as two wheels, or two tiny dots can look wheel-like to a weak counter.
4. A full-canvas rectangle can fake good coverage.
5. Hidden scripts, external images, event handlers, or remote links can turn a gallery preview into active content.
6. Regex alone can accept unbalanced tags, several roots, or a fragment wrapped around an SVG.
7. A huge or highly repetitive answer can waste memory and inflate an element-count signal.
8. Fixed coordinates can reward only the committed reference size.
9. Strict colour names can miss equivalent orange and yellow hex or RGB values, while loose hex matching counts cream and white as warm.
10. One memorised drawing can answer every task unless scoring reads each task's required parts.
11. Relative path commands can produce wrong bounds when coordinates are read as absolute pairs.

The E2E gate runs empty, random, always-yes, always-refuse, same-tool-call, constant-SVG, and abstract-shapes strategies over every task; each must stay at or below 0.2. It also submits every generated reference drawing, which must score at least 0.85, honest formatting variants (fence, prose, prolog, comments, text elements, entities), which must score high, and a memorised pelican on non-pelican tasks, which must score below 1.

## Answer extraction

An honest reply is accepted even when it is not bare markup. The scanner takes the last fenced code block containing `<svg` when fences exist, then the span from the first `<svg` to the last `</svg>`. Prolog `<?xml ...?>` lines, `<!-- comments -->`, and `<!doctype>` declarations are stripped. The five XML entities and numeric character references are allowed; other entities are rejected.

## Safety and parsing

The answer must stay below 50 KiB. The scanner rejects `script`, `foreignObject`, `image`, `use`, `a`, `style`, and `animate` elements, event attributes, CSS `url()` values that are not local fragments, and non-fragment `href` values. Text content is only allowed inside `title`, `desc`, `text`, and `tspan` elements. Path bounds are computed by replaying `M L H V C S Q T A Z` commands, including relative forms.

## Checks and weights

Unsafe, oversized, or malformed input receives zero before weighted checks run. Each task's `requiredParts` chooses which part checks apply; the score is the share of total weight passed. Every row in the table exists in `src/svg-grader.ts`.

| Check | Weight | Evidence |
| --- | ---: | --- |
| svg canvas | 0.05 | One `svg` root with positive dimensions or a positive `viewBox` |
| complexity | 0.08 | 12 to 200 visible geometry elements |
| coverage | 0.02 | Non-background geometry covers a useful fraction of both axes |
| svg root | 0.04 | The extracted block parses as one balanced SVG |
| two wheels | 0.15 | Two separated, similarly sized circles or ellipses in the lower region |
| bicycle frame | 0.11 | Stroked geometry spanning the gap between the wheels, above wheel centres |
| handlebars | 0.06 | Stroked geometry above and ahead of the front wheel |
| drop handlebars | 0.06 | Handlebar-zone stroked path containing a curve command |
| swept handlebars | 0.06 | Handlebar-zone stroked shape wider than 7% of the canvas |
| pedals | 0.05 | A small round hub between the wheels, above wheel centres |
| long wheelbase | 0.04 | Wheel separation above 55% of canvas width (tandems) |
| second saddle | 0.04 | Two small flat shapes along the frame top |
| cargo box | 0.05 | A large filled rect or polygon beside a wheel |
| rear rack | 0.04 | A thin wide rect over the rear wheel |
| battery pack | 0.04 | A filled rect on the frame between the wheels |
| knobby tires | 0.05 | Thick wheel strokes or concentric outer rings |
| small wheels | 0.05 | Wheels under 9% of canvas width (folders, BMX) |
| bird body | 0.12 | A substantial round or elliptical body above the bicycle |
| upright body | 0.12 | A body ellipse at least as tall as wide |
| bird head | 0.07 | A smaller round above and ahead of the body |
| long neck | 0.05 | A stroked connector spanning head to body |
| legs reaching the pedals | 0.05 | Stroked geometry descending from the body region to the pedal zone |
| long legs | 0.04 | Thin or very long leg strokes |
| tail feathers | 0.04 | Filled geometry behind the body |
| beak styles | 0.10 | Warm-coloured filled geometry near the head, sized and shaped per style: pouch, curved, large, long pointed, flat, orange, hooked, short, small hooked, thin curved, tall colourful, pointed |

Warm colours mean orange through yellow hues only; cream and near-white fills no longer count. Beak checks read geometry that overlaps the head zone, so a stray warm rectangle elsewhere does not pass.

## Caps

If a drawing shows no bicycle evidence (no wheel pair and no frame) or no bird evidence (no warm beak shape near a head or a body), the score caps at 0.2 regardless of part checks. A bicycle with no rider and a pile of abstract shapes both stop here.

## Report breakdown

`run` and `score` output includes `checkSummary` (pass rate per check across the report) and per-row `details` (each check's name, weight, and outcome). The same fields appear in the JSON report and in `POST /v1/score` responses.

## Known limits

This grader measures structural plausibility, not visual truth. It cannot prove the species, posture, occlusion, or artistic quality, so a well-formed drawing of the wrong bird can still earn partial credit on tasks whose required parts it happens to satisfy; the hidden split exists for that reason. A valid drawing made mostly with transforms, nested viewports, or CSS can lose credit. Arc bounds are approximated by their endpoints.

The optional vision judge from the charter is not implemented in version 0.2.0. Structural and judged scores must remain separate if a later release adds it.
