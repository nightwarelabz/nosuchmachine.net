---
title: "Chapter 17: Releases, Updates, and Failure"
part: "Part V: Operating Orange"
order: 17
description: "Release claims, updates, vulnerability response, stop-ship conditions, and support boundaries."
---

A release is a promise that outlives the moment it is made. Once bytes leave a
repository and enter someone else's build, the project no longer controls how
long they are used, what they are combined with, or what is later discovered
about them. For cryptographic software, the most important part of a release
process is therefore not the day of publication. It is what happens months
later, when a standard publishes an erratum, a dependency is compromised, or a
proof turns out to rest on a false lemma.

This chapter describes how Orange intends to release, update, and fail. Its
first fact is **current** and short: Orange has never released anything. No
source preview, toolchain preview, package, or binary is authorized, and a
merge, archive, CI artifact, or local build is not a release.

## What a release would be

The [release policy](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/RELEASE_POLICY.md#release-classes) defines three
classes that the owner could later authorize through a recorded decision:

- a **source preview**: an immutable source snapshot for experimentation;
- a **toolchain preview**: owner-built binaries with exact provenance and
  explicit pre-alpha limitations; and
- a **stable toolchain**: a release whose complete supported behavior,
  compatibility, security, and support gates are recorded and satisfied.

No class is authorized merely because compiler code exists. Cryptographic or
proof-bearing packages add their own, stronger gates on top of whichever class
carries them.

## Identity has several axes

Most software identifies a release with a single version number. That is not
enough for Orange, because an Orange artifact's meaning depends on several
independently evolving things. The release policy binds each axis that
actually exists:

- the language edition;
- the Core and evidence format edition, where applicable;
- the toolchain version;
- the cryptography profile, where applicable; and
- the target, ABI, and leakage profile, where applicable.

The current compiler already shows the first axis. Every Orange source file
begins with `edition 2026;`, and a file without that exact marker is rejected.
The edition is not decoration. It lets the language change in a later edition
without silently changing the meaning of a program written for this one.

Each release would also carry one immutable identifier, exact source and
artifact digests, support dates, changed claims, deltas in its trusted
computing base and assumptions, known limitations, and a clear
`solo-produced` status. An axis that does not yet exist is listed as
unsupported, not omitted. A reader should never have to infer that a release
makes no leakage claim from the absence of a field.

## The solo release gate

When a preview is eventually authorized, the
[solo release gate](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/RELEASE_POLICY.md#solo-release-gate) requires an explicit
owner decision and versioned scope; a frozen dependency graph and pinned
toolchain; a clean, network-disabled build where the toolchain permits it; two
separately provisioned owner rebuilds with byte comparison; every test,
conformance case, and security check that its exact claim matrix requires;
source and artifact digests, a dependency inventory, a software bill of
materials where applicable, and reproducible invocation records; a statement of
known limitations, unresolved findings, non-claims, support dates, and
vulnerability-reporting instructions; and a recorded procedure for publishing,
rolling back, withdrawing, and recovering the release.

"Frozen" in that list describes a dependency graph, not a project. It means the
exact inputs to one release are fixed so the release can be rebuilt. It does
not mean development stops.

As [Chapter 16](/book/chapter-16/) explained, the
two owner rebuilds are repeatability evidence, not independent rebuilds. The
owner necessarily controls source acceptance, building, and publication, and a
solo release records that missing separation of duties as a residual risk
rather than hiding it.

## Publication never rewrites

The publication rules share a principle with the evidence rules of
[Chapter 14](/book/chapter-14/): what was published
stays published. Tags are annotated and immutable; force updates, deletion, and
tag reuse are prohibited. Every correction gets a new version. An artifact
already published under an identity is never replaced by different bytes under
the same identity.

Package registries follow the same rule in the proposed architecture. Published
versions are immutable. Yanking a version changes which version new resolution
selects; it does not mutate or delete the bytes that already exist, so a build
that pinned the old version can still be reproduced and audited. The
difference matters most in a crisis, when the temptation to make a bad release
quietly disappear is strongest.

Two open decisions currently block crate, package-registry, and binary
distribution. The outbound license under
[D-018](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-018--licenses) is unselected, and the working name under
[D-017](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-017--project-and-package-name) has no trademark
clearance. Until both are recorded for an exact release boundary, crate
publication, package-registry publication, and binary distribution are
prohibited. Local development by the owner is unaffected.

## Updates are claims too

A new version is not automatically a better one. The proposed
[update journey](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/USER_JOURNEYS.md#j-07--update-deprecate-withdraw-or-replace-a-profile)
treats every update, deprecation, or withdrawal as a change to a claim graph.
Its steps are to detect the event through authenticated metadata; resolve its
exact affected tuple, authority, urgency, and downstream claim impact; publish
an immutable replacement and migration path; verify signatures, thresholds,
freeze and rollback rules, and complete evidence before activating anything;
re-run the affected proof, build, conformance, ABI, and replay journeys; and
finally mark old versions supported, deprecated, yanked, withdrawn, or revoked
while preserving their historical replay material.

The fail-closed outcomes are what give the journey teeth. Unsigned metadata, an
attempted rollback or freeze, a missing dependency, an invalid migration,
unavailable evidence, ambiguous impact, or an unapproved claim downgrade
rejects the update. A withdrawn unsafe profile is never silently replaced with
a weaker one that keeps the old claims. Updating an algorithm profile never
retroactively strengthens an old evidence bundle.

## When something is wrong

Every serious project eventually discovers that something it shipped is wrong.
Orange's [assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#10-vulnerability-response) lists the
classes of failure specific to a verified cryptography toolchain:

- proof-system unsoundness;
- compiler miscompilation;
- target leakage-profile failure;
- standards nonconformance;
- an unsafe API or a misleading claim;
- build or update compromise;
- a malicious or taken-over package; and
- documentation that predictably induces cryptographic misuse.

The list is broader than most projects' definition of a vulnerability, and
deliberately so. A misleading claim is a vulnerability in a system whose
product is claims. Documentation that leads careful users to misuse an API is a
vulnerability even if every function behaves as specified.

The proposed
[response journey](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/USER_JOURNEYS.md#j-08--respond-to-a-vulnerability-or-invalidated-claim)
contains the report privately; reproduces it and identifies every affected
identity; stops publication and marks dependent claims invalid or unresolved
whenever the impact cannot be bounded; corrects every coupled artifact
(semantics, implementation, proof, compiler, vectors, documentation, claims,
and attestations) together; re-runs the affected evidence; and publishes an
immutable advisory that names which earlier claims are no longer valid.

One sentence from that journey deserves to be memorized: *wording changes alone
cannot repair missing or false assurance.* If a claim was wrong, softening the
adjective in a README does not fix it. The claim is invalidated, the evidence
is repaired or withdrawn, and the record shows both.

## Stop-ship

Some findings block a release outright. The
[assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#8-stop-ship-conditions) lists them: an
unresolved proof-soundness flaw; incorrect cryptographic output;
secret-dependent behavior within a promised target and leakage profile; an
undocumented axiom, trusted-base expansion, foreign boundary, or claim
downgrade; a semantic ambiguity that changes a valid program's meaning; failed
reproducibility, signature, provenance, update, or rollback protection; an
unresolved critical or high finding; an unreviewed standards erratum relevant
to a stable package; and an audit finding whose impact is not understood.

Security, soundness, and public-assurance gates cannot be waived. An exception
to an operational gate that carries no assurance meaning requires a named owner,
a rationale, a compensating control, an expiry, and disclosure in the release
notes. These conditions govern releases, not development: a known soundness
flaw stops a release, and the work to fix it proceeds.

## Support that can actually be given

[D-022](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-022--support-policy) directs best-effort support by the
owner during pre-alpha, with no service-level agreement, long-term support
window, compatibility promise, or migration service. An earlier institutional
target of five plus two years of support is explicitly not an active
commitment. A release-specific support window may be adopted only when the
owner can actually sustain it, and every release must state its real support
dates and its single-maintainer risk.

Security response works the same way. The project targets acknowledgement of a
private report within one business day and an initial technical assessment
within three, as targets rather than a contract. There is no staffed security
team. Reports go through GitHub's private vulnerability reporting, described
in [the security policy](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/SECURITY.md), and never into a public issue.

Support also attaches to the whole affected tuple rather than a single version
number: language edition, Core and evidence editions, toolchain release,
cryptography profile, target and leakage profile, package or artifact digest,
and operating environment. A security advisory that says only "versions before
1.4 are affected" is not precise enough for a system whose claims depend on
which processor model was assumed.

## The end of the beginning

The [project charter](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/PROJECT_CHARTER.md#9-what-end-means) says what "end"
means: not the end of maintenance, but the first stable, supportable 1.0
system. It lists ten conditions, from published and versioned semantics to an
exercised vulnerability-response process. After 1.0, new targets, leakage
models, proof automation, and algorithm packages are normal evolution. They do
not retroactively strengthen old claim bundles.

Orange is far from that gate, and this book has tried not to blur the
distance. What exists is a small compiler that checks and evaluates typed
literals, a large body of design, and a discipline for keeping the two apart.
The rest of the work is to close the gap one honest boundary at a time, so that
when Orange finally makes a promise about a piece of cryptography, every word
of it can be checked.

