---
title: "Chapter 7: No Disposable Prototype"
part: "Part III: Building the Language"
order: 7
description: "Why Orange builds its permanent compiler through small slices instead of a disposable prototype."
---

Most languages begin with a prototype. Someone writes a quick interpreter to
see whether an idea feels right, then a second, better implementation replaces
it once the design settles. For many projects that is exactly right. It is
cheap, it teaches quickly, and the prototype's shortcuts never matter because
nobody relies on it.

Orange rejects that path on purpose. [D-002](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-002--no-disposable-prototype)
is a **directed** decision from the project owner: build the end product
through permanent, production-lineage components. There is no
prototype-to-rewrite phase and no minimum viable product that postpones the
core assurance claim. This chapter explains why a project about evidence makes
that choice, what it costs, and what it does not mean.

## Why prototypes are dangerous here

A prototype's defining property is that its internal decisions do not matter.
For an assurance-oriented toolchain, that property is the problem. Evidence
attaches to exact artifacts. A test run, a conformance result, or eventually a
proof says something about a particular implementation at a particular
revision. If that implementation is a prototype destined to be replaced, the
evidence goes with it, and the replacement starts with none.

Worse, prototypes tend not to die cleanly. Their conventions leak into the
successor: an error format that became familiar, a numeric shortcut that tests
came to rely on, a parse that was "temporarily" permissive. In an ordinary
product such residue is an annoyance. In a toolchain whose job is to say
precisely what was checked, residue is an undocumented semantic decision.

There is also a subtler risk. A prototype makes design choices by being
written. Once a syntax works in the prototype, it acquires momentum that has
nothing to do with whether it was the right choice. Orange's
[contribution rules](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/CONTRIBUTING.md#solo-development-scope) name this
directly: do not add syntax or architecture selected merely by implementing it
first.

## What the doctrine requires

The [project charter](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/PROJECT_CHARTER.md#7-engineering-doctrine-build-the-end-product-directly)
turns D-002 into eight working rules. Paraphrased, they say:

1. Normative semantics precede convenience syntax and optimization.
2. Every committed component occupies its intended final boundary, with
   production error handling, deterministic output, tests, and versioned
   formats.
3. Early algorithms are permanent conformance fixtures, not demonstrations.
4. Automation may propose proofs; a proof-required claim closes only with
   replayable evidence accepted by the checker.
5. A backend cannot inherit a source property by assertion.
6. Performance work starts with the IR and cost model and stays subordinate to
   semantics and evidence.
7. Unimplemented claims fail closed.
8. No phase may create a second informal language inside build scripts,
   macros, or backend annotations.

The last rule is easy to underestimate. Many verification pipelines end up
with an unofficial language in their glue: a shell script that decides which
proof applies to which file, a macro convention that encodes a precondition, a
naming pattern that tells a tool what to trust. That glue has semantics, but
nobody specified them. Orange's rule is that anything with meaning belongs in
the language or in a checked record, not in the scaffolding around it.

## Small is not the same as temporary

The doctrine does not require the early system to be large. It requires each
small piece to be permanent. The current compiler shows what that looks like in
practice.

The first slice, under [D-024](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-024--initial-compiler-foundation),
contained only source identities, byte spans, a deterministic lexer, structured
diagnostics, and the `orangec` command-line boundary. That is a tiny amount of
language. But each piece was built as the permanent version of itself:

- **Diagnostics have stable codes.** Lexical errors are `ORC0001` through
  `ORC0008`, parse errors `ORC0101` through `ORC0107`, semantic errors
  `ORC0201` through `ORC0210`, and evaluation resource exhaustion `ORC0301`.
  A code, once assigned, keeps its meaning, so tests, documentation, and users
  can refer to it.
- **Every phase is bounded.** Tokens, syntax nodes, parser events, Core nodes,
  semantic events, evaluation steps, and diagnostics each have a fixed ceiling,
  and exhausting one produces a stable resource diagnostic rather than a hang
  or a crash. Hostile input is a design case from the first commit.
- **Output is deterministic.** For the same bytes, edition, and compiler
  revision, the token stream, syntax tree, diagnostics, and evaluation output
  are identical, byte for byte.
- **The compiler has no third-party dependencies.** It uses the pinned Rust
  toolchain and the standard library only, so its trusted build inputs are
  short and explicit.
- **Public API boundaries are tested as boundaries.** The library's
  documentation tests include compile-fail examples showing, for instance,
  that a caller cannot rewrite a parse result or forge the type of an
  evaluated value after the fact.

The typed-literal slice showed what permanence means when a language grows.
S3a did not replace the S2 parser. It extended the same grammar with one new
tail for `spec` declarations, kept legacy empty `spec` and `impl`
declarations syntactically valid, and kept every earlier diagnostic code. Where
it did change behavior, it said so: same-kind duplicate names, which S2's
`check` accepted, now fail semantic checking with `ORC0201`, and OEP-0003
records that as a migration. The S2 conformance runner still runs beside the S3a runner. Where S3a
deliberately declined to extend the language, it said so in the grammar: a
typed `impl` is a syntax error, not a silently ignored annotation, because
implementation semantics have not been decided.

None of that makes the compiler impressive. It makes it extensible without
apology. When expressions arrive, they arrive in the same lexer, the same
parser, the same diagnostic system, and the same bounded analyzer, and the
evidence for the earlier slices still describes the code that runs.

## Research is not a parallel product

Some decisions cannot be made by argument alone. Choosing between a universal
Core and a family of related Cores, or between Rocq and Lean as a proof
foundation, benefits from running the candidates against the same cases. Orange
calls those experiments decision laboratories, and they live under
`research/decisions/` and in the compiler's integration tests.

D-002 is careful about their status. A decision case is research evidence, not
an unreviewed parallel implementation. The losing candidate never becomes a
second product, and the winning candidate's case graduates into the permanent
test suite rather than shipping as-is. The laboratories are instruments for
making a choice, not early versions of the thing chosen.

## What the doctrine costs

The costs are real, and the project does not pretend otherwise. Building
permanent components means writing error handling, budgets, and tests for
features that are still tiny. It means the language grows slower in breadth
than a prototype would, and that a reader browsing the repository finds a
great deal of rigor around a small amount of syntax.

The compensation is that nothing has to be thrown away and nothing has to be
re-earned. A diagnostic introduced in the first slice is still correct. A
conformance fixture written for the typed-literal slice is still a fixture. When
Orange eventually makes a claim about a compiled artifact, the claim will be
about code that grew continuously from the first commit, not about a successor
that inherited a prototype's reputation.

## What the doctrine does not mean

"No disposable prototype" is sometimes misread as "no change." It is not.
Pre-alpha syntax may evolve, and the roadmap says so. Components can be
refactored, generalized, and rewritten internally when their boundaries
improve. What the doctrine forbids is a change in *status*: shipping something
as a stand-in with the plan of replacing it, or letting a stand-in's behavior
become the definition by default.

Nor does it mean waiting. The project owner has been explicit that development
should keep moving: on 2026-09-28 the owner directed that Orange should not
freeze development unless the owner specifically asks for it. The permanent
lineage is a rule about quality and continuity, not a reason to pause. The
fastest honest path is to build the real thing in small, finished pieces, and
to keep building.

