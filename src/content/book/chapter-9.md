---
title: "Chapter 9: From Core to Native Bytes"
part: "Part III: Building the Language"
order: 9
description: "The evidence and design decisions needed to connect the reference semantics to native code."
---

A specification that cannot run fast is a reference, not a product. The
cryptography that protects real systems runs on real processors, often inside
tight loops that have been tuned instruction by instruction. If Orange is to
matter to the engineers who write that code, it has to produce native output
that competes with hand-tuned C and assembly. And if Orange is to matter to
everyone else, the properties established upstream have to survive the trip.

This chapter describes that trip. Almost all of it is **proposed**. Orange
currently generates no code, has selected no compiler strategy, and supports no
target. What exists is a precise account of what any strategy would have to
prove, and a comparison designed to choose among five of them.

## Every arrow needs a reason

The [architecture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#1-architecture-objective) draws the
direct-native path as a chain: source modules elaborate into Spec, Impl, and
Game Cores; the implementation lowers into CT IR; verified or validated passes
transform CT IR; the result lowers into Machine IR; checked encoding produces
an object or library together with a generated C interface. Beside that chain
runs a second one: every Core and every transition relation feeds a claim graph,
whose obligations are discharged by automation that produces certificates,
checked by an authoritative checker, and packaged into an evidence bundle.

The most important sentence in that part of the architecture is a rule about
arrows. Every formal-preservation arrow is justified in exactly one of four
ways:

1. it is part of the normative semantics;
2. it is justified by a kernel-checked theorem;
3. it is accompanied by a checked per-artifact certificate; or
4. it is recorded as an explicit external assumption.

There is no fifth category called "obvious glue." Tests, audits, and external
validations remain valuable, but they attach to scoped claims as separate
evidence. They do not close a formal preservation obligation. A compiler that
cannot say which of the four justifies a given step has not preserved anything;
it has merely produced output.

## Two ways to trust a compiler

There are two classic answers to the question of how a compiler can preserve a
property. The first is to prove the compiler correct once: each pass carries a
theorem saying that, for every input, its output behaves as its input did.
CompCert is the famous example. The cost is a large proof, but every later
compilation inherits it for free.

The second is **translation validation**: let the compiler do whatever it likes,
and check each particular output against its input. The pass can be a heuristic
optimizer, a scheduler, or a register allocator that nobody would want to
verify. What gets checked is the certificate it emits for this one artifact.
The cost moves from the compiler's authors to every build, but the trusted base
shrinks to the checker.

Orange's proposals use both. A stable structural pass might carry a reusable
theorem. An aggressive optimization might emit a per-artifact certificate
covering both functional behavior and leakage. The charter's rule is that
evidence survives optimization or the optimization does not run: a pass that
can offer neither a mechanized preservation theorem nor a checked certificate is
excluded from an assurance-preserving build.

## The claim frontier

Not every strategy has to carry its claims all the way to machine code. The
useful concept is the **claim frontier**: the exact point in the pipeline where
a compiler claim stops. A strategy that emits portable C can make honest claims
about the C it emits. It cannot claim anything about what a C compiler then does
with that output unless a checked relation for that C toolchain is separately
accepted.

Seen this way, "Orange compiles to C" and "Orange compiles to native code" are
not two implementations of the same promise. They are two different promises,
and a report must show which one was made.

## Five candidate strategies

[D-010](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-010--compiler-strategy) compares five compiler strategies
symmetrically in the
[compiler-strategy suite](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/COMPILER_STRATEGY_DECISION_SUITE.md):

| ID | Strategy | Where the claim frontier ends |
| --- | --- | --- |
| CP-01 | Theorem and certificate hybrid, direct to native code | Final bytes, with per-artifact certificates for optimization |
| CP-02 | Mechanized proof for every pass, direct to native code | Final bytes, with a reusable theorem per pass |
| CP-03 | Versioned Jasmin backend boundary | Exact Jasmin input, unless a downstream relation is accepted |
| CP-04 | Portable C11 interoperability boundary | Deterministic C11 output, unless a C-toolchain relation is accepted |
| CP-05 | Versioned LLVM IR interoperability boundary | Exact LLVM IR, unless an LLVM-pipeline relation is accepted |

The suite insists that CP-04 and CP-05 are separate candidates. A C source
boundary and an LLVM IR boundary have different semantics, different undefined
behavior, different toolchains, and different target assumptions. Results for
one may not be reused for the other, and "C or LLVM" is not a strategy.

Each candidate must work through the same eight cases: freezing the pipeline
and its authorities; preserving functional meaning through structural lowering;
handling optimization, scheduling, vectorization, and allocation; preserving
one named leakage model; exercising the endpoint and, when claimed, the final
object; failing closed under corruption, substitution, failure, and fallback;
binding replay identities and comparing against the reference semantics; and
measuring what one owner can actually audit and maintain. That makes 40
candidate-case runs. None has been executed, and D-010 cannot be accepted before
the product-form, semantic-strata, assurance-model, proof-foundation, and
solver-trust decisions it depends on.

One constraint in the suite is aimed squarely at wishful thinking. A
direct-native candidate may not shrink its promised frontier to relabel missing
final-byte evidence as unsupported. If a strategy promises native code, the
last mile is part of its exam.

## The last mile

The last mile is where many end-to-end stories quietly stop. A compiler can be
proved correct down to an assembly-like representation and still hand its
output to an assembler, a linker, and a loader whose behavior is merely
assumed. For a direct-native candidate that carries a claim to final objects,
Orange's architecture lists what must be bound and validated: instruction bytes
against the final internal semantics, section placement and permissions,
constants and tables, relocations and symbol bindings, stack and call behavior
at the ABI boundary, CPU-feature dispatch, and final exported-symbol digests.
Any tool that remains in that path either appears in the claim closure or is
covered by an accepted checked relation.

## Several implementations, one specification

Real libraries ship more than one implementation of the same primitive: a
portable version and one or more accelerated versions for particular
instruction-set extensions. Orange's proposal treats each as a separate
implementation with its own claims, and treats the dispatcher that chooses
among them as an implementation too. The dispatcher needs its own proof: that
feature detection is correct under the platform's contract, that it selects
only an implementation whose preconditions hold, that every candidate refines
the same specification, and that fallback never silently lowers assurance.

## The reference evaluator's role

Today's reference evaluator runs pure functions over integers and words. It is
small, but its role in this chapter is permanent. The architecture keeps the reference semantics as a
common differential oracle, independent of whichever strategy D-010 selects.
Every future output path can be run against it on the same inputs. A mismatch
is not a proof of anything, but it is a cheap, early, and very loud alarm.

## Where things stand

Orange has no intermediate representation beyond the Typed Reference Core, no
lowering, no optimization, no code generation, no object output, and no target.
The initial target envelope is proposed under
[D-011](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-011--initial-native-target-envelope) as x86-64 and
AArch64 on Linux, with host tools on Linux, macOS, and Windows. None of it is
implemented.

That is the honest state of a project that decided to settle meaning before
speed. The payoff is that when Orange does emit its first byte of machine code,
the question "what does this byte have to do with the specification?" will
already have a required answer, and a place in the evidence to record it.

