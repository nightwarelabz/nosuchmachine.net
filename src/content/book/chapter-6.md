---
title: "Chapter 6: Secrets Are a Semantic Concern"
part: "Part II: Meaning and Trust"
order: 6
description: "Secrecy, leakage policies, constant-time claims, and the gap between source code and native execution."
---

Side channels are the part of cryptographic engineering that most resists
being written down. A routine can compute exactly the right answer and still
betray its key through the time it takes, the cache lines it touches, or the
branch it chooses. Engineers have developed good habits in response: avoid
secret-dependent branches, avoid secret-dependent table lookups, prefer
arithmetic masks to conditionals. In most languages those habits live in
comments, code review, and the memory of whoever wrote the routine.

Orange's charter takes the opposite position in one short sentence: *secrets
are a semantic concern*. Secrecy labels are meant to affect typing, permitted
control flow and addresses, leakage traces, diagnostics, and review of the
foreign interface. They are not comments. This chapter describes what that
would mean and why the details are still open.

## What "constant time" actually says

The phrase *constant time* is itself a label of the kind Chapter 2 warned
about. Literally, it is false for almost all real code, which takes different
amounts of time on different machines and different days. What engineers mean
is narrower and more useful: what an attacker can observe does not depend on
the secret.

That can be made precise as **two-run noninterference**. Take two executions
with the same public inputs and possibly different secret inputs. Record what
an observer could see in each: the sequence of branch decisions, the memory
addresses accessed, and so on. The program satisfies the property if the two
observation traces are always equal. A difference in the secret produces no
difference the observer can detect.

The definition immediately raises the question the label hides: *what does the
observer see?* The answer is a model, and different models make different
claims. Orange's [assurance model](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#41-baseline-model) proposes a
baseline observation trace containing at least:

- branch decisions and targets;
- memory addresses, widths, and access classes;
- indirect call and return targets;
- traps, exceptions, and termination; and
- use of instructions classified as variable-latency on the target.

A claim under that model names its public-input relation and any permitted
declassification. It says nothing about power consumption, electromagnetic
emanation, faults, speculation, or unspecified microarchitectural behavior.
Those are excluded unless a separate profile models them.

## Versioned policies instead of a Boolean

Because the observation model is part of the claim, Orange proposes to replace
a single `constant_time` flag with versioned leakage policies. The
[architecture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#45-ct-ir) sketches a family:

| Policy | What it constrains |
| --- | --- |
| `ct-architectural-v1` | Branches, call targets, memory addresses and widths, traps, and termination are secret-independent |
| `ct-variable-latency-v1` | Additionally keeps secret operands away from instructions the target profile classifies as variable-latency |
| `ct-speculative-v1` | Uses a named speculative-execution model or a proved hardening transformation |

Later profiles could tie claims to documented hardware modes such as
data-independent timing. Masked implementations, power, electromagnetic
emanation, and fault resistance would each need their own semantics, target
assumptions, and evidence. None extends the baseline by implication. A reader
who sees `ct-architectural-v1` satisfied learns exactly that, and nothing about
Spectre.

## Secrecy in the type system

For those claims to be checkable, secrecy has to be visible to the compiler.
The proposal is for public and secret to be semantic labels on values and
types. A branch on a secret value, or an array index computed from one, would
be a type error in a claim-bearing kernel rather than a lint. Secret values
would be non-copy by default, so every duplicate is explicit and tracked.
Formatting and debug output would refuse to print them. The foreign-interface
contract would record which arguments carry secrets.

Deliberate release of secret-derived information is sometimes necessary. A MAC
comparison eventually reveals whether the tag matched; a rejection-sampling
loop reveals how many attempts it took. The proposal is that every such release
names a declassification policy, visible in the claim graph, rather than an
annotation that switches the checker off. The difference is between a program
that says "this bit is intentionally public, under this policy" and one that
says "trust me here."

Erasure follows the same discipline. An `erase` obligation, or a zeroization
claim, concerns architecturally modeled storage and the copies the compiler
itself creates. It does not promise physical destruction, cache clearing, or
resistance to remanence unless a stronger target policy says so.

## A selection, two ways

Consider choosing between two words, `x` and `y`, according to a secret bit
`b`. The obvious code branches: if `b` is one, return `x`, otherwise return
`y`. Under the baseline observation model the branch decision is part of the
trace, so two runs that differ only in `b` produce different traces. The
property fails, and a type system that knows `b` is secret can reject the
branch where it is written.

The familiar alternative computes a mask. Negating the bit in w-bit
two's-complement arithmetic, that is modulo 2^w, gives either all ones or all
zeros, and the result is `(x AND mask) OR (y AND
NOT mask)`. Every run performs the same operations on the same addresses, the
traces agree, and the property holds at the source. This is code cryptographers
already write by hand. Orange's contribution would be to check it, and to
record that the check covered this function, under this model, at this layer,
and nothing further. The next section explains why the last clause matters.

## Why the source is not the binary

A routine can be perfectly constant-time as written and leak once compiled. An
optimizer may turn a carefully masked selection back into a branch, because a
branch is faster and, as far as ordinary semantics is concerned, equivalent.
Research on a modified CompCert showed that preserving cryptographic
constant-time is a distinct compiler proof, not a free consequence of ordinary
semantic preservation.

So a leakage claim about shipped bytes needs more than a source-level argument.
The [proposed evidence stack](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#43-evidence-stack) for a target
leakage claim runs through seven layers: source or CT IR noninterference;
pass-by-pass leakage preservation or checked translation validation;
correspondence between final object bytes and the accepted final semantics;
target instruction classification and ABI assumptions; binary static
inspection; empirical timing tests on named hardware as defense in depth; and
specialist laboratory work for release profiles that require it. While that
last kind of work is unavailable, those stronger profiles remain `unsupported`
rather than blocking everything else.

The proposed CT IR is the intermediate language built for this job. It is
first-order, monomorphized, fixed-width, and free of undefined behavior, and it
carries secret and public domains alongside an executable leakage trace. It is
where the compiler would check that its own transformations did not introduce
a leak.

## A lookup, two ways

Tables raise the same question as branches. FIPS 197 defines AES's SubBytes as
a lookup: each byte of the state selects one of the 256 entries of the S-box.
Written directly, the lookup reads memory at an address that depends on the
state, and so on the key. Under the baseline observation model that address
is part of the trace, and on a machine with a cache it is part of the time as
well. Table-driven AES was broken this way in practice: Bernstein's 2005
cache-timing attack, and the cache attacks of Osvik, Shamir, and Tromer,
recovered AES keys from the cache behavior of its table lookups.

The constant-time alternative reads every entry. For each position j of the
table it compares j with the index, turns the comparison into a mask, and
accumulates the entry under that mask, so every run touches all 256 entries in
the same order and the addresses no longer depend on the secret. The price is
256 reads for one lookup. Bitsliced implementations go further and compute the
S-box as a circuit of Boolean operations, with no table at all.

Orange 2026 states the first form, because it is the form the standard
states: since the [lookup slice](/book/chapter-8/#tables-keyed-by-data), a specification may
write `s[a[i]]`. That is the right place for it. A lookup in a specification
is a function from a table and a position to an element. It has no addresses,
so it has no trace, and a specification that had to write the scan would ask
every reviewer to recognize SubBytes inside it. Which form a machine should
run is this chapter's question, and it belongs to the implementation and
target strata. There, as proposed above, an index computed from a secret
would be a type error in a claim-bearing kernel, unless the lookup is lowered
to a scan of the whole table and the claim says so. Until those strata exist
Orange claims neither: a lookup
in an Orange specification says which value results, never how a machine
would find it.

## Testing finds; it does not prove

Statistical timing tools such as `dudect` run code on real hardware and look
for input-dependent timing. They can find leaks that the formal model in use
does not capture, which makes them valuable. But the absence of a detected signal is
not evidence of absence. A clean timing run is recorded as a test result about
a named corpus, method, and machine. It does not become a noninterference proof
because it came back clean, and it does not cover a different target.

Cryptanalysts will recognize the asymmetry. A distinguisher that succeeds is a
result. A distinguisher that fails is, at most, a data point about that
distinguisher.

## Where things stand

The leakage baseline is [D-012](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-012--baseline-leakage-claim),
marked **investigate**. Its acceptance evidence includes a formal trace
semantics, a target instruction-classification process, positive and negative
examples, and a preservation plan through final bytes. The initial target
envelope is [D-011](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-011--initial-native-target-envelope),
**proposed** as x86-64 Linux and AArch64 Linux, possibly only one of them if
solo capacity requires it.

The current compiler has no secrecy labels, no leakage semantics, no target
model, and no code generation. It therefore makes no constant-time claim of any
kind, and any such claim is outside its support envelope, which the claim model
would record as `unsupported`. Its language can now state a lookup keyed by
data, and so by a secret, and it neither rejects such a lookup nor claims
anything about how one would run. What exists is the commitment that when Orange
does say something about leakage, it will say which observer, which layer,
which target, and which evidence, and it will say nothing more.

