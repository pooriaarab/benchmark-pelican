// Parts every task shares. Everything else in requiredParts is task-specific and
// separates this drawing from the other tasks in the split.
export const GATE_PARTS = ["two wheels", "bicycle frame", "handlebars", "pedals", "bird body", "bird head", "beak", "legs reaching the pedals"];
// How each check reads in prompt text when the check name itself is not used.
export const PART_PHRASES = { "bird body": "body", "bird head": "head", "beak": "beak" };
