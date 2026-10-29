# Pelican paper packet

This paper measures structural SVG compliance. It includes scripted policies, reference replay, and a clearly labelled simulated deletion experiment.

From the repository root, install dependencies and repeat the full study:

```sh
npm ci
sh paper/template/reproduce.sh
```

Requirements: Node 20+, npm, Python 3, Tectonic, and Poppler (`pdftotext`, `pdfinfo`). The repeat command builds the benchmark, runs experiments, renders data figures, builds the PDF, and checks saved results.
The output is `paper/pelican-paper.pdf`. PDFs and downloaded styles stay untracked. The build checks the official style archive hash.
Experiments use local scripts and the public benchmark API. No model service, credential, or paid inference is used.

The study plan commit precedes results. It is a local prospective record, not an independent registration.
The source revision and input hashes are in `config.json` and `data/provenance.generated.json`.
The shared `template/` is copied unchanged from the accepted honesty pilot. All experiment code and paper text are specific to Pelican.
The family paper identifies this benchmark as structural drawing evaluation. This study measures new results rather than importing family scores.

`data/runs.generated.json` contains the public runner reports. `repeat.generated.json` records repeated reports and semantic hashes.
`cross.generated.json` contains every reference-target score. `simulated.generated.json` retains corrupted outputs and scores for each simulated agent.
`summary.generated.json` supplies all plotted results and intervals. `verification.generated.json` records replay checks and the built PDF hash.
Generated data, tables, and figure sources use `.generated` names. Do not edit these files by hand.

Control intervals resample tasks. Reference-transfer intervals resample target tasks with source references held fixed.
Simulated intervals resample agents with all their tasks retained. Per-agent success rates have Wilson intervals.
The reference and literal controls share benchmark design knowledge. No human study, independent solver, or learned-model result is present.
Free hosted inference is not configured or probed. Its availability is unknown.

Paper text and generated figures use CC-BY-4.0. Existing software and task licenses remain unchanged.
Do not publish or merge this packet automatically. Independent replication and reports of valid rejected drawings are welcome.

Local CI passes with Node 20 and npm 10. npm 12 changes the dry-run pack JSON shape and breaks the existing E2E pack assertion. This paper does not change that assertion.
