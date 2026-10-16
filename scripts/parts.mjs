// Parts every task shares. Everything else in requiredParts is task-specific and
// separates this drawing from the other tasks in the split.
export const GATE_PARTS = ["two wheels", "bicycle frame", "handlebars", "pedals", "bird body", "bird head", "beak", "legs reaching the pedals"];
// How each check reads in prompt text when the check name itself is not used.
export const PART_PHRASES = { "bird body": "body", "bird head": "head" };
// Plain-language statement of what the grader measures for each task-specific
// part, inserted into the prompt so a model can draw a full score from the
// prompt alone. Every hint names real, visible geometry (mostly measured
// against the bird's own head, the wheels, or the drawing's height).
export const PART_HINTS = {
  "pouch beak": "an orange or yellow beak with a rounded pouch hanging beneath it",
  "large beak": "an orange or yellow beak more than 1.2 times as long as the head is wide and at least a third as deep",
  "long pointed beak": "a straight orange or yellow beak at least 1.6 times as long as the head is wide",
  "pointed beak": "a straight orange or yellow beak about as long as the head is wide",
  "flat beak": "a wide flat orange or yellow beak, at least four times wider than it is tall and no longer than the head is wide",
  "thin curved beak": "a thin orange or yellow beak curving downward, at least 0.85 times as long as the head is wide",
  "hooked beak": "a small orange or yellow beak that hooks downward, shorter than the head is wide",
  "tall colourful beak": "an orange or yellow beak more than half as tall as the head is wide",
  "short beak": "an orange or yellow beak at most about half as long as the head is wide",
  "long neck": "a visible neck bridging the body and the head",
  "short neck": "the head sits right against the body",
  "upright body": "a body taller than it is wide",
  "level body": "a body wider than it is tall",
  "long legs": "thin legs dangling at least half a wheel radius below the wheel axles",
  "tail feathers": "a fan of feathers trailing behind the body, taller than 0.4 times the wheel radius",
  "drop handlebars": "just above the front wheel, no higher than about half a wheelbase above the axles, curling downward in a curl taller than it is wide",
  "swept handlebars": "just above the front wheel, no higher than about half a wheelbase above the axles, curving back toward the rider",
  "handlebars": "just above the front wheel, no higher than about half a wheelbase above the axles",
  "pedals": "a small pedal or crank between the wheels, near axle height",
  "small wheels": "unusually small wheels, each radius under a seventh of the distance between the axles",
  "full-size wheels": "",
  "knobby tires": "a rugged tread: the tire stroke is at least 0.28 times the wheel radius thick — thicker counts too — or a dashed or solid second ring hugs each tire",
  "smooth tires": "",
  "fat tires": "very thick tires, the tire stroke at least a third of the wheel radius",
  "second saddle": "a second small flat saddle above the frame, between the wheels or over the rear wheel — a thin flat shape, at most a third as tall as it is wide",
  "cargo box": "a boxy cargo carrier over the front wheel",
  "rear rack": "a flat rack at least as wide as a wheel, right over the rear wheel",
  "battery pack": "a rectangular battery pack on the frame between the wheels, nearly as wide as a wheel and at least a third as tall as it is wide",
};
