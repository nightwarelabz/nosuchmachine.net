---
title: "Chapter 12: The Corpus as Acceptance Test"
part: "Part IV: Cryptography in Practice"
order: 12
description: "Why real cryptographic algorithms and their known answers belong in the acceptance process from the beginning."
---

Every new language ships with examples. They are usually chosen to flatter it:
short programs that show off the syntax, avoid the awkward corners, and run
quickly. Orange intends something more demanding. Its first-party cryptography
packages are not examples. They are the acceptance test for the entire
toolchain.

The [project charter](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/PROJECT_CHARTER.md#8-product-principles) puts it as a
principle: *the standard library proves the product*. The flagship corpus is not
a marketing sample. It is the end-to-end acceptance suite for expressiveness,
proof ergonomics, generated code, interoperability, documentation, and
maintenance. If Orange cannot express, prove, compile, and ship real
cryptography with a complete claim matrix, then it has not succeeded, however
elegant its smaller programs look.

## Why real algorithms, early

It is tempting to postpone real cryptography until the compiler is finished.
Orange's architecture argues the opposite: the corpus is developed with the
compiler, not after it. Real algorithms surface requirements that toy programs
never do. SHA-256 forces precise word semantics and streaming state. AES-GCM
forces a decision about table lookups in a constant-time profile, because the
classic table-driven AES is a textbook cache-timing leak. ML-KEM forces
rejection sampling, polynomial arithmetic, and a careful account of which
failures may be observable. A language designed without those pressures tends
to discover them late, when changing the design is expensive.

The same reasoning explains the no-disposable-prototype rule of
[Chapter 7](/book/chapter-7/). Early algorithms become
permanent conformance fixtures. They are not throwaway demonstrations that a
later compiler must re-earn.

## A corpus chosen for coverage

The proposed corpus is chosen for the capabilities each family exercises, not
for breadth or popularity. The
[assurance model's corpus plan](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#6-flagship-corpus-plan) pairs each
family with its architectural purpose:

| Family | What it exercises |
| --- | --- |
| SHA-256 and SHA-512 | Bit and word semantics, streaming state, vectors |
| ChaCha20-Poly1305 | Add-rotate-xor code, field arithmetic, AEAD API and failure behavior |
| AES-GCM | Hardware intrinsics, forbidden tables in a constant-time profile, dispatch |
| HKDF and HMAC | Generic modules and composition |
| X25519 and Ed25519 | Finite fields, encodings, scalar handling |
| ML-KEM | Polynomials, matrices, rejection and failure behavior, post-quantum standards |
| ML-DSA or SLH-DSA | Larger state, performance pressure, randomized signatures |

Read as a curriculum, the list is deliberate. SHA-2 is where the language first
meets fixed-width words and the rotations and additions of a compression
function. ChaCha20 adds the add-rotate-xor style that is beautiful precisely
because it is so regular, and Poly1305 adds arithmetic modulo a prime. AES-GCM
brings the first real pressure from hardware: an implementation that uses AES
and carry-less multiplication instructions must coexist with a portable one,
behind a dispatcher that is itself proved. The curve families bring field
arithmetic and canonical encodings, where many historical bugs lived. ML-KEM
and the signature family bring post-quantum standards whose errata are still
recent.

[D-015](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-015--flagship-10-corpus) records this as a **proposed
set**. Exact membership is decided before the S7 stage admits the corpus.

## What admission requires

A corpus package is admitted only with a complete record. The
[package-admission rules](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ASSURANCE.md#54-cryptography-package-admission) list
what every stable algorithm, construction, and profile needs:

- the exact normative publication, edition, errata snapshot, and source digest;
- clause-to-definition traceability and an honest transcription-review status;
- intellectual-property and transition or deprecation status;
- the mathematical specification and implementation-refinement evidence;
- a statement that separates implementation correctness from assumed hardness
  and game-based theorems;
- known-answer and intermediate-value vectors where available;
- negative, malformed, boundary, overlap, cross-endian, and
  authentication-failure cases;
- differential tests against mature implementations;
- adversarial corpora such as Wycheproof where applicable;
- source and target leakage evidence for every promised profile; and
- approved budgets for performance, memory, stack use, and proof replay.

The fifth item is easy to skip past and important not to. Proving that an
implementation of ML-KEM computes exactly what FIPS 203 specifies says nothing
about whether ML-KEM is secure. Security rests on hardness assumptions and on
game-based arguments that live in a different stratum and a different claim
family. A package report shows them separately, so that no reader mistakes a
refinement proof for a security proof.

## Failure is part of the algorithm

The corpus plan names failure behavior explicitly, and for good reason. How a
routine fails is often where its security lives. An AEAD decryption must
reject a forged tag without releasing plaintext and without revealing, through
timing, how much of the tag matched. ML-KEM goes further: under FIPS 203,
decapsulation of a correctly sized but invalid ciphertext does not return an
error at all. It
uses implicit rejection, returning a pseudorandom shared secret derived from a
secret value and the ciphertext, so that an attacker probing with invalid
ciphertexts learns nothing from the shape of the response.

A language that treats failure as an afterthought cannot express that
faithfully. Orange's corpus will force the question early: which failures are
observable, to whom, and under which leakage policy. The answer has to appear
in the specification, the implementation, the foreign contract, and the claims,
and it has to agree across all four.

## The scope rule

A solo project cannot build everything, and the corpus plan says what gives way
first. D-015's scope rule is short: under-resourcing removes a family or a
target rather than removing the proof, leakage, binary, interoperability, or
response gates while retaining the claim.

In other words, Orange may ship fewer algorithms, or support fewer processors,
but it may not ship the same algorithms with weaker evidence under the same
words. A smaller corpus with complete claims is a success. A larger corpus with
hollow claims is a failure that looks like a success, which is worse.

## Cryptanalysts as readers

The corpus has one more audience. Cryptanalysts read implementations looking
for the gap between what the standard says and what the code does: a missing
check, an unexpected branch, a buffer that holds a secret longer than it
should. Orange's corpus is meant to be pleasant for them to read. The
specification sits beside the implementation, the claims say exactly what was
proved and under which model, the assumptions are listed, and the evidence can
be replayed. A reviewer who finds a flaw should be able to say precisely which
claim it invalidates, and the system should be able to say which artifacts
depend on that claim.

## A first fixture, sketched

The smallest real piece of the corpus is probably the ChaCha20 quarter round
from RFC 8439, section 2.1. It operates on four 32-bit words:

```text
a += b; d ^= a; d <<<= 16;
c += d; b ^= c; b <<<= 12;
a += b; d ^= a; d <<<= 8;
c += d; b ^= c; b <<<= 7;
```

Here `+=` is addition modulo 2^32, `^=` is exclusive or, and `<<<=` is a left
rotation. Section 2.1.1 of the RFC gives a test vector: starting from
`a = 0x11111111`, `b = 0x01020304`, `c = 0x9b8d6f43`, and `d = 0x01234567`,
the quarter round produces `a = 0xea2a92f4`, `b = 0xcb1cf8ce`,
`c = 0x4581472e`, and `d = 0x5881c4bb`.

The compiler can already express those twelve operations, and with the
binding slice it names them the way the RFC does. The binding slice had no
arrays, so its fixture computes each output word in its own function. The
first reads:

```orange
spec quarter_a(a: Word[32], b: Word[32], c: Word[32], d: Word[32]) -> Word[32] {
  let a1: Word[32] = a + b;
  let d1: Word[32] = (d ^ a1) <<< 16;
  let c1: Word[32] = c + d1;
  let b1: Word[32] = (b ^ c1) <<< 12;
  a1 + b1
}
```

Three more functions finish the round, four more apply it to the RFC's input
words, and `orangec eval` prints the RFC's output words exactly:

```text
chacha20::a: Word[32] = 0xea2a92f4
chacha20::b: Word[32] = 0xcb1cf8ce
chacha20::c: Word[32] = 0x4581472e
chacha20::d: Word[32] = 0x5881c4bb
```

That fixture tests the compiler. As a corpus fixture, the same twelve
operations would become an Orange specification transcribed from that clause,
with its provenance recorded. The vector would be imported with its source and
interpretation and evaluated against the specification by the reference
evaluator, not only against a fast implementation. And the fixture would stay in the conformance suite for as
long as the language exists. It would be a tiny claim, a conformance result for
one function on one vector, and it would be exactly as large as its evidence.

## Where things stand

No corpus package exists. The expression slice gave Orange the operations
SHA-2 and ChaCha20 are built from: addition modulo a word size, rotation,
shifts, exclusive or, and the other bitwise operations. The compiler's
fixtures already evaluate the SHA-256 round functions, round 0 of the "abc"
example, and the ChaCha20 quarter round against published values, and the
binding slice added named steps and the conversions that byte order needs. The
array slice then gave Orange a state. The quarter round now returns all four
words as one `Word[32]^4`, and the whole ChaCha20 block function, the core of
the cipher, evaluates to the serialized block RFC 8439 publishes. The loop
slice let the rounds be written the way the standards write them. SHA-256 now
hashes both NIST examples to their published digests, sixty-four rounds and a
sixty-four-word schedule per block, and ChaCha20 encrypts the 114-byte sample
of RFC 8439 to its published ciphertext. The condition slice added a
remainder, a truth value, and a choice, which is what prime-field arithmetic
needs. X25519 now computes the first test vector of RFC 7748 with a
255-rung Montgomery ladder over the integers modulo 2^255 − 19, Poly1305
reproduces the tag of RFC 8439 section 2.5.2, and ChaCha20-Poly1305 seals the
section 2.8.2 message to its published ciphertext and tag. The lookup slice
let a byte select from a table. AES-128 now derives its S-box as FIPS 197
defines it and encrypts the examples of Appendices B and C.1 to their published
ciphertexts, and a table-driven CRC-32 reproduces its check value. The module
slice let each standard be written once and used by name: SHA-256, HMAC, and
HKDF are three modules, and a program that uses them reproduces the
HMAC-SHA-256 test cases of RFC 4231 and the first test case of RFC 5869. HMAC
is not yet generic over its hash, as the corpus plan asks. The modular slice
put each field in a type: X25519 and Poly1305 are now written over
`Mod[(1 << 255) - 19]` and `Mod[(1 << 130) - 5]` with no reduction in sight
and reproduce the same vectors, and the constants of ML-KEM, Ed25519, and
P-256 are computed in the rings their standards define. The block slice let
each round name its values where it runs: SHA-256's rounds name a through h,
T1, and T2, and X25519's ladder names every value RFC 7748 names, inside one
loop each. The tuple slice let each round carry its state by name: SHA-256's
loop carries a through h, ChaCha20's quarter round gives four words as RFC
8439 writes it, and Ascon-Hash256's state is five named words; all three
reproduce their published values. The byte slice let each input be written
as its standard prints it: HMAC-SHA-256 is keyed with "Jefe" and twenty bytes
0b, as RFC 4231 prints its test cases, and ChaCha20-Poly1305 seals RFC 8439's
sentence, written as text, into the RFC's ciphertext and tag. The size
slice let each algorithm be written once for every length in a range:
SHA-256 pads its own messages of 1 through 119 bytes, HMAC-SHA-256 takes any
key of 1 through 63 bytes and message of 1 through 55, and Poly1305 any
message of 1 through 255 bytes, and all three reproduce their published
values. The byte-order slice let each algorithm read and write its words in
the order its standard names, in one conversion each: SHA-256 and SHA-512
read their blocks as big-endian words and write their digests as big-endian
bytes, ChaCha20 and Poly1305 read their keys, nonces, and blocks as
little-endian words and numbers, and X25519 decodes and encodes its
coordinates as little-endian numbers, and all five reproduce their published
values. The type-parameter slice let each computation be written once for
every type it serves: exponentiation, Fermat inversion, and Euler's
criterion once for five prime fields, which reproduce RFC 8032's square root
of −1 and the roots of unity of FIPS 203 and FIPS 204, and Ch, Maj, and the
round once for SHA-256 and SHA-512, which reproduce FIPS 180-4's digests.
The length slice let a standard's long vectors be written whole: RFC 8439's
375-byte text and ciphertext and its 265-byte AEAD ciphertext, each as the
RFC prints it, reproduced byte for byte, and it leaves room for the 768-byte
ciphertexts and 2,420-byte signatures of the post-quantum standards.
The test slice moved known answers into the programs themselves: RFC 8439's
quarter round, block function, zero-key key stream, and Poly1305 examples
are stated as tests beside the functions they check, titled with their
sections, and `orangec test` fails when one stops holding.
The amount slice let rotations by data be written as their designers write
them: RC6 encrypts and decrypts its paper's vectors, SHA3-256 computes its
rotation offsets and round constants as FIPS 202 defines them, and ML-KEM's
transform constants are derived by reversing bits.
The nested-array slice let a state be a table of rows: the first two
quadratic factors of FIPS 203 are multiplied as pairs, each axis checked on
its own, and the products match the hand-derived answers.
The static-modulus slice let one `spec` serve every modulus in a finite size
range: addition, reduction, and inversion are written once, and each instance
keeps its own residue domain.
The dimension slice let a standard draw its state on every axis it has:
AES-128's state is the 4 × 4 array FIPS 197 draws and reproduces Appendix
A.1 and Appendices B and C.1, SHA3-256 indexes its lanes as FIPS 202 does,
and ML-KEM-512's NTT runs over a matrix of polynomials.
These are still fixtures, not corpus entries. A message's length is
fixed in each instance rather than read when the program runs, and no
standard has been admitted with its provenance. The corpus remains a set of research inputs
rather than promises.

The acceptance test will run for the first time when a complete primitive can
be written in the specification stratum, admitted with its provenance, and
evaluated against its official vectors. That will be the corpus's first line.

