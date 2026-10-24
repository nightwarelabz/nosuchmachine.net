---
title: "Appendix B: Decision Ledger"
part: "Appendices"
order: 19
description: "A summary of the project's decision register and the status of its controlling decisions."
---

The [decision register](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md) is the authority. This ledger is a
snapshot of its statuses for readers who want the whole map at once. `directed`
means explicit owner direction with details still open; `accepted` means
ratified at an exact revision; `proposed` means a recommended answer awaiting
its gate; `investigate` means the alternatives need a reproducible comparison.

| Decision | Subject | Status |
| --- | --- | --- |
| D-001 | Mission | Directed |
| D-002 | No disposable prototype | Directed |
| D-003 | Product form | Accepted: standalone Orange (PF-01) |
| D-004 | Semantic strata | Proposed; two laboratory runs recorded, contributor-produced and unreviewed; nothing selected |
| D-005 | Public assurance model | Proposed |
| D-006 | Proof foundation | Investigate |
| D-007 | Orange-owned proof format and checker | Proposed; depends on D-006 |
| D-008 | Implementation languages | Directed for the Rust bootstrap |
| D-009 | Solver trust | Proposed |
| D-010 | Compiler strategy | Investigate |
| D-011 | Initial native target envelope | Proposed |
| D-012 | Baseline leakage claim | Investigate |
| D-013 | Stable foreign boundary | Proposed |
| D-014 | Package and registry model | Proposed |
| D-015 | Flagship 1.0 corpus | Proposed set |
| D-016 | Validation and certification posture | Proposed |
| D-017 | Project and package name | Directed working codename; public name open |
| D-018 | Licenses | Directed development boundary; outbound license open |
| D-019 | Governance and release authority | Directed solo governance |
| D-020 | Supply-chain target | Proposed |
| D-021 | Self-hosting | Proposed |
| D-022 | Support policy | Directed best-effort solo support |
| D-023 | Solo project operating model | Directed |
| D-024 | Initial compiler foundation | Directed |
| D-025 | Orange 2026 minimal grammar and bounded parser | Directed |
| D-026 | Orange 2026 typed literal specifications | Directed |

Four Orange Enhancement Proposals are accepted: OEP-0001 (solo development and
incremental gates), OEP-0002 (the edition 2026 parser), OEP-0003 (typed
literals), and OEP-0004 (the standalone product form).

