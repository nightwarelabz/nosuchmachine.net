---
title: "Chapter 10: The Foreign Boundary"
part: "Part III: Building the Language"
order: 10
description: "Foreign interfaces, contracts, imported assumptions, and secrets crossing language boundaries."
---

Most cryptographic code is ultimately called by code that is not
cryptographic. A key
exchange is called by a TLS stack; a signature routine is called by a package
manager; a hash is called by a database, a file system, or a browser. The
caller is ordinary software, written in C, Rust, Go, Python, or something else,
by people who have never seen the proofs behind the routine and should not have
to.

That makes the foreign interface the place where assurance is most often lost.
A proof that a routine is memory-safe assumes its buffers are as long as the
proof says. A proof that it is correct assumes its inputs do not overlap its
outputs, or does not, and the difference matters. A constant-time argument
assumes that the caller has not copied the secret somewhere the routine cannot
see. None of those assumptions is visible in a C prototype such as
`int encrypt(unsigned char *out, const unsigned char *in, size_t len)`. The
declaration says what types flow across the boundary. It says almost nothing
about what must be true of them.

This chapter describes Orange's **proposed** answer. The foreign boundary is
[D-013](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-013--stable-foreign-boundary), and nothing in it is
implemented.

## A header is not a contract

A C header is a remarkably thin description of a function. It gives the
number and types of arguments, the return type, and sometimes a comment. It
does not state that `out` must have room for `len` bytes, whether `out` may
equal `in`, whether either may be null when `len` is zero, what alignment is
required, which error values are possible and what the output buffer contains
after an error, whether the function allocates, whether it may panic or abort,
whether it reads thread-local state or a global random-number generator, and
whether it leaves secret material behind in memory it does not own.

Every one of those questions has a correct answer for a particular routine, and
every one is a place where an integrator can go wrong. Mature libraries answer
them in documentation. Orange's proposal is to answer them in a machine-readable
contract that is generated from the same definition as the code, checked
against the implementation, and carried in the evidence.

## The proposed contract

The [architecture's foreign-interface section](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#13-foreign-interface)
lists what the stable integration boundary would state for every export:

- exact scalar and aggregate layout;
- buffer lengths, alignment, overlap, mutability, and initialization;
- typed error and failure behavior;
- no hidden allocator, exception, panic, thread-local state, or random-number
  generator;
- a stable symbol and version policy;
- explicit zeroization and ownership-transfer rules; and
- target-feature and dispatcher requirements.

The boundary itself is a generated C ABI, because C is the lingua franca that
every other language can call. Rust wrappers sit above it and enforce whatever
Rust's type system can represent: lengths tied to slices, exclusive borrows
where overlap is forbidden, and typed errors instead of integer codes. Whatever
the wrapper cannot express, it checks at run time. Bindings for other languages
would sit on the same C contract.

The single most important property is that the header, the wrapper, the
contract, and the object all derive from one definition. Hand-maintained
headers are a quiet source of disagreement between what a library does and
what its users believe it does. Generating them removes the disagreement at
its source.

Consider authenticated decryption. Its most dangerous question is what the
output buffer holds when the tag does not verify. A routine that decrypts in
place before checking the tag can leave unauthenticated plaintext in the
caller's memory, and a caller that ignores the error code will use it. A
contract would state the answer, for example that the output is left unwritten
or is overwritten before the error is returned, and the adversarial callers
described later in this chapter would check that the implementation keeps the
promise.

## Imports are assumptions

The boundary runs in both directions. Sometimes Orange code must call out: to
an operating-system entropy source, to a platform's secure-memory facility, or
to an existing library that nobody is going to rewrite. The proposal is simple
and strict. Every foreign import names its ABI, preconditions, effects, alias
rules, failure behavior, and any claims it is assumed to satisfy. Until those
claims are separately proved, the import is an assumption, and the assumption is
attached to every dependent claim.

That rule changes how a claim report reads. A routine that is proved correct
except for one imported call does not report "proved." It reports its claim
together with the named assumption about that call, and a reader can decide
whether that assumption is acceptable in their setting. The trust budget of
[Chapter 15](/book/chapter-15/) is where those
assumptions accumulate and become visible.

## Secrets across the line

The foreign boundary is also where secrecy leaves Orange's type system. Inside
a claim-bearing kernel, the compiler can track which values are secret and
where they flow. Outside, the caller holds the key in whatever memory it
chooses. The proposed contract therefore records which arguments carry secret
material, what the routine guarantees about erasing its own copies, and what it
cannot guarantee about the caller's. An erasure claim covers architecturally
modeled storage that the routine controls. It never promises that the caller's
buffers, swap space, or crash dumps are clean.

The claim model gives these properties a home. An `abi` claim asks whether the
object and its wrapper satisfy a named calling, layout, alias, and error
contract. An `erases` claim asks whether named secret storage is overwritten
under a stated machine model. Both are separate from functional correctness and
from leakage, and each can be satisfied, not satisfied, unresolved, or
unsupported on its own.

## Testing the boundary as an adversary would

A contract is only as good as the evidence that the implementation honors it.
D-013's acceptance evidence calls for an ABI model and adversarial callers for
each supported target tuple. In practice that means callers written to break
the rules: for example, callers that pass short buffers, overlapping buffers,
misaligned pointers, null pointers with zero lengths, or maximal lengths. Each
such case should either be rejected in the way the contract says or be shown to
fall outside what the contract promises, never silently accepted.

## Primitives are not protocols

One more boundary deserves mention because it is so easy to blur. A primitive
standard defines mathematics and core algorithms. A deployment profile defines
bytes on the wire: identifiers, encodings, negotiation, error handling, and
state. The [research analysis](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RESEARCH.md#410-primitive-correctness-is-not-protocol-interoperability)
uses post-quantum key encapsulation as the example. FIPS 203 defines ML-KEM;
RFC 9935 specifies its use and key encodings in X.509; RFC 9936 specifies CMS
integration and warns about compatibility boundaries with pre-standard Kyber.

A proof about ML-KEM's arithmetic does not imply correct object identifiers,
correct ASN.1 encoding, correct TLS negotiation, or a correct host API. In
Orange's proposal, those are separately specified and separately proved
serialization and adapter modules, each with its own claims. The boundary
between a primitive and its protocol profile is a foreign boundary of a
different kind, and it receives the same treatment.

## Where things stand

Orange has no foreign interface today. It emits no objects, generates no
headers or wrappers, and makes no ABI or erasure claim. The current `orangec`
command line is a boundary of a humbler kind: it reads UTF-8 source, bounds its
input and output, and reports failures through stable codes and exit statuses.
That discipline, small as it is, is the same one the foreign boundary will
need. Every input is hostile until checked, every limit is explicit, and every
failure is reported rather than absorbed.

