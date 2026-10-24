---
title: "Chapter 5: Proof Search Is Not Proof Checking"
part: "Part II: Meaning and Trust"
order: 5
description: "The distinction between finding a proof and checking one, and the proposed trust boundary around automation."
---

Modern verification tools are astonishingly good at finding proofs. SAT
solvers settle bit-level equivalences over millions of clauses. SMT solvers
discharge the routine arithmetic side conditions that once filled pages of
hand-written lemmas. Tactic languages turn a two-line user hint into a large
derivation. For a language that wants cryptographers to state and prove real
properties without becoming full-time proof engineers, that automation is
indispensable.

It is also the wrong thing to trust. A search procedure is large, heuristic,
fast-moving, and optimized for finding answers rather than for being right
about them. The question Orange asks is not whether automation should be used.
It is where authority lives once automation has done its work.

## Two jobs, two sizes

Finding a proof and checking a proof are different jobs with different natural
sizes. Search explores a vast space with clever strategies, caches, and
heuristics; its code grows as it gets better. Checking confirms that a
completed derivation follows the rules of a fixed logic; its code can stay
small, because it never has to be clever.

The project's charter turns that asymmetry into a principle: *soundness before
automation*. Solvers are search engines. Their answer is accepted only through a
checked certificate or through an explicitly disclosed external-trust claim.
The [research analysis](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RESEARCH.md#43-the-solver-should-search-not-legislate)
states the same idea more bluntly: the solver should search, not legislate.

F\* is a useful point of comparison because it is both successful and candid.
Its SMT automation removes a great deal of routine proof burden, and its
documentation is clear that the combination of F\* and Z3 is trusted for those
results. That is a legitimate design with a known trusted base. Lean and Rocq
take the other path: tactics may do anything they like, but the final proof
term is checked by a small kernel. Orange's **proposal** is to follow the second
path for claims that require proof, while treating any exception as a visible,
named part of the trusted base rather than a silent convenience.

## The proposed checker

The [architecture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#22-orange-check) describes an authoritative
offline checker, `orange-check`, with a deliberately austere feature list. It
has no network access, no package resolution, no tactics, no plugins, and no
code generation. Its behavior is deterministic and resource bounded. It
supports one explicit set of format versions, and it can print every axiom and
trusted model in a claim's closure.

The checker would read **Orange Proof IR**, a stable evidence language of fully
elaborated terms with explicit universe and type arguments, references by
theorem fingerprint, and no tactic syntax. The proposed requirements read like
a security specification because they are one: canonical deterministic
encoding, streaming and bounded validation, stable rejection of malformed
input, no unknown fields in a security-critical version, no cyclic or
exponential expansion, and theorem fingerprints that include definitions,
axioms, semantics edition, and relevant target model.

That last requirement matters more than it first appears. A theorem about
`sha256` is only useful if it is about the `sha256` being shipped. A
fingerprint that changes whenever the definition, axioms, semantic edition, or
target model changes is what keeps a proof from quietly migrating to a
different subject.

[D-007](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-007--orange-owned-proof-format-and-checker) proposes that
Orange own this proof format and checker rather than making a host prover's
compiled environment the permanent public artifact. The register is plain about
the risk: a custom kernel is a major soundness and schedule risk, and its logic
must be smaller than the surface language. The recommended mitigation is to
specify the checker in a proof assistant, prove it sound there, distribute an
extracted authoritative checker, and maintain an implementation-diverse checker
in safe Rust for differential testing. Because both would come from the same
owner, the second checker is described as implementation-diverse, never as
independent.

## Choosing a foundation

The logic that the checker implements has to be defined and proved sound in
something. [D-006](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-006--proof-foundation) compares two
candidates, Rocq and Lean 4, and selects neither. Rocq brings the closest
existing ecosystem of verified compilers, cryptographic synthesis, and
extraction. Lean 4 brings an integrated implementation, kernel, and tooling
model. The register treats both strengths as hypotheses to measure, not reasons
to preselect a winner.

The [proof-foundation suite](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/PROOF_FOUNDATION_DECISION_SUITE.md) asks each
candidate to do the same concrete work: define and check a proposed Core
fragment, mechanize progress and preservation plus a leakage lemma, validate a
canonical serialization, produce and replay an LRAT-backed bit-vector proof,
distribute the checker on supported hosts, and survive the same seeded
maintenance tasks. The draft defines 14 candidate-case runs. None has been
executed. D-006 is marked **investigate**, and no proof toolchain is admitted.

## What counts as a checked answer

Automation produces many kinds of output, and only some of them should be able
to close a claim. The [proposed automation portfolio](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#7-proof-automation)
sorts them:

- **Bit-vector and finite equivalence** goes through verified bit-blasting to
  SAT, with an LRAT-family certificate required for a claim-closing success.
  Counterexamples are decoded back into source values so that a failure is
  something a cryptographer can read.
- **Ring and field identities, modular reasoning, and ranges** use
  kernel-checked reflective procedures, which compute inside the logic and
  therefore need no external trust.
- **Supported SMT fragments** use proof-producing solvers with a ratified
  certificate format such as Alethe, checked before acceptance.
- **Quantified and inductive properties** use explicit induction and user
  lemmas.
- **External proofs** from EasyCrypt or SSProve remain labeled external until
  their evidence is reconstructed in Orange's own format.

Everything else is search. A timeout, an `unknown`, resource exhaustion,
missing proof output, or a certificate that fails to check leaves the claim
**unresolved**, with the precise reason recorded. Developer profiles may
display a solver's unchecked opinion, but that opinion cannot satisfy a claim
or be cached under a status that suggests it did.

## Three policies for solver trust

How strict should that rule be? [D-009](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-009--solver-trust) frames
the choice as three candidates, compared symmetrically in the
[solver-trust suite](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SOLVER_TRUST_DECISION_SUITE.md):

| ID | Policy | Where authority lives |
| --- | --- | --- |
| SP-01 | Checked-artifact portfolio | An accepted certificate or Orange proof term |
| SP-02 | Kernel-only reconstruction | Only a kernel-accepted Orange proof term |
| SP-03 | Direct trusted-solver authority | An exact admitted solver, version, and fragment, listed in the logical trusted base |

SP-03 is not a strawman. Some organizations deliberately trust a particular
solver version for a narrow fragment because the alternative is unaffordable.
What the suite forbids is the confusion of categories: a direct solver result
may never be presented as a checked certificate or kernel proof. The frozen
matrix has 24 candidate-case runs across eight cases; none has been executed,
and no policy is selected.

## Caching without laundering

Proof replay is expensive, so real systems cache. A cache is also a place where
an old answer can quietly survive a change that should have invalidated it. The
proposed cache key for a proof result therefore includes the normalized
obligation, imported theorem fingerprints, source and core-semantics editions,
checker and decision-procedure versions, and the target and leakage policy
where relevant. A separate search cache may key on the solver binary, its
arguments, seed, and limits, but the certificate it hopes to find cannot be
part of the key for the result being searched for. The command-line tools are
meant to explain which component invalidated a cached proof, because an
unexplained cache miss teaches nothing and an unexplained hit should worry
everyone.

## Where things stand

Today Orange has no proof syntax, no Proof IR, no checker, and no admitted
solver. The word `proof` is reserved and does nothing. The current compiler's
semantic analyzer and evaluator are engineering trust dependencies. No logical
checker exists, so they are not outside any trusted base by virtue of being
checked, and their test results are implementation evidence, not proofs.

That emptiness is a feature of the order of work, not an oversight. Proof
components are gated on decisions that are still open, and the proof-neutral
frontend has been built first because it does not depend on them. When proofs
do arrive, one principle is already directed: search wherever it helps, and
accept a solver's answer only through a checked certificate or an explicitly
disclosed external-trust claim. Which checker and which solver policy carry
that authority remain open under D-006, D-007, and D-009.

