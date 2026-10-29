# Pelican structural drawing study plan

Frozen before new study data. Prior evidence: the benchmark's grading guide and E2E source were read. The accepted honesty pilot supplies only the shared template. This is a local prospective plan, not an independent registration. No venue deposit is authorized.

Question: does structural grading separate prompt-conditioned drawings from fixed drawings, and how does a simulated error population change the score?
H1: task references and the existing builder's literal prompt policy have greater mean scores than empty, constant, echo, refusal, and a fixed canonical reference.
H2: off-diagonal reference replay has a lower mean score than matched reference replay. This is a paired validity control, not a learned-model comparison.
H3: simulated drawing-part deletion lowers mean score as deletion probability increases. A simulated restoration control that returns the original drawing defines an upper bound, not a practical repair system.

Source: benchmark-pelican 0.2.0 at 1b38e1e82bae9cf9508ad030657de8fe88c5c512. Use all public tasks, without sampling or filtering. Read counts and coverage from task metadata. No hidden split and no humans. No learned models: free hosted inference is not configured or probed. No network model calls or paid inference.

Run seven policies through the public run adapter: empty, constant OK, echo prompt, refusal, canonical reference, own reference, literalPolicySvg(prompt). Run each twice, comparing semantic rows without timing fields. The reference policies have privileged access; literal policy reads prompt only but was built with the grader. Neither is independent validation.

Replay each reference on every task through public score. Bootstrap off-diagonal means by target task, retaining all source drawings within each target. Compare each target's own score with its mean mismatched score. Use 2000 percentile bootstrap draws, seed 20261029. Report binary score-at-least-0.8 success with Wilson 95% intervals, and continuous means with bootstrap intervals over tasks. Repeated runs do not enlarge sample size. No significance tests or multiple-comparison claims.

Extra virtual experiment, explicitly simulated: independently delete each self-closing drawable element (circle, ellipse, path, rect, line, polyline, polygon) from each literal-policy SVG with probability 0, 0.1, 0.25, 0.5, or 0.75. Use 20 simulated agents, seeds 1 through 20, paired random draws across probabilities. Each agent visits every task. Use a deterministic seeded PRNG. Compare corrupted output with a simulated restoration control returning the original literal SVG. Bootstrap agent-level means and paired restoration gains; report task success intervals separately for each agent. Never treat all task-agent rows as independent. Record mean score as the primary endpoint, threshold success as secondary.

Failure cases to verify before implementation: empty output earns credit; reference labels leak into literal policy; replay uses source instead of target task; deletions yield invalid markup; timing destroys repeat hashes; repeated tasks inflate uncertainty; generated text disagrees with raw scores. Keep malformed output, refusals, and low scores. Abort on execution errors; fix the execution fault and log it before rerun. No score-based exclusions, no retries to select good answers. Stop after the fixed grid and repeated controls complete. Report nulls.

Figures: coverage by animal and vehicle; policy means with intervals; reference transfer matrix; simulated deletion sweep and restoration control. Raw outputs, summary, repeat hashes, source hashes, and generated tables remain available. Paper and figures: CC-BY-4.0; existing source/data licenses remain unchanged.
