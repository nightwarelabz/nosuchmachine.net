---
title: "Preface"
part: "Front matter"
order: 0
description: "The book's audience, the current state of Orange, and the boundary between aspiration and evidence."
---

Orange begins with an uncomfortable observation: high-assurance cryptography is
not one problem. It is a chain of problems whose boundaries are easy to hide.
A mathematical construction, an executable implementation, a proof, a compiler,
a test suite, a binary, and the machine that runs it can each be reasonable in
isolation while the claim connecting them remains unclear.

This book is the reader's guide to that chain. It is meant for cryptographic
implementers, verification engineers, cryptographers, standards authors,
library maintainers, integrators, auditors, and curious programmers who want to
understand the project without first reading every planning record. It will
explain the ideas in ordinary technical prose, show the permanent implementation
as it grows, and keep the boundary between aspiration and evidence visible.

Above all, Orange is written for people who read mathematics for a living:
cryptographers, cryptologists, and cryptanalysts. Its aim is to be exact and
beautiful at once. A specification should read like the clause of the standard
it transcribes, with the same words, the same rotations, and the same modular
additions, and every statement Orange makes about a piece of code should be as
precise as the mathematics behind it. That aim shapes the language and it
shapes this book. Where the prose is careful about a qualifier, it is because
the qualifier is where the truth lives.

That boundary matters because Orange is young. The repository is in solo,
pre-alpha compiler development. It has a production-lineage Rust compiler
foundation, a deterministic lexer, a bounded parser, structured diagnostics,
and a deliberately small Orange 2026 grammar. The accepted S3a slice adds
bounded semantic checking and reference evaluation for closed typed `spec`
literals. The S3b slice, implemented and awaiting the owner's acceptance of its
specification, extends them to pure functions over integers and 8- to 64-bit
words, the S3c slice, likewise implemented and in review, adds named
intermediate values and explicit conversions between those types, the S3d
slice adds fixed-length arrays, so that a cipher's whole state is one value,
the S3e slice adds loops over literal ranges, so that a standard's rounds are
one expression, and the S3f slice adds truth values, comparisons, Euclidean
division, and conditionals, so that a prime field and a key exchange can be
written as their standards write them, the S3g slice lets an index depend
on data, still proved in range, so that AES's S-box is a lookup, as FIPS 197
writes it, the S3h slice lets a program span several modules, so that
HMAC is written over SHA-256 by name, as RFC 2104 defines it, the S3i
slice puts a field in a type, so that X25519's ladder is written in the field
of 2^255 − 19 with no reduction in sight, as RFC 7748 writes it, the S3j
slice lets a round name its values inside the loop that runs it, so that a
round of SHA-256 names T1 and T2 where FIPS 180-4 does, the S3k slice adds
tuples, so that a loop carries SHA-256's eight working variables by name and
ChaCha20's quarter round gives its four words at once, the S3l slice
writes bytes as the standards print them, so that RFC 4231's key is "Jefe"
and SHA-256's padding is joined with `++`, the S3m slice lets one `spec`
stand for every length in a range, so that SHA-256 is written once for every
message from 1 through 119 bytes, the S3n slice reads and writes words in
the byte order a standard names, so that SHA-256 reads a block as sixteen
big-endian words in one conversion, the S3o slice lets one `spec` stand
for a list of types, so that exponentiation is written once for five prime
fields and SHA-256 and SHA-512 share one round, the S3p slice lets an
array hold 65,536 elements, so that RFC 8439's 375-byte and 265-byte vectors
are written as the RFC prints them, the S3q slice lets a module state its
known answers as tests beside its functions, so that RFC 8439's examples are
claims the program checks, and the S3r slice lets a shift or rotation take an
amount computed from data, so that RC6 and SHA-3 turn their words as their
designers write them. S3s adds tables of scalar rows, S3t lets each finite
size instance compute its own exact modulus, and S3u carries arrays to four
dimensions, so that ML-KEM's matrix of polynomials is one type, with updates
that name one index per dimension, as AES and Keccak update their states.
None of them
adds typed
implementations, refinement, code generation, a standard library, a proof checker, package or release behavior,
or a verified cryptographic implementation. A passing test suite is
evidence about the implemented slice; it is not evidence that the eventual
language or compiler is sound.

The permanent source formatter now supplies one frontend tool: it lays out
parsed syntax while preserving token spellings and comment bytes and anchors.
It does not validate types or imports, accept the semantic proposals, or
complete the wider developer-tool and release stages.

The source documentation generator produces a standalone offline reference
for written declarations and an escaped source listing. Its scope is likewise
syntactic: resolved interfaces, ABI contracts and checked claim matrices must
come from the later compiler and proof paths.

The local witness replayer now decodes exact concrete values against a checked
Boolean function's parameters and evaluates that function for the supplied
arguments. `Falsified` and `HoldsForThisWitness` describe a single reference
execution. They are not a universal proof, an authoritative atomic claim or
solver-trust decision evidence.

The manuscript uses four kinds of statements:

- **Current** describes behavior or evidence present in the repository now.
- **Directed** describes an explicit project-owner decision that controls work.
- **Proposed** describes an architecture or policy recommended for a later
  decision gate.
- **Future** describes an intended capability whose design, implementation, or
  evidence is not complete.

The distinction is not decorative. A proposed architecture cannot become an
accepted one merely because a chapter speaks about it fluently. When this book
and a normative source disagree, the normative source, accepted Orange
Enhancement Proposal, and [decision register](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md) control. The book
must then be corrected.

The book has five parts. Part I explains why Orange exists and what kind of
language it is meant to be. Part II covers meaning and trust: semantics,
proofs, and secrets. Part III describes the compiler, from the permanent
foundation that exists today to native code and foreign interfaces. Part IV
turns to cryptography itself: standards, the corpus, and external validation.
Part V covers evidence, replay, the solo operating model, and releases. The
appendices collect the current grammar and command line, the decision ledger,
the claim vocabulary, and source notes. A cryptographer may prefer to read
Chapters 1 through 3, 6, 11, and 12 first; an implementer, Chapters 4 and 7
through 10; an auditor, Chapters 2, 14, 15, and 17.

The title **The Orange Book** and the name **Orange** are repository-local
working names. They do not assert trademark clearance or authorize publication
to a package registry, domain, or other public namespace. The manuscript is a
living part of the solo project, not a product release.

