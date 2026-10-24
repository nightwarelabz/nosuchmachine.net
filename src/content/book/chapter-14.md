---
title: "Chapter 14: Evidence That Survives the Build"
part: "Part V: Operating Orange"
order: 14
description: "The records and identities needed to keep a build's evidence useful after the build ends."
---

Most build systems produce artifacts and forget how. A compiler runs, a binary
appears, and the only record of what happened is a log that scrolls away or a
CI page that expires. When a question arises later (which source produced this
library, which compiler, which flags, which proof covered it), the answer has
to be reconstructed, if it can be reconstructed at all.

Orange proposes that a build produce two things: the artifact and the evidence
that says what the artifact is. This chapter describes the evidence: how it is
identified, what it contains, and how it stays attached to the bytes it
describes. The package, evidence, and release formats are all **proposed**.
The discipline of exact identity, however, already governs how the repository
records its own work.

## Names drift; digests do not

Chapter 2 made the point for claims: a function called `encrypt` can change
while keeping its name. The same is true of every other thing a build touches.
A package version number can be republished. A compiler binary called `orangec`
can be rebuilt with different flags. A vector file can be edited in place. A
standard's PDF can be silently corrected.

The remedy is content addressing. Every input and output is identified by a
cryptographic digest of its exact bytes. A claim binds to digests rather than
to names, so that when the bytes change, the identity changes, and any evidence
bound to the old identity no longer applies. Names stay for humans. Digests are
for the evidence.

Orange's architecture applies this throughout. Proofs bind to exact package
digests and theorem fingerprints, not to semantic-version ranges. The lock
file records each dependency's immutable identity and digest, its language and
Core-format editions, its exported theorem fingerprints and assumption
summaries, and its license and provenance metadata. A theorem fingerprint
includes the definitions, axioms, semantic edition, and target model the
theorem depends on, so a proof about one definition cannot silently attach to
another.

## One artifact, many identities

Consider a future claim that an object file implements the ChaCha20 quarter
round of RFC 8439 and satisfies a named leakage profile on one target. Each
noun in that sentence is an identity the evidence must pin. The object is a
digest. RFC 8439 is an exact document with an errata snapshot. The Orange
specification that transcribes it is a source digest and a theorem
fingerprint. The compiler is a binary digest built from a source digest with a
recorded toolchain. The leakage profile is a versioned policy name. The target
is a processor and ABI model at an exact version. The vectors used in testing
are a file digest with a recorded interpretation.

Change any one of those and the claim is about something else. A patched
compiler, an erratum applied, or a rebuilt object each produces a different
identity, and the old evidence no longer applies to the new thing until it is
re-established. That can feel strict. It is the only way a reader can know
that the evidence in front of them describes the bytes in front of them.

## Thin manifests and thick bundles

The [architecture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#102-evidence-bundle) distinguishes two forms
of evidence:

- a **thin evidence manifest** content-addresses objects that may live
  elsewhere. It is convenient for development and online distribution, and it
  does not claim offline replay by itself.
- a **thick evidence bundle** contains every source, package, model, proof,
  certificate, tool, and build-critical byte needed for the replay it
  advertises. Claim-bearing releases require a thick bundle.

The proposed thick bundle, provisionally called `.orange-evidence`, contains a
canonical manifest that maps every content digest to its role, media type,
size, and replay requirement, together with a content-addressed store of the
actual bytes. Around that core it carries the claims and their
theorem-to-assumption graph; pass and translation certificates; compiler,
checker, solver, and target-model identities; standards, errata, and vector
provenance; object, header, wrapper, and ABI-contract digests; test summaries
and their machine-readable results; archival audit or validation material where
redistribution is permitted; SPDX and CycloneDX bills of materials, including a
cryptographic bill of materials; SLSA and in-toto build provenance; and
signature and transparency material.

The design goal is durability. The logical proof and build-critical chain must
remain replayable even if the registry, the transparency service, or an audit
URL disappears. A third-party certificate may still need its issuer as the
authority, and the bundle does not pretend otherwise; it preserves and
validates the metadata without pretending to machine-check an institution's
judgment.

## Determinism is part of the evidence

Evidence that cannot be reproduced is weak evidence. The proposed build rules
therefore fix the things that usually make builds vary: canonical ordering and
serialization, normalized paths, a pinned locale and timezone, declared seeds,
immutable tool digests, and `SOURCE_DATE_EPOCH` for timestamps. Search data
that affects output, such as profile-guided optimization data, becomes a
checked-in, hashed input rather than an ambient influence.

The repository already practices this at small scale. Its full check,
`scripts/ci/check-repository`, runs with an emptied environment, the `C`
locale, `TZ=UTC`, and `SOURCE_DATE_EPOCH=0`. The compiler's gate builds the
release binary twice in relocated directories and compares the results byte for
byte. Those are repeatability checks performed by one owner, and the project
labels them that way. They are not independent rebuilds, and they are not
release evidence. But they show that determinism is being engineered in from
the start, not retrofitted.

## The historical Gate 0 records

The repository contains a set of provisional evidence schemas from an earlier
planning phase: a claim record, an evidence manifest, a trust inventory, a
standards-provenance record, and a repository-control snapshot, with positive
and adversarial conformance fixtures. They demonstrate structural ideas that
this chapter describes: exact subjects, typed evidence bases, content digests
and sizes, replay profiles, trust closures, and supersession of corrected
records without mutating the originals.

They are explicitly historical and non-product. A fixture that passes one of
those schemas proves only that it has the right shape. The eventual package and
evidence formats will receive new identifiers and documented migrations; they
will not silently reinterpret those records.

## Evidence that can be corrected

Evidence is sometimes wrong. A transcription has an error, a certificate was
issued for the wrong digest, a test corpus was misinterpreted. The proposed
rule is that corrections never mutate history. A corrected record is a new
record that names the one it supersedes, and the old one remains addressable.
Claims that depended on the incorrect record are invalidated and re-derived,
and a report can show both the old conclusion and why it no longer holds.

That rule sounds bureaucratic until one considers the alternative. A system
that quietly edits its evidence cannot be audited, because an auditor can never
know whether the record they are reading is the one that was relied upon. An
append-only history with explicit supersession is what makes a later audit
meaningful.

## What the repository records today

Orange has no package format, no lock file, no evidence bundle, and no release.
What it does have is a habit. Accepted language slices are recorded with the
exact commit revision at which they were merged and the continuous-integration
runs that passed at that revision. Decisions name the revisions they bind.
Normative documents say which slice they belong to. The policy validator checks
repository invariants deterministically, and its findings name exact files and
rules.

That habit is the seed of the evidence system. When Orange begins to produce
artifacts, the question "what exactly is this, and what is known about it?" will
have been asked of every accepted change from the start, and the answer will
already have a shape.

