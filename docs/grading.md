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

The E2E gate runs empty, random, always-yes, always-refuse, same-tool-call, and abstract-shapes strategies over every task; each must stay at or below 0.2. Every generated reference drawing must score exactly 1.0 on its own task, on both splits. The real memorised-reference attack replays every task's reference against every other task: no pair may exceed 0.4, the mismatched mean stays at or below 0.3, and the best single memorised reference averages at most 0.4 across the suite. Honest formatting variants (fence, prose, prolog, comments, text elements, entities) must score high, and every checked part must be readable in the prompt text.

## Answer extraction

An honest reply is accepted even when it is not bare markup. The scanner takes the last fenced code block containing `<svg` when fences exist, then the span from the first `<svg` to the last `</svg>`. Prolog `<?xml ...?>` lines, `<!-- comments -->`, and `<!doctype>` declarations are stripped. The five XML entities and numeric character references are allowed; other entities are rejected.

## Safety and parsing

The answer must stay below 50 KiB. The scanner rejects `script`, `foreignObject`, `image`, `use`, `a`, and `animate` elements, event attributes, CSS `url()` values that are not local fragments, and non-fragment `href` values. Text content is only allowed inside `title`, `desc`, `text`, `tspan`, and `style` elements. A `style` element may only hold `.class { prop: value }` rules for paint properties (fill, stroke, stroke-width, dash pattern, line caps); any other CSS — at-rules, element or id selectors, urls — is rejected. Path bounds are computed by replaying `M L H V C S Q T A Z` commands, including relative forms.

Fill and stroke are resolved the way a renderer would: inherited from ancestors (`<g fill="...">`), then the element's own presentation attribute, then matching `style` class rules, then inline `style="..."`. A shape with no fill anywhere paints its default black.

## Measuring against the drawing, not the canvas

Every geometric check is measured against the drawing's own extent — the bounding box of the bird-plus-vehicle figure — or against named parts (the head width, the wheel radius, the wheelbase, the band above the wheel line). Nothing is measured against the `viewBox` or `width`/`height`, so scaling or translating the whole drawing leaves every check, and the score, unchanged. The E2E proves this by rescaling and shifting every reference drawing and asserting identical scores.

The extent deliberately excludes decoration: a background rectangle covering the canvas, any long thin horizontal stroke such as a ground line or horizon, and any shape that does not touch the connected bird-and-bicycle figure (a sun or cloud in a corner). Adding or removing any of those leaves every check unchanged, which the E2E verifies per reference drawing.

## Checks and scoring

Unsafe, oversized, or malformed input receives zero before checks run. The score is multiplicative:

```text
score = sharedGate x taskFit
taskFit = 0.4 ^ (missed required task-specific parts + unrequested task-specific parts drawn)
```

The shared gate holds the checks every task asks for: safe well-formed markup, two wheels, a bicycle frame, handlebars, pedals, a bird body, a bird head, a beak, legs reaching the pedals, and canvas coverage. The task fit holds the parts that change per task: the named animal's beak style, neck, body posture, legs and extras, and the named vehicle's handlebar style, wheel size, tire class, and extras. A memorised drawing of the wrong bird fails the specific checks instead of coasting on the shared ones, and a drawing that adds parts the task never asked for is penalised the same way.

Each task's `metadata.requiredParts` lists the parts the prompt states; the generator asserts every checked part appears in the prompt text, and each prompt spells out what the grader measures in plain terms with the real numbers where a check needs one ("a straight orange or yellow beak at least 1.6 times as long as the head is wide"). The E2E includes a prompt-only policy that parses the prompt text alone and draws simple literal shapes on canvases of different sizes; measured today, that policy earns 1.0 on all 30 public tasks and all 30 tasks on two hidden seeds, so a drawing that follows every stated part earns a perfect score. Each missed or improvised specific part costs a 0.4x multiplier. The E2E also replays every task's reference drawing on every other task in both splits, so the separation is measured rather than assumed.

### Shared gate checks

| Check | Weight | Evidence |
| --- | ---: | --- |
| svg canvas | 0.05 | One `svg` root with positive dimensions or a positive `viewBox` |
| complexity | 0.08 | 12 to 200 visible geometry elements |
| coverage | 0.02 | The drawing's own extent is non-degenerate: a landscape scene, not a thin strip |
| two wheels | 0.15 | Two separated, similarly sized circles or ellipses in the lower region |
| bicycle frame | 0.11 | Stroked geometry spanning the gap between the wheels, above wheel centres |
| handlebars | 0.06 | Stroked geometry in the front half of the bicycle, in the band just above the wheel line |
| pedals | 0.05 | A small shape (a crank hub or pedal) between the wheels, near axle height |
| bird body | 0.12 | The largest substantial round or elliptical body above the bicycle |
| bird head | 0.07 | A smaller round above and ahead of the body |
| beak | 0.10 | Warm-coloured filled geometry overlapping the head zone |
| legs reaching the pedals | 0.05 | Stroked geometry descending from the body region to the pedal zone |

### Task-specific checks

Each task requires its own subset, and a passing check the task did not request counts against the fit. Beak and handlebar styles are exclusive: the warm geometry near the head classifies into exactly one beak style, and the bar zone classifies into exactly one bar style, so a drawing can satisfy at most one of each.

| Check | Evidence |
| --- | --- |
| beak styles | Exactly one, all measured against the head width D: pouch (a second warm shape hanging below), large (at least 1.2 D long and 0.35 D deep), long pointed (straight, at least 1.6 D), pointed (straight, 0.55-1.6 D), flat (straight, at least 4x wider than tall, at most 1.05 D), thin curved (curved downward, at least 0.85 D), tall colourful (at least 0.55 D deep), hooked (curved, under 0.85 D), short (straight, under 0.55 D) |
| neck | `long neck` (a stroked bridge from body to head) or `short neck` |
| body posture | `upright body` (at least as tall as wide) or `level body` |
| long legs | A thin leg stroke leaving the body and dropping clearly below the wheel axles |
| tail feathers | Filled geometry with real height behind the body |
| bar styles | Exactly one of: drop handlebars, swept handlebars, or plain handlebars |
| wheel size | `small wheels` (radius under 14% of the scene's height) or `full-size wheels` |
| tires | `knobby tires` (thick tread or concentric outer ring), `fat tires` (very thick tread), or `smooth tires` |
| extras | `second saddle`, `cargo box`, `rear rack`, `battery pack` (a rect between the wheels nearly as wide as a wheel, so an ordinary rectangular saddle does not count) |

Warm colours mean orange through yellow hues only; cream and near-white fills do not count. Beak checks read geometry that overlaps the head zone, so a stray warm rectangle elsewhere does not pass.

## Caps

If a drawing shows no bicycle evidence (no wheel pair and no frame) or no bird evidence (no warm beak shape near a head or a body), the score caps at 0.2 regardless of part checks. A bicycle with no rider and a pile of abstract shapes both stop here.

## Report breakdown

`run` and `score` output includes `checkSummary` (pass rate per check across the report) and per-row `details` (each check's name, weight, and outcome). The same fields appear in the JSON report and in `POST /v1/score` responses.

## Known limits

This grader measures structural plausibility, not visual truth. It can claim that the parts each prompt names are present, shaped like the named part, and arranged plausibly; it cannot prove the species, posture, occlusion, or artistic quality. "Does it look like a pelican" belongs to the optional vision judge from the charter, which is not implemented in version 0.2.0 and stays off by default and unscored. A drawing of a different animal that happens to satisfy the same part list can still earn credit, and a valid drawing made mostly with transforms or nested viewports can lose credit. Arc bounds are approximated by their endpoints.

Structural and judged scores must remain separate if a later release adds the judge.
