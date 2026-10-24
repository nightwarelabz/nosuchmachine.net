---
title: "Chapter 13: Interoperability and External Validation"
part: "Part IV: Cryptography in Practice"
order: 13
description: "The boundaries between primitive correctness, protocol interoperability, and independent validation."
---

A self-contained toolchain is still surrounded by other systems. Its
specifications come from standards bodies. Its outputs are linked into C and
Rust programs. Its vectors are exchanged with validation services. Its
releases are described by software bills of materials and supply-chain
attestations. Its proofs may need to meet proofs written in other assistants.
And some of the most important statements about deployed cryptography are made
not by any tool but by accredited laboratories and certification programs.

This chapter is about those edges. Its governing boundary is simple and
**current**: Orange claims no certification and no external validation of any
kind. What it describes is how Orange intends to meet other systems without
confusing their evidence with its own.

## The edges

The [research analysis](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RESEARCH.md#45-end-to-end-proof-still-needs-interoperability)
lists the places where even a complete Orange toolchain must meet existing
systems:

- standards text, errata, and official vectors;
- C ABI consumers and Rust packages;
- object formats, linkers, operating systems, and CPU feature discovery;
- NIST ACVP vector exchanges;
- SBOM, CBOM, and supply-chain attestations; and
- established proof libraries and independently checked exports.

The design principle for all of them is the same. Interoperability artifacts
are generated from the same definitions that produce the code, and they are
part of the claim graph. A hand-maintained header, a hand-written vector
converter, or a hand-copied assumption list recreates exactly the gap Orange
exists to close. Generated artifacts can still be wrong, but they are wrong in
one place, and that place is checked.

## Proofs from elsewhere

Some of the best cryptographic proofs in existence were written in other
systems. EasyCrypt and SSProve handle computational, game-based security
arguments that Orange's own game stratum will reach only gradually. Rather than
pretend those proofs do not exist, the architecture proposes first-class
adapters that import and export them.

The rule for such evidence is strict and simple: an external theorem remains
labeled external until its evidence is reconstructed into Orange's own proof
format and checked there. Its record names the external system, version,
theorem, and the assumptions that come with trusting it. A claim that rests on
it can be satisfied under a policy that permits external proofs, and a reader
sees exactly which checker was trusted. What the claim may not do is present
the external proof as if Orange's kernel had checked it.

## Validation is a different kind of evidence

Cryptographic validation programs occupy a distinct place. NIST's Cryptographic
Algorithm Validation Program tests algorithm implementations through the
Automated Cryptographic Validation Protocol, a black-box exchange of test
vectors and responses. The Cryptographic Module Validation Program, under FIPS
140-3, assesses complete cryptographic modules: a concrete boundary, build,
set of approved modes, entropy strategy, self-tests, and operational
environment, examined by an accredited laboratory.

Those are not proofs, and proofs are not those. The
[assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#11-external-validation-posture) draws the lines
carefully:

- a local ACVP-compatible test run is not an algorithm certificate;
- an algorithm certificate does not validate a complete module;
- the Orange language cannot be FIPS 140 validated in the abstract; and
- a concrete generated module, with its exact build, boundary, approved modes,
  entropy strategy, self-tests, version, platform, and environment, can be
  assessed externally.

The last point is the constructive one. Orange cannot be validated, but modules
built with Orange could be, and the toolchain should avoid choices that make
that assessment unnecessarily difficult. Clear module boundaries, reproducible
builds, precise entropy contracts, and machine-readable descriptions of approved
modes are all things a laboratory would ask for.

## Orange's posture

[D-016](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-016--validation-and-certification-posture) records the
**proposed** posture:

- support ACVP-compatible input and output, and record validation status;
- never call local vectors or proof replay an ACVP or CAVP certificate;
- never call Orange itself FIPS 140 validated; and
- keep certificate-bearing profiles unsupported in the current solo operating
  model.

Accredited laboratory work is unavailable to a solo project. The claim model
has a precise way to say so: a claim whose policy requires a certificate is
`unsupported`, not `unresolved`, and certainly not `satisfied` on the strength
of passing vectors. Only a future explicit change to the operating model, with
a laboratory actually available, could open a certificate-bearing profile.

When external evidence does exist, the claim record keeps its authority where
it belongs. It records the issuer, scope, subject, dates, and digest of a
certificate or audit. It validates that metadata. It never turns the
laboratory's judgment into an Orange theorem, and it never extends the
certificate beyond the exact module and version it covers.

## Differential testing as everyday interoperability

Between formal proof and formal validation lies a great deal of practical
evidence, and Orange intends to use it. Differential tests compare Orange's
outputs against mature implementations of the same standard on the same
inputs. Adversarial suites such as Wycheproof feed carefully constructed
malformed and edge-case inputs whose correct result is known. Interoperability
tests check that a key encoded by Orange is accepted by other software and vice
versa.

In the claim model these are `test_run` evidence and empirical-test claims.
They are powerful at finding bugs, and they are honest about their scope: a
named corpus, a named method, a named environment, a named implementation and
target. They can satisfy an empirical claim. They cannot satisfy a claim that
requires proof, and they do not become validation because they came from a
well-known suite.

## When the answers differ

Differential testing is most informative when it fails. Suppose Orange's
output for some input disagrees with a mature implementation. The claim model
records a `not_satisfied` result for the differential claim, with the input,
both outputs, and both implementations identified. It does not decide in
advance which side is wrong.

Sometimes Orange will be wrong: a transcription error, a missed erratum, an
edge case in an encoding. Sometimes the other implementation will be wrong, or
will implement an older edition of the standard, or will be deliberately
lenient where the standard is strict. The investigation decides, and its
conclusion is recorded with its reasons. What the record never does is quietly
adjust Orange to match the majority. Agreement with other implementations is
evidence, not authority. The standard, read at its exact edition and errata,
is the authority.

## The supply-chain edge

Releases meet another set of external systems: software bills of materials in
SPDX and CycloneDX form, a cryptographic bill of materials that lists
algorithms and their parameters, SLSA and in-toto build provenance, and
signature and transparency evidence. The
[assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#91-framework-targets) proposes targets against
current frameworks such as NIST SSDF, SLSA, and the OpenSSF OSPS Baseline,
pinned to exact versions at release time.

Those frameworks are external too, and the same discipline applies. Meeting a
framework's requirements for a particular release is a claim about that
release. It is recorded with evidence and scope. It is not a property of the
project in general, and a repository control snapshot is not a certification.

## Where things stand

Orange currently exchanges nothing with any external system. It has no ACVP
adapter, no proof import or export, no SBOM generation, and no release. It
claims no certification, no validation, and no conformance to any external
framework. The repository does record its own CI and repository controls, and
it describes them as what they are: point-in-time observations about a solo
project, with the controls that require other people marked unavailable.

The interoperability story is therefore mostly a set of promises about how
evidence will be labeled. That may seem like a small thing to have settled
first. It is not. Most confusion about cryptographic assurance comes from
evidence that crossed an edge and lost its label on the way.

