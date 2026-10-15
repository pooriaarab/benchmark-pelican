# Structural SVG grading

The grader reads SVG text without a browser, renderer, network call, or model judge. Each task uses the same geometry checks. Labels, element IDs, and prose do not earn credit.

## Failure modes considered before implementation

1. Empty text, prose, JSON, or a tool call can be mistaken for a drawing.
2. An answer can claim every required part in element IDs without drawing it.
3. One circle can be reused as two wheels, or two tiny dots can look wheel-like to a weak counter.
4. A full-canvas rectangle can fake good coverage.
5. Hidden scripts, external images, event handlers, or remote links can turn a gallery preview into active content.
6. Regex alone can accept unbalanced tags, several roots, or a fragment wrapped around an SVG.
7. A huge or highly repetitive answer can waste memory and inflate an element-count signal.
8. Fixed coordinates can reward only the committed reference size.
9. Strict color names can miss equivalent orange and yellow hex or RGB values.
10. Structural geometry can still mistake abstract shapes for a bird on a bicycle.

The E2E gate submits empty text, random text, `yes`, and a repeated tool call. Each weak strategy must stay at or below 0.2. It also submits every generated reference drawing, which must score at least 0.85.

## Checks and weights

Unsafe, oversized, or malformed input receives zero before weighted checks run.

| Check | Weight | Evidence |
| --- | ---: | --- |
| SVG canvas | 0.10 | One `svg` root with positive dimensions or a positive `viewBox` |
| Drawing complexity | 0.10 | 12 to 200 visible geometry elements |
| Wheels | 0.20 | Two separated, similarly sized circles or ellipses in the lower region |
| Frame | 0.14 | Stroked line or path geometry joining the area between the wheels |
| Handlebars | 0.08 | A smaller stroked shape above a wheel near the frame |
| Pedals | 0.08 | A small round hub between and above the wheel centers |
| Bird body | 0.12 | A substantial round or elliptical body above the bicycle |
| Beak | 0.12 | Orange or yellow filled geometry in the upper region |
| Legs | 0.04 | Warm-colored stroked geometry spanning from body toward pedals |
| Coverage | 0.02 | Non-background geometry covers a useful fraction of both axes |

Scores are the sum of passed checks. Reasons name every passed and missed check. The grader does not use metadata labels as visual evidence.

## Safety and parsing

The answer must stay below 50 KiB. The scanner rejects declarations, doctypes, entities, unbalanced tags, multiple roots, `script`, `foreignObject`, `image`, event attributes, CSS `url()`, and external `href` values.

Coordinates are normalized against the declared canvas. This supports different SVG sizes. Path bounds are estimates from numeric coordinate pairs, so arc flags and relative commands can reduce accuracy.

## Known limits

This grader measures structural plausibility, not visual truth. It cannot prove the species, posture, occlusion, or artistic quality. A carefully constructed abstract SVG can pass. A valid drawing made mostly with transforms, nested viewports, complex relative paths, or CSS can lose credit.

The optional vision judge from the charter is not implemented in version 0.1.0. Structural and judged scores must remain separate if a later release adds it.
