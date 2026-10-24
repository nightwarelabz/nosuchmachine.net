---
title: "Chapter 11: Standards as Versioned Inputs"
part: "Part IV: Cryptography in Practice"
order: 11
description: "How standards, clauses, test vectors, provenance, and rights become versioned inputs."
---

Cryptographers cite standards the way mathematicians cite theorems: by name,
as if the name fixed the content forever. "Implements ML-KEM." "Conforms to
FIPS 180-4." "RFC 8439 ChaCha20-Poly1305." In conversation that is fine. In an
assurance claim it is not, because standards change after publication, and the
change is often exactly the part that matters.

This chapter explains why Orange treats a standard as a versioned input with
provenance rather than a timeless citation. The discipline is **directed** for
any future cryptography package and **proposed** in its exact record format.
No standard has yet been imported into Orange.

## Standards move

The [research analysis](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RESEARCH.md#46-standards-are-versioned-inputs-not-timeless-citations)
gives current examples. FIPS 203 and FIPS 204, the post-quantum key
encapsulation and signature standards, published planning notes and errata
after their final publication. The set of algorithms and schemas supported by
NIST's Automated Cryptographic Validation Protocol evolves. Protocol profiles
that build on a primitive may remain Internet-Drafts, as
[section 4.10](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RESEARCH.md#410-primitive-correctness-is-not-protocol-interoperability)
notes, and must not be represented as finalized standards.

None of that reflects badly on the standards process. It is what careful
standardization looks like. But it means that "implements ML-KEM" is an
incomplete sentence. Which publication? Which errata were applied? Which
clauses does this definition transcribe? Which vector set was it tested
against? Did the implementer deliberately deviate anywhere, and why? Without
those answers the claim cannot be audited, only believed.

## What provenance records

For every standard that becomes a decision input, Orange's provisional
[reproducibility contract](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/REPRODUCIBILITY.md#6-external-source-and-standards-capture)
requires capturing the following, and the roadmap requires the same exactness
before any cryptographic claim:

- the issuing organization, exact document identifier, edition, and date;
- the primary publisher or an authorized mirror;
- the retrieval time and an exact byte digest;
- an archive path, or digest-verifying instructions for reacquiring the bytes;
- redistribution terms and their review status;
- applicable errata and the rationale for applying them;
- the clause or vector locators that the work depends on;
- the path, digest, and review state of any transcription; and
- any unresolved patent, export, certification, or access question, recorded
  without turning a technical inventory into legal advice.

A provisional
[standards-provenance schema](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/schemas/gate0/standards-provenance-v0.1.schema.json)
gives those fields a concrete shape: a standard with its issuer, identifier,
edition, and publication date; a source with retrieval time, digest, and
archive state; rights, patent, export, and technical review records; errata
with applicability; normative clauses with transcriptions; and vector sources
with scope and expected interpretation. The schema is explicitly historical
and non-product. It shows the shape of the idea, not the final format.

## Clauses, not documents

The most useful granularity is not the document but the clause. A definition
of SHA-256's message schedule transcribes a specific section of FIPS 180-4. A
definition of ML-KEM's `Decaps` transcribes a specific algorithm in FIPS 203,
possibly as corrected by a specific erratum. When the transcription is linked
to its clause, a reviewer can put the two side by side. When an erratum
changes that clause, every definition that depends on it can be found.

Orange's specification stratum is meant to make those side-by-side readings
pleasant. A cryptographer comparing a standard's pseudocode with an Orange
specification should see the same structure: the same names where the
standard names things, the same word sizes, the same rotations and additions,
the same loop over the same indices. The intended style is that of a careful
transcription, not a clever re-derivation. Clever re-derivations belong in the
implementation stratum, where a refinement proof connects them back to the
plain version.

## A clause, read closely

FIPS 180-4 defines six logical functions for SHA-224 and SHA-256 in its
section 4.1.2. Four of them look almost alike:

```text
Σ0(x) = ROTR^2(x)  ⊕ ROTR^13(x) ⊕ ROTR^22(x)
Σ1(x) = ROTR^6(x)  ⊕ ROTR^11(x) ⊕ ROTR^25(x)
σ0(x) = ROTR^7(x)  ⊕ ROTR^18(x) ⊕ SHR^3(x)
σ1(x) = ROTR^17(x) ⊕ ROTR^19(x) ⊕ SHR^10(x)
```

A faithful transcription has to preserve more than it first appears. The
operands are 32-bit words. `ROTR` is a rotation and `SHR` is a shift, and the
last term of each lowercase function is a shift, not a rotation. Addition
elsewhere in the algorithm is modulo 2^32. The uppercase functions belong to
the compression function and the lowercase ones to the message schedule. A
transcription that swapped one rotation amount, or wrote a rotation where the
standard has a shift, would still produce a plausible-looking hash function.
It would fail the official vectors, which is why vectors matter, but a
reviewer comparing the text side by side should be able to see the mistake
before running anything.

That is the standard Orange sets for its specification stratum: a reviewer
should be able to hold the clause in one hand and the definition in the other
and check them symbol by symbol. With the expression slice, Orange can write
these four lines, and they read like this:

```orange
spec big_sigma0(x: Word[32]) -> Word[32] { (x >>> 2) ^ (x >>> 13) ^ (x >>> 22) }
spec big_sigma1(x: Word[32]) -> Word[32] { (x >>> 6) ^ (x >>> 11) ^ (x >>> 25) }
spec small_sigma0(x: Word[32]) -> Word[32] { (x >>> 7) ^ (x >>> 18) ^ (x >> 3) }
spec small_sigma1(x: Word[32]) -> Word[32] { (x >>> 17) ^ (x >>> 19) ^ (x >> 10) }
```

`>>>` is `ROTR`, `>>` is `SHR`, and `^` is `⊕`. The last term of each
lowercase function is visibly a shift, and every amount is a literal that the
compiler checks against the width. These definitions live in the compiler's
conformance fixtures, where Σ0 and Σ1, with the choice and majority functions,
reproduce the working variables `a` and `e` after round 0 of NIST's "abc"
example. That
is still not a transcription in this chapter's sense. The fixture records no
exact edition, errata state, or provenance, and a function that evaluates to a
published value is not thereby a verified reading of the standard.

## The intent boundary

There is a limit that no amount of formalism removes. A proof checker can
establish that an implementation refines an Orange specification. It cannot
establish that the Orange specification says what the standard's authors meant.
That link runs through human reading, and the architecture says so plainly:
the checker can prove a formal specification, while humans, standards
provenance, independent implementations, and test vectors establish that the
formal specification is the intended algorithm.

Orange's proposed response is to make that human link as small, explicit, and
checkable as possible. Transcriptions would be linked to clauses. Official
vectors would be imported with their provenance and run against the executable
specification itself, not only against the fast implementation. Differential
tests would compare against mature implementations of the same standard. And
the transcription's review status would be recorded honestly. In solo mode that means
the record says the owner cross-checked it and that external cryptographer
review is unavailable. A claim whose policy requires external review remains
unsupported rather than silently satisfied.

## Vectors are versioned too

Test vectors deserve the same treatment as the prose. A vector set has a
source, a version, and an interpretation: which fields are inputs, which are
expected outputs, and which cases are expected to fail. Wycheproof-style
adversarial suites include deliberately invalid inputs whose correct outcome is
rejection. If the interpretation is wrong, a passing test proves nothing, or
worse, proves the wrong thing. The provenance schema therefore records each
vector source with its scope and expected interpretation, not just its bytes.

A conformance claim then becomes precise. It names the standard edition and
errata, the profile, the vector set and its digest, and the implementation and
target it was run against. That claim can be satisfied while a functional
refinement claim about all inputs remains unresolved, and the report will show
both.

## Rights are an input

Standards and vectors come with terms. Some may be redistributed freely; some
may be quoted but not copied wholesale; some must be fetched from their
publisher. The reproducibility contract archives exact bytes only when the terms
permit, and otherwise records instructions for reacquiring and verifying them.
A screenshot is never a normative input, and a generated transcription never
replaces its source.

Orange's own licensing is part of this picture.
[D-018](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-018--licenses) leaves the repository's outbound license
open, which is one reason no cryptographic package has been published. The
working recommendation preserves vector and standards provenance according to
each source's terms, whatever license Orange eventually adopts.

## Where things stand

Orange has imported no standard and transcribed no clause with recorded
provenance. Its compiler fixtures evaluate the SHA-256 round functions and the
ChaCha20 quarter round against values published with the standards, but those
fixtures test the compiler; they are not corpus entries and make no claim
about the standards. The first cryptography package will require exact standards and errata
provenance, vectors, negative cases, and complete assumptions before it makes a
claim. When it arrives, the plan is that a reader will be able to point at any
line of an Orange specification and ask which sentence of which edition of
which standard it came from, and get an exact answer.

