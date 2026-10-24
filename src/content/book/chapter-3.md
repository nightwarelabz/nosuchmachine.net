---
title: "Chapter 3: One Language, Several Semantic Worlds"
part: "Part I: Why Orange"
order: 3
description: "One language with distinct semantic roles for specifications, implementations, proofs, and foreign interfaces."
---

A cryptographer who writes down a hash function is doing several different
things at once, usually without naming them. There is a mathematical object: a
function from byte strings to fixed-length digests, defined by compression
rounds over words of a stated width. There is an algorithm that computes it,
with buffers, padding, and a streaming state. There may be a fast variant that
uses vector registers or a dedicated instruction. There is a security notion,
such as collision resistance, stated as a game against an adversary. And there
are arguments connecting these, some mechanical and some mathematical.

Each of those things has a natural way of being true. A mathematical function
is true when it is total and well defined. A stateful algorithm is correct when
every execution computes the function and never reads outside its buffers. A
vectorized routine is correct when its lanes, shuffles, and target features do
what the scalar algorithm does. A game is meaningful when its probabilities and
oracles are defined, and a reduction is sound when its advantage bound follows.
These are different kinds of meaning. Orange's language design begins by
refusing to pretend otherwise.

## Why a standalone language

The first question is whether Orange should be a language at all. Excellent
alternatives exist. A project could orchestrate existing tools: write the
specification in Cryptol or hacspec, the fast code in Jasmin, the security
argument in EasyCrypt, and connect them with a manifest. It could embed a
cryptographic domain-specific language inside a proof assistant such as F\*,
Lean, or Rocq, inheriting a mature kernel and library. It could accept a subset
of Rust with proof annotations and meet implementers where they already work.

Orange examined those options as candidates rather than dismissing them. The
[product-form decision](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-003--product-form) compared four forms
against eight hard gates and accepted candidate PF-01, a standalone
domain-specific language with its own editioned semantics and canonical Core
formats. That decision is **current and accepted**: the project owner accepted
it on 2026-07-26 and
[OEP-0004](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0004-standalone-orange-product-form.md) binds it
to exact revision `a82a5cec2ee4359dc2fe66171f17c93146747333`.

The reasoning is the seam argument from Chapter 1 turned on the language
itself. If the surface language belongs to a host prover, every upgrade of that
prover becomes an upgrade of Orange's meaning, and ordinary cryptographic code
inherits proof-engine conventions it does not need. If Orange is only an
orchestrator, the manifest quietly becomes the real language, and the crossings
between tools remain the least specified part of the system. Interoperability
with those systems is still valuable, and later chapters return to it. But
delegating the language would preserve exactly the gaps Orange exists to close.

Accepting a standalone form does not accept a semantics. PF-01 says Orange owns
its meaning; it does not say what that meaning is. The rest of this chapter
describes the leading proposal and the discipline that any answer must obey.

## Five roles, one module system

The [project charter](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/PROJECT_CHARTER.md#4-product-thesis) proposes one module
system with several deliberately separated declaration roles:

- **Specification** for total mathematical functions and relations;
- **Implementation** for terminating, memory-safe executable procedures with
  contracts and typed failure;
- **Machine implementation** for explicit layout, vector operations, target
  intrinsics, and leakage-aware control flow;
- **Game** for probabilistic programs, adversary interfaces, and
  reduction-based security claims; and
- **Proof** for refinements, invariants, equivalences, noninterference, and
  security reductions.

The roles share names and types where sharing is sound. A specification of
SHA-256 and its implementation can live side by side in one module and be read
together. What the roles must not share is a single set of operational rules.
Mathematical integers do not overflow; machine words do. A pure function cannot
sample randomness; a game must. A proof may mention ghost values that must
never influence a running program. A vector intrinsic has meaning only on a
target that provides it.

A **claim** is conspicuously absent from that list. In the
[semantic-strata proposal](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SEMANTIC_STRATA_DECISION_SUITE.md#31-source-declaration-roles),
a claim is a record that binds a subject, a relation, assumptions, and evidence.
It is not a sixth semantic world with its own execution rules. Foreign imports
and deliberate declassification are similar: they are cross-cutting boundaries
that must be declared, not annotations that switch off a stratum's rules.

All of this is **proposed**. The role map is a hypothesis under
[D-004](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-004--semantic-strata), which remains open.

## The crossings are the design

If the roles were the whole story, Orange would be five small languages sharing
a parser. The interesting part is how meaning moves between them. The D-004
suite names fourteen required crossings, from `SR-01` through `SR-14`, and
requires every candidate architecture to express each one with a versioned
name, domain, codomain, definedness conditions, obligations, identity inputs,
trust role, failure behavior, and prohibited reverse inferences.

A few of those crossings show the shape of the problem:

| Crossing | What it must preserve |
| --- | --- |
| Specification source to Spec Core | Either one checked pure subject or failure without creating an identity |
| Implementation to specification | A named refinement obligation between explicit subjects, never inferred from equal names |
| Implementation to CT IR | Runtime meaning through ghost erasure and lowering, or invalidation of the dependent result |
| Game to game | A named reduction that preserves its exact bound expression |
| Claim record to subject and evidence | No upgrade of a failed, missing, unknown, or unsupported relation |

The suite also fixes a short list of invariants that every candidate must
respect. They read almost like a style guide for honesty:

- a shared source name never creates a refinement relation;
- sampling cannot enter a specification or implementation through a pure
  embedding;
- state, memory, target, and ambient effects cannot enter the pure Core;
- proof or ghost data cannot affect runtime behavior;
- machine-level source cannot bypass the checked low-level boundary;
- byte or format conversion is not semantic preservation; and
- a failed crossing invalidates its dependent result rather than producing a
  generic lower assurance level.

The first rule deserves attention because it is so tempting to break. A module
that contains `spec sha256` and `impl sha256` looks, to a human reader, as if
the second implements the first. Orange's proposal is that the matching names
mean nothing semantically. Refinement is a relation that must be stated,
checked, and bound to exact subjects. The reader's intuition is a good reason
to write the refinement obligation; it is not evidence that the obligation
holds.

## Five candidate architectures

The research recommendation behind the charter is a role-oriented family of
formally related Cores: a Spec Core, an Impl Core, and a Game Core as the
normative program semantics; CT IR and Machine IR as compilation boundaries;
and a proof-evidence interface that names judgments without choosing a proof
calculus. A small **Shared Pure** subset would let deterministic definitions be
reused across roles without importing state or randomness.

That recommendation is not a selection. The
[D-004 suite](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SEMANTIC_STRATA_DECISION_SUITE.md#2-candidate-architectures)
compares it symmetrically with four alternatives:

| ID | Candidate | Idea |
| --- | --- | --- |
| ST-REL | Role-oriented related family | Separate Cores per role with named, checked relations |
| ST-UNI | Universal Core | One effect-parameterized calculus for everything |
| ST-DUAL | Pure/effect pair | One pure Core plus one general effect Core |
| ST-MIRROR | Five mirrored Cores | One Core per source role, joined by crossings |
| ST-HOST | Host-delegated strata | Local deterministic semantics; games, proofs, or machine meaning delegated to external systems |

The universal Core deserves a fair hearing. One calculus is easier to specify
once, easier to implement once, and avoids a family of translations. The
concern recorded in the decision register is that mathematical totality,
probabilistic games, stateful memory, target leakage, and concrete instructions
make conflicting demands, and that hiding those conflicts inside effect
annotations could make the semantics less honest rather than more. That is a
hypothesis to test against five fixed cases: SHA-like word code, mutable-buffer
refinement, a secret-dependent rejection, one vector intrinsic, and one game
with a reduction. The first run of all 25 candidate-case units, on 2026-09-28,
passed every case for ST-REL, ST-UNI, ST-DUAL, and ST-MIRROR and failed every
case for ST-HOST, whose delegated hosts depend on the open D-006 and D-011
decisions. The cases could not tell the four passing candidates apart, so the
run selects nothing. Its results are contributor-produced and unreviewed. A
second suite adds two cases, semantic evolution and relabeling within one
authority, and five cost measures. Its run, on the same day, closed all seven
cases for the same four candidates, and under the isolation-first rule, which
the owner chose knowing which candidate each offered rule would leave, only
ST-REL remains. That result is also contributor-produced and unreviewed. It is
not a recommendation, and D-004 remains proposed.

## What exists in the language now

The current language shows only the outline of this design. Orange 2026
reserves `spec` and `impl` as declaration keywords and gives them separate
namespaces, so a module may contain both `spec rounds` and `impl rounds`
without a conflict while two `spec rounds` declarations are an error. The words
`game`, `proof`, and `claim` are reserved and introduce nothing. Only typed
specifications have meaning: pure `spec` functions over `Int`, `Bool`,
`Word[8]` through `Word[64]`, the integers modulo a constant, fixed-length
arrays of those scalars through four dimensions, and tuples of scalars or
arrays, built from
literals, parameters, calls, operators, comparisons, `let` bindings, at the
start of a body, a loop's step, or a branch, tuple patterns, explicit
conversions, array literals, byte strings, tuples, indices, including indices
keyed by data and one index per axis, selections by position, joins, slices,
bounded loops, updates, including a path of one index per dimension, and
conditionals. A `spec` may declare sizes, each ranging over a finite
set of integers, and then stands for one function for each of their values,
with its array lengths, loop bounds, and own modulus expressions written from
them. An `impl` body must
still be empty. A
program may span several modules, one per file: a module names the modules it
uses at its head and calls their functions by module name, as in
`sha256::compress(h, block)`, and nothing is imported into its scope. A
`type` declaration names a type, such as the field of X25519 or an array of
rank two, three, or four, for the rest of its module.

Even that small surface already follows the chapter's rules. `Int` and each
word width are distinct types, and a value moves between them only through a
written `as`, never implicitly. A same-named
`spec` and `impl` have no relation. Nothing in the Typed Reference Core
pretends to be a Spec Core, and the Core records no claim. The expression,
binding, array, loop, condition, lookup, module, modular, block, tuple, byte, size, byte-order, type-parameter, length, test, amount, nested-array, static-modulus, and dimension slices were built to fit inside every candidate's
specification stratum: they are pure, total, and deterministic, so the strata decision can
place them without changing a line of source.

## Beauty as a constraint

Orange is written for cryptographers, cryptologists, and cryptanalysts, people
who read mathematics for a living. That audience sets a high bar for how the
language should look. A specification written in Orange ought to read like the
definition in a good paper: rotations where the standard rotates, addition
modulo a word size where the standard adds modulo a word size, and nothing else
in the way. The separation of worlds is what makes that possible. When the
specification stratum only has to be mathematics, it can look like
mathematics. The mess of buffers, targets, and timing belongs to the strata
built to carry it, where it can be stated precisely instead of leaking into
every definition.

The goal, then, is not five languages bolted together. It is one language
whose parts are honest about the kind of truth they express, so that the
places where those truths meet can be written down, checked, and read.

