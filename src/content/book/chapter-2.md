---
title: "Chapter 2: Claims, Not Labels"
part: "Part I: Why Orange"
order: 2
description: "How Orange describes assurance through precise claims, evidence, assumptions, and independent outcomes."
---

Security engineering has a vocabulary problem. Words such as *safe*,
*conformant*, *constant-time*, and *verified* sound like properties, but in
ordinary use they often behave like stickers. They are placed on a library,
package, or release after some valuable work has been done, then asked to carry
far more meaning than that work established.

The sticker may begin with a true statement. A team proved a functional theorem.
A laboratory ran a validation program. A test suite passed. A memory-safe
language rejected certain errors. A timing experiment found no signal. Trouble
begins when the subject, conditions, and evidence disappear, leaving only the
adjective. The reader can no longer tell whether *verified* means a parser
accepted the source, a proof kernel checked a theorem, a compiler preserved the
theorem, or a reviewer inspected the final object. The strongest available
interpretation tends to win, even when it is the least justified.

Orange's [proposed public assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#3-claim-model) replaces
that compression with a set of separately named claims.
[D-005](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-005--public-assurance-model) has not yet been accepted,
so the complete claim taxonomy and product record format remain proposals. The
underlying discipline, however, already controls how the project describes its
present compiler: say exactly what happened, bind the statement to an artifact
and revision, name the evidence, and state what the result does not show.

## A claim is a proposition with coordinates

Consider the sentence, “the implementation is constant-time.” Before it can be
checked, almost every important noun in that sentence needs coordinates:

- Which implementation, source revision, exported symbol, and artifact bytes?
- For which inputs, preconditions, target, instruction set, and calling
  environment?
- What can the observer see: branches, addresses, instruction classes, timing,
  caches, speculation, power, or something else?
- Which compiler and transformations connect the reviewed program to the
  executed bytes?
- Which assumptions exclude behavior outside the model?
- What evidence supports the proposition, and which authority checked it?

Without those coordinates, the sentence may express an intention or a useful
engineering convention, but it does not yet identify one reviewable assurance
claim. Adding coordinates does not guarantee truth. It makes truth and error
arguable against the same subject.

This is why an Orange claim is intended to carry exact wording rather than only
a category name. The category says what kind of question is being asked. The
wording says which proposition must be supported. Its subject identifies a
definition, export, control set, or artifact by revision and digest. Its context
identifies such things as the language edition, toolchain, cryptographic
profile, target profile, and leakage model. Assumptions and exclusions mark the
edge of the statement instead of hiding beyond it.

The digest matters because names drift. A function called `encrypt` can change
while retaining its spelling. A standard profile can acquire errata. A compiler
flag can alter the generated object without altering the source. Human-friendly
names remain essential for reading, but a claim about exact bytes needs an
identity that changes when the bytes do.

## One artifact, several answers

A native cryptographic export does not have one assurance status. It presents a
matrix of questions whose answers may differ:

| Question | Example scope | Possible evidence |
| --- | --- | --- |
| Does it match a standard? | Named edition, profile, and input domain | Vectors, differential tests, or external validation |
| Does it realize a specification? | Named implementation and mathematical definition | Refinement proof or checked certificate |
| Does it execute safely? | Named faults, preconditions, and runtime model | Type argument, proof, analysis, and adversarial tests |
| Does it terminate? | Named inputs and environment assumptions | Variant or termination proof |
| What does it leak? | Named source or target observation model | Noninterference proof, translation evidence, and measurements |
| Did compilation preserve a property? | Exact passes, toolchain, target, and final bytes | Pass theorem or translation-validation certificate |
| Does the foreign boundary agree? | Named ABI, layout, alias, length, and error rules | Contract proof and adversarial caller tests |
| Was sensitive state erased? | Named object, lifecycle point, target, and architectural model | Erasure proof, binary analysis, and scoped measurements |
| Does it meet a security theorem? | Named game, advantage bound, and assumptions | Checked reduction or recorded external proof |
| What did empirical testing observe? | Named corpus, method, environment, and implementation/target | Vectors, differential tests, fuzzing, timing, or interoperability records |

The rows are related, but they are not interchangeable. Standard vectors can
expose a wrong answer without proving all answers. A source refinement theorem
can establish functional meaning without describing cache observations. A
leakage argument can hold for a faulty algorithm. An ABI wrapper can be
memory-safe while passing bytes in the wrong order. A security reduction can be
mathematically sound while the shipped implementation fails to realize the
construction it studies.

The purpose of a claim matrix is not to demand that every row be satisfied
before any work is useful. It is to prevent a result in one row from silently
coloring all the others. A small library with three narrow, well-supported
claims is easier to reason about than one broadly advertised as verified.

## Four outcomes, not one light

The proposed model gives each claim one of four outcomes: `satisfied`,
`not_satisfied`, `unresolved`, or `unsupported`. These are not grades on a
single scale.

`satisfied` means the claim has a basis that its policy permits and that basis
is valid for the recorded subject. It does not mean adjacent claims are
satisfied. A successful vector claim, for example, remains a successful vector
claim rather than becoming functional correctness for all inputs.

`not_satisfied` means the proposition was checked far enough to obtain a
negative result. A counterexample, failed certificate, mismatched vector, or
violated contract may justify this outcome. It is evidence about the claim, not
merely the absence of success.

`unresolved` means the system cannot presently decide the proposition. Proof
search may time out. A solver may return `unknown`. Required evidence may be
incomplete. An open design question may prevent the claim from being stated
precisely. Turning any of these conditions into success would confuse a search
procedure with an authority.

`unsupported` means the selected toolchain, model, target, operating mode, or
project capability does not offer the claim. This outcome is especially
important for honest partial systems. Orange currently has no native target
model, leakage semantics, ABI, proof checker, or release path. Claims that
depend on those facilities are not weakly satisfied by the frontend test suite;
they are outside the implemented support envelope.

The distinction affects action. A `not_satisfied` claim points toward a defect
or a false proposition. An `unresolved` claim may need more evidence, a smaller
statement, or a better procedure. An `unsupported` claim may require an explicit
product decision and new machinery. Collapsing all three into a red light loses
that information. Collapsing them into “not yet verified” is gentler wording but
has the same defect.

## Evidence keeps its authority

Evidence is useful because of what it can support, not because it can be counted.
A thousand passing tests do not add up to a proof for every input. A proof does
not become an external validation because two people read it. A reproducible
build does not become a correctness result because the reproduced bytes are
stable. Each basis retains its type and authority.

Orange's proposed records distinguish kernel proofs, checked certificates,
external proofs, test runs, audits, external validations, and assumptions. A
claim policy determines which kinds may close which claim and which complete
set is mandatory. More than one basis can support the same proposition: a
refinement claim may have a checked proof, tests that catch regressions, and an
external review record. A favorable optional basis cannot mask a failed,
expired, unavailable, missing, or mismatched mandatory basis, context, trust
component, or composition edge. Those bases can reinforce confidence and
diagnose different failures without pretending to be the same thing.

This separation is most visible around automation. A solver is excellent at
searching for proofs or counterexamples. If a proof-required claim depends on a
small checker, the solver's success must arrive as a certificate or proof object
that the checker accepts. A timeout is unresolved, not false. An unsupported
certificate step is unresolved, not true. The search tool can be large and
heuristic while the acceptance path remains small and explicit.

External authority also stays external. A laboratory certificate, audit, or
standards-body record may be exactly the right basis for a validation claim.
Recording its issuer, scope, subject, dates, and digest makes it auditable; it
does not transform that record into an Orange theorem. Conversely, a local
theorem does not impersonate a certification program with legal and procedural
requirements that the project has not performed.

## Assumptions are dependencies

Every serious claim rests on something it does not prove internally. A logical
kernel is trusted to implement its rules. A target model is assumed to describe
the processor behavior relevant to the property. A caller may be required to
provide nonoverlapping buffers of sufficient length. An operating system may be
trusted to supply pages with stated behavior. A cryptographic theorem may rely
on a named hardness assumption.

Calling these items assumptions should not make them vague. The useful form is
specific: what is assumed, why the claim needs it, and what happens if it is
false. This turns an assumption into a visible dependency in the claim closure.
Different claims over the same artifact can then have different trust bases. A
mathematical equality need not inherit the operating system assumptions of a
runtime erasure claim. A vector result need not pretend that a proof kernel was
involved.

Exclusions serve a related purpose. They state tempting interpretations that
the wording does not cover. A source-level address-trace result might exclude
power analysis, speculation, and the behavior of the final machine code. A
repository-control result might exclude compiler correctness and release
readiness. Exclusions do not repair an overbroad claim, but they help keep a
narrow one from expanding as it travels.

## Composition must be earned

The most important claims usually cross boundaries. To say that shipped object
bytes implement a specification, it is not enough to have a source proof and an
object file. The graph needs justified edges through lowering, optimization,
assembly, linking, and the foreign boundary as applicable. Each edge may use a
general preservation theorem, a per-artifact checked certificate, or another
explicit authority allowed by policy.

This creates a useful failure rule: a claim does not jump over a missing edge.
If source code refines a specification but the backend has no preservation
argument, the source claim remains available and the final-byte claim remains
unresolved or unsupported. Nothing has been taken away from the source theorem.
The system has simply declined to lend it to a different subject.

Composition also runs in the other direction. A broad release statement should
be decomposable into the narrower propositions on which it depends. A reader
ought to be able to ask why a property is reported, inspect the basis, enumerate
its assumptions, and follow identities back to exact artifacts. The eventual
Orange trust report is intended to print that closure, not a marketing summary.

## The provisional record and the current compiler

The repository contains a provisional Gate 0
[claim-record schema](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/schemas/gate0/claim-record-v0.1.schema.json) and
[conformance fixtures](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/conformance/foundation/README.md). They demonstrate
structural ideas: an exact subject, identified or inapplicable contexts,
assumptions, exclusions, evidence references, a typed basis, an outcome, and a
review policy. They are explicitly non-product records with synthetic fixture
data. D-005 remains proposed, so these files are not the stable public claim
format and do not authorize future syntax or assurance behavior.

The current compiler makes much smaller observations. At its recorded revisions,
the tests show that the implemented lexer, parser, S3a semantic analyzer, Typed
Reference Core constructor, evaluator, diagnostics, resource limits, and CLI
behave as asserted by those tests. The normative documents define the accepted
surface and typed-literal behavior. The conformance index maps each current S3a
rule to named executable evidence, while warning that a named test need not
exhaust its rule.

That is worthwhile evidence for a pre-alpha compiler slice. It is not a claim
that Orange has proved its semantics, verified the Rust implementation, produced
cryptography, preserved a property into machine code, met a leakage model,
passed independent review, or created a release. The honest statement is longer
than “verified,” but it is also more useful: a reader can see what is present,
what remains open, and which next result would actually change the picture.

The discipline of claims is therefore not paperwork added after verification.
It is the interface between technical work and public meaning. A proof, test,
build, review, and certificate become safer to reuse when none is forced to
masquerade as the others. Orange's ambition is not to make every box green. It
is to make every box precise enough that green, red, unresolved, and unsupported
each tell the truth.

