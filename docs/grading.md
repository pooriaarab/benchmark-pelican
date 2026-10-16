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

## Measuring against the vehicle's own wheels

The wheels are found first: the two circles that a frame line or path actually connects — a stroked line, path, or polyline whose bounds reach within half a wheel radius of both centres. The pair must be alike in size, roughly level, and clearly separated; a concentric outer ring hugging a wheel is a tyre ring, not a wheel, and a loose circle — a sun, a ball, a hub dot — is never a wheel because no frame reaches it. A drawing whose frame misses the hubs falls back to the lowest similar round pair so the reasons stay accurate.

Every geometric check is then derived from the vehicle itself: the wheel radius R, the wheelbase WB between the axles, and the axle line axleY. No check reads the canvas, the `viewBox`, or the size of the whole drawing, so scaling, translating, or widening the canvas leaves every score unchanged. The E2E proves this by rescaling and shifting every reference drawing, and by widening the canvas to 1000, 1280, and 1600 with a full-width ground line, a ground band, or no ground — all scores identical.

The figure is whatever touches the wheels, transitively, within a hairline pad for anti-aliasing gaps. Two kinds of decoration can never join: a background rectangle covering the canvas, and any long thin horizontal stroke or band wider than 1.35 wheelbases and under a fifth as tall as it is wide (a ground line, a horizon, a sky band). A detached shape — a sun, a cloud — that does not touch the figure cannot join either. One limit remains, measured: a shape that literally overlaps the figure counts as part of it. In a seeded sweep of 200 warm suns scattered over the reference drawings, 13 moved a score and every one of them touched the figure; no detached decoration ever did.

Part checks see only the connected figure, with one deliberate exception: a beak is warm-coloured geometry that overlaps the head it hangs from, or a pouch — a second warm shape that starts under the head and hangs clearly below the head's centre line and below the beak's lower edge. A warm dot at the beak's far edge or inside the beak's own bounds can neither be a pouch nor reclassify the beak.

## Checks and scoring

Unsafe, oversized, or malformed input receives zero before checks run. The score is multiplicative:

```text
score = sharedGate x taskFit
taskFit = 0.4 ^ (missed required task-specific parts + unrequested task-specific parts drawn)
```

The shared gate holds the checks every task asks for: safe well-formed markup, two wheels, a bicycle frame, handlebars, pedals, a bird body, a bird head, a beak, legs reaching the pedals, and canvas coverage. The task fit holds the parts that change per task: the named animal's beak style, neck, body posture, legs and extras, and the named vehicle's handlebar style, wheel size, tire class, and extras. A memorised drawing of the wrong bird fails the specific checks instead of coasting on the shared ones, and a drawing that adds parts the task never asked for is penalised the same way.

Each task's `metadata.requiredParts` lists the parts the prompt states; the generator asserts every checked part appears in the prompt text, and each prompt spells out what the grader measures in plain terms with the real numbers where a check needs one ("a straight orange or yellow beak at least 1.6 times as long as the head is wide", "a tire stroke at least 0.28 times the wheel radius thick — thicker counts too"). The E2E includes a prompt-only policy that parses the prompt text alone — never `task.expected` or `task.metadata` — and draws simple literal shapes on 1000x600 and 640x480 canvases, with a prompt-hash choice of no ground, a ground line, or a ground band, sharing no layout code with the task generator. Measured today, that deliberately naive policy earns a mean of 1.000 and at least 0.8 on all 30 public tasks and all 30 tasks on two hidden seeds. That is a measured floor for one literal policy, not a promise about every drawing: a part placed oddly or shaped outside its stated description can still miss its check. Each missed or improvised specific part costs a 0.4x multiplier. The E2E also replays every task's reference drawing on every other task in both splits, so the separation is measured rather than assumed.

### Shared gate checks

| Check | Weight | Evidence |
| --- | ---: | --- |
| svg canvas | 0.05 | One `svg` root with positive dimensions or a positive `viewBox` |
| complexity | 0.08 | 8 to 200 shapes in the connected figure |
| coverage | 0.02 | The drawing's own extent is non-degenerate: a landscape scene, not a thin strip |
| two wheels | 0.15 | Two similar, roughly level, clearly separated circles or ellipses that a frame line or path reaches at both centres |
| bicycle frame | 0.11 | Stroked geometry spanning the gap between the wheels, reaching above the axle line |
| handlebars | 0.06 | Stroked geometry over the front wheel, in the band just above the axle line and no higher than about half a wheelbase above the axles; warm-coloured geometry never counts (it is beak territory) |
| pedals | 0.05 | A small shape (a crank hub or pedal) between the wheels, near axle height |
| bird body | 0.12 | The largest substantial round or elliptical body above the axle line |
| bird head | 0.07 | A smaller round above and ahead of the body |
| beak | 0.10 | Warm-coloured filled geometry attached to the head |
| legs reaching the pedals | 0.05 | Stroked geometry descending from the body region to the pedal zone |

### Task-specific checks

Each task requires its own subset, and a passing check the task did not request counts against the fit. Beak and handlebar styles are exclusive: the warm geometry near the head classifies into exactly one beak style, and the bar zone classifies into exactly one bar style, so a drawing can satisfy at most one of each.

| Check | Evidence |
| --- | --- |
| beak styles | Exactly one, all measured against the head width D: pouch (a second warm shape hanging below), large (at least 1.2 D long and 0.35 D deep), long pointed (straight, at least 1.6 D), pointed (straight, 0.55-1.6 D), flat (straight, at least 4x wider than tall, at most 1.05 D), thin curved (curved downward, at least 0.85 D), tall colourful (at least 0.55 D deep), hooked (curved, under 0.85 D), short (straight, under 0.55 D) |
| neck | `long neck` (a stroked bridge from body to head) or `short neck` |
| body posture | `upright body` (at least as tall as wide) or `level body` |
| long legs | A thin leg stroke leaving the body and dropping clearly below the wheel axles |
| tail feathers | Filled geometry with real height trailing just behind the body |
| bar styles | Exactly one of: drop handlebars (a curl taller than it is wide), swept handlebars (a curve sweeping back toward the rider), or plain handlebars |
| wheel size | `small wheels` (each wheel radius under a seventh of the wheelbase) or `full-size wheels` |
| tires | `knobby tires` (a tire stroke at least 0.28 times the wheel radius — no upper bound — a dashed tread line, or a second ring hugging the tire), `fat tires` (at least a third of the wheel radius), or `smooth tires`. A fat tire counts as a rugged tire too: when a task asks for knobby tires an extra-thick stroke is not an unrequested part |
| extras | `second saddle` (a second small flat filled seat — ellipse, rect, or filled path — above the frame, between the wheels or over the rear wheel, narrower than a wheel and at most a third as tall as it is wide), `cargo box` (a boxy filled carrier over the front wheel), `rear rack` (a thin flat rect at least as wide as a wheel, right over the rear wheel), `battery pack` (a rect on the frame between the wheels, nearly as wide as a wheel and at least a third as tall as it is wide) |

Warm colours mean orange through yellow hues only; cream and near-white fills do not count. Beak checks read only warm geometry that overlaps the head (or hangs below an attached beak), so a stray warm shape elsewhere — a sun, a label — neither passes as a beak nor reclassifies one.

## Caps

If a drawing shows no bicycle evidence (no wheel pair and no frame) or no bird evidence (no warm beak shape near a head or a body), the score caps at 0.2 regardless of part checks. A bicycle with no rider and a pile of abstract shapes both stop here.

## Report breakdown

`run` and `score` output includes `checkSummary` (pass rate per check across the report) and per-row `details` (each check's name, weight, and outcome). The same fields appear in the JSON report and in `POST /v1/score` responses.

## Known limits

This grader measures structural plausibility, not visual truth. It can claim that the parts each prompt names are present, shaped like the named part, and arranged plausibly; it cannot prove the species, posture, occlusion, or artistic quality. "Does it look like a pelican" belongs to the optional vision judge from the charter, which is not implemented in version 0.2.0 and stays off by default and unscored. A drawing of a different animal that happens to satisfy the same part list can still earn credit, and a valid drawing made mostly with transforms or nested viewports can lose credit. Arc bounds are approximated by their endpoints.

Structural and judged scores must remain separate if a later release adds the judge.
