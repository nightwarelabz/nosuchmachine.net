---
title: "Chapter 15: Offline Replay and Trust Budgets"
part: "Part V: Operating Orange"
order: 15
description: "Offline replay, dependency closure, and making a claim's trust budget visible."
---

An assurance claim is only as useful as a skeptic's ability to check it. If
checking requires the vendor's servers, the vendor's build farm, or the
vendor's word, then the claim is a statement of trust in the vendor, however
many proofs stand behind it. Orange's charter lists the opposite as a product
principle: *independent replay is a feature*. A reviewer should be able to
unpack a proof bundle, inspect its manifest, and run the checker against
pinned inputs without a registry, a cloud service, or a source checkout.

This chapter describes that replay and the related idea of a trust budget.
Both are **product directions**, not current behavior. Orange has no bundle to
replay and no checker to replay it with.

## The auditor's journey

The clearest description of offline replay is the
[auditor's journey](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/USER_JOURNEYS.md#j-06--audit-and-replay-evidence-offline),
one of eight proposed end-to-end journeys that define Orange 1.0. An auditor
receives a thick evidence bundle and an independently obtained artifact
identity, and works in a clean environment with the network denied. The bundle's
bytes are treated as hostile until checked.

The proposed flow has six steps:

1. Verify the bundle's format and version, canonical paths, manifest identity,
   signatures, and content digests, and confirm that no undeclared or escaping
   files are present.
2. Enumerate the complete closure (sources, packages, models, proofs,
   certificates, tools, build inputs, artifacts, external evidence, axioms,
   assumptions, and trusted components) before executing anything.
3. Replay proofs and certificates with the authoritative and the
   implementation-diverse checkers, under deterministic resource bounds.
4. Rebuild or validate the advertised artifacts from declared inputs and
   compare their digests and claimed identities.
5. Re-run required tests, and inspect audit, laboratory, and external records
   for identity, scope, validity, and expiry, without presenting them as
   machine proofs.
6. Produce a machine-readable replay report and a human-readable claim and
   trust matrix listing every success, failure, non-claim, unresolved item, and
   invalidated dependent.

The fail-closed rule is the heart of it. Missing or extra bytes, an escaping
path, a digest or signature mismatch, checker disagreement, a failed proof or
build, expired external evidence, undeclared trust, resource exhaustion, or an
attempted network access prevents the affected claim from replaying
successfully. The auditor may inspect partial diagnostics, but receives no
generic green verdict.

## Replay is not reproduction by someone else

Orange is careful with the words it uses for repetition. The
[reproducibility contract](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/REPRODUCIBILITY.md#1-reproducibility-levels)
distinguishes four levels:

1. a **replayable method**, where inputs, tools, arguments, environment, and
   expected observations are recorded;
2. a **deterministic decision case**, where the same recorded environment and
   inputs reproduce the declared outputs;
3. an **independent decision reproduction**, where an identified reviewer
   repeats the case in an independently provisioned environment; and
4. **future release reproducibility**, where multiple independent builders
   reproduce published release artifacts.

A solo project can reach the second level on its own. The owner can run a case
twice, in two separately provisioned workspaces, and compare the results. That
is valuable evidence of determinism. It is not the third level, because the
same person provisioned both environments and chose what to compare. Orange
records such runs as same-owner replays and never relabels them as
independent. When a reviewer outside the project repeats a result, that will be
recorded as what it is, with the reviewer identified.

The distinction mirrors the rest of the book. A second run by the same person
is a better test, not a second witness.

## The trust budget

Every claim rests on something it does not prove: a checker implementation, a
set of axioms, a processor model, an ABI model, an operating system behavior, a
foreign contract. Chapter 1 argued that trust does not disappear. The trust
budget is how Orange proposes to make it visible and to keep it from growing
quietly.

The [assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#33-trust-budget) proposes that every release
report:

- the executable and source size of the authoritative checker;
- the accepted axioms, and why each is necessary;
- the modeled ISA, ABI, object, and leakage components;
- the external contracts and proof systems relied upon;
- the changes to the trusted computing base since the previous release; and
- which claims would be invalidated if a given component were compromised.

The last item turns a list into a tool. A trust budget that says "the ARM
target model is trusted" is informative. One that says "if the ARM target
model is wrong about conditional-select timing, these fourteen leakage claims
fall" is actionable. It tells a reader where to focus scrutiny and tells the
project what a single discovered flaw would cost.

The goal is not an arbitrary line-count threshold. It is a small, reviewable,
slowly changing closure with no undocumented expansion. A release whose trusted
base grew must say so, and say why.

## Trust per claim, not per project

The trust budget is computed per claim, not once for the whole project. The
architecture proposes a command, `orange trust`, that prints the closure of an
artifact or claim rather than a summary. A parser-behavior claim, a functional
refinement, and a native constant-time claim have genuinely different trusted
bases. The first depends on the parser and its specification; the last depends
on a leakage model, a target model, a compiler preservation argument, and a
processor. Folding them into one project-wide list would make the simple claims
look weaker and the hard claims look stronger than they are.

## Explaining invalidation

Replay is not only for auditors. A developer changing one definition wants to
know which proofs need to be redone and why. The proposed proof cache keys
results by the normalized obligation, imported theorem fingerprints, source and
Core-semantics editions, checker and decision-procedure versions, and the
target and leakage policy where relevant. When any of those changes, the cached
result no longer applies, and the command-line tools are meant to explain which
component invalidated it. That explanation is the same closure the trust budget
reports, seen from the other direction.

## What replay cannot tell you

Replay establishes that checking is reproducible: that the same inputs, run
through the same checkers under the same bounds, give the same verdicts. That
is a strong property, and it is not the only one a reader needs. Replay cannot
tell whether the Orange specification says what the standard's authors meant;
that is the intent boundary of
[Chapter 11](/book/chapter-11/). It cannot tell whether
a processor model matches the silicon it describes. It cannot tell whether a
claim's assumptions are reasonable in the reader's deployment.

What replay does is move those questions to where they can be seen. A replay
report lists every assumption, every model, and every trusted component that
the verdicts depended on. A cryptanalyst who doubts one of them does not have
to argue with the project's reputation. They can point at the exact item and
say which claims would fall with it.

## What exists now

None of this is implemented. Orange has no evidence bundle, no checker, no
`orange trust` command, and no release trust report. What exists is a
deterministic repository check, which runs in a sanitized environment with a
fixed locale, timezone, and timestamp, and a compiler whose output is
byte-for-byte repeatable. The repository's decision laboratories go one step
further in the same direction: they define replay plans and fresh-cache rules
for comparing candidates, even though no candidate has yet been executed.

The design choice underneath is that replay should be ordinary. It should not
require special access, special trust, or a special occasion. If every claim
Orange makes can be rechecked by anyone holding the bundle, then the project's
reputation is not what users rely on. The evidence is.

