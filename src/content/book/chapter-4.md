---
title: "Chapter 4: From Surface Text to Meaning"
part: "Part II: Meaning and Trust"
order: 4
description: "The path from source bytes through syntax and meaning to the Typed Reference Core."
---

Source code is text before it is anything else, and text is easy to
misunderstand. The characters on the screen are not the bytes in the file, the
bytes are not the tokens, the tokens are not the program's structure, and the
structure is not its meaning. A compiler for high-assurance cryptography has to
keep each of those steps explicit, because each one is a place where two tools,
or two readers, can disagree about what was written.

This chapter follows one small Orange program from bytes to value. Everything
in the walk-through is **current**: it describes what the `orangec` compiler in
this repository does today, under the normative
[lexical and grammar specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LANGUAGE_2026.md), the accepted
[typed-literal semantics](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SEMANTICS_2026.md), and the
[pure expression specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/EXPRESSIONS_2026.md) now in the owner's
review. The last part of the chapter
turns to what the complete semantic Core is meant to become, which remains
open.

## Bytes with an identity

An Orange 2026 source must be valid UTF-8 and at most 16 MiB. Before any
lexing, the compiler gives the source an identity and treats every later
position as a half-open byte range `[start, end)` into that source. Line and
column numbers are computed for people, with one-based columns counted in
Unicode scalar values, but the permanent coordinates are bytes.

That choice is small and deliberate. Byte spans are unambiguous across editors,
operating systems, and normalization forms. A line feed, a carriage-return line
feed, and a bare carriage return each count as exactly one logical line ending,
so a file edited on two systems does not report two different line numbers for
the same error. Only four characters are whitespace: tab, line feed, carriage
return, and space. A non-breaking space is an error, not an invisible
separator. A reviewer who sees two identical-looking programs should not have
to wonder whether one contains a character that changes where a token ends.

## Tokens

Lexing turns bytes into a deterministic sequence of tokens, each carrying its
exact span. `orangec lex` prints that sequence:

```text
78..85   KW_EDITION   "edition"
86..90   INTEGER      "2026"
90..91   SEMICOLON    ";"
92..98   KW_MODULE    "module"
99..103  IDENTIFIER   "demo"
```

The Orange 2026 lexer recognizes ASCII identifiers, seven reserved words,
decimal, binary, and hexadecimal integers with single underscores between
digits, line-bounded strings with a fixed escape set, hex strings of digit
pairs, nested block comments, and a fixed inventory of punctuation, matched
longest first so that `<<<` is one rotation token rather than a shift and a
comparison. It reserves more than the grammar uses: several punctuation
tokens have no grammatical role yet, and strings had none until the byte
slice made them arrays of bytes. Reservation is a promise about spelling,
not about meaning.

The lexer is also bounded. It retains at most 262,144 non-trivia tokens and
emits at most 100 ordinary diagnostics before one suppression diagnostic. A
lexically invalid source is never parsed. That rule keeps error reports honest:
a malformed integer should produce a lexical diagnostic, not a cascade of
confusing parse errors downstream of a token that should never have existed.

## Structure

Parsing checks that the tokens have one of a small number of shapes. The
parser reads them in order and never backtracks: one token of lookahead decides
almost everything, and a second is consulted only in a few places, such as
telling a call from a name and a literal's sign from negation. The one longer
look is at `if` before `(`, `-`, `[`, the word `as`, or the word `with`
followed by `[`, where the parser scans ahead, without
backtracking, to see whether a brace group followed by `else` makes it a
conditional. A source is exactly one edition
declaration, `edition 2026;`, followed by exactly one module. A module begins
with its `use` declarations, each naming one module it uses, then its `type`
declarations, each naming one type, and then contains `spec` and `impl`
declarations. An `impl` has an empty parameter list and an
empty body. A `spec` body may be empty, or the `spec` may declare parameters
and a result type and contain `let` bindings and then exactly one expression.
A loop's step and each branch of a conditional have the same shape: bindings,
if any, and then a value. A binding or a loop's accumulator names one value or,
with a tuple pattern, each element of a tuple.

Parsing produces a syntax tree that records spelling and source structure
only. It is easy to overlook what that excludes. The grammar accepts any
identifier as a type, any integer as a width, and any expression as a
modulus, so `spec x() -> Word[12] { 1 }`, `spec y() -> Banana { 7 }`, and
`spec z() -> Mod[q] { 0 }` all parse. The parser also accepts two
declarations with the same name, because deciding whether names collide is not
a syntactic question. Parse success means only that the source has a recorded
shape. It is not validation, and the specification forbids describing it as
such.

## Meaning

Semantic analysis is where the program first acquires meaning, and in the
current slices that meaning is intentionally small. The analyzer works through
the syntax tree in source order and does five things:

1. It checks that every declaration key is unique, where a key is the pair of
   declaration kind and exact name. `spec mix` and `impl mix` are different
   keys; two `spec mix` declarations are a duplicate.
2. It resolves each typed specification's signature. The scalar types are
   `Int` and `Bool`, with no width; `Word[8]`, `Word[16]`, `Word[32]`, and
   `Word[64]`, with the width written as a plain decimal token; and `Mod[m]`,
   a constant modulus, or one that a sized function computes from its own
   sizes. `T^n` is an array of any of them, and a name
   declared by `type` stands for its type. `Word[08]`, `Word[0x8]`,
   `Word[12]`, `Int[8]`, and every other form are errors. Parameter names must
   be distinct within one function.
3. It checks each body against its declared result type, from the root of the
   expression down. Every expression has an expected type and nothing is
   inferred: a literal takes the type expected of it and must fit, a name must
   be a parameter of that type, a call must name a typed `spec` whose result is
   that type, and an operator must be defined on it. Literals are decoded
   exactly, in base 2, 10, or 16. An index is the one expression whose type
   comes from what it contains: it is checked as the word type of its first
   name, call, conversion, or element, or as an `Int` when that is not a
   word, and it must be proved to select an element.
4. It checks that the call graph is acyclic, so that every accepted program
   terminates.
5. If no semantic diagnostic occurred, it constructs the Typed Reference Core.

A program of several modules is analyzed one module at a time. Before any
module is checked, the analyzer examines the uses: each must name a module of
the program, and no module may use itself, use another twice, or be reached
again along a cycle of uses. It then checks each module once, after every
module it uses, against the declarations of those modules only. A call
`sha256::compress(h, m)` is resolved in the module `sha256` and then checked
like any other call, and because uses have no cycle, the call graph of the
whole program is acyclic when each module's own is.

Within a module, types come before functions. The analyzer first evaluates
every modulus that uses no size name, once each and in source order: those
in `type` declarations, then those in each typed spec's finite
type-parameter lists, parameters, result, bindings, and body. Such a
modulus is built from integer literals with `+`, `-`, `*`, `<<`, and
parentheses, and must lie from 2 through 2^521 − 1. A test's moduli are
resolved only where its body is checked. A sized function may use that
same vocabulary and its own size names. A modulus that uses a function's
finite size names is evaluated again in each concrete instance, and that
instance is checked with the exact modulus those sizes give, still from 2
through 2^521 − 1. It then resolves the `type` declarations in source
order, each against the names declared before it, and only then the
signatures. A declared name is another spelling of its type, so a module
that writes `F` and one that writes `Mod[(1 << 255) - 19]` mean the same
thing, and the name stays in its module.

The types are where the language's character first shows. `Int` is the
type of mathematical integers. It has no maximum and does not overflow. The
analyzer does limit the size of a literal's magnitude to 16,384 significant
bits, but that limit is a boundary on source representation, not a secret width
for `Int`. `Word[8]` is the type of eight-bit machine words, with values from
0 through 255, and the wider words follow the same rule at their own widths. A
negative word literal is an error even when it is `-0`, and 256 is an error
rather than zero:

```text
error[ORC0207]: literal is outside the range of `Word[8]`
 --> compiler/fixtures/s3a/invalid-word-range.or:5:31
  |
5 |   spec decimal() -> Word[8] { 256 }
  |                               ^^^ expected a value from 0 through 255
  = note: fixed-width words do not truncate or wrap out-of-range integers
```

No literal wraps, truncates, saturates, or coerces, and no value ever changes
type. Every mature cryptographic codebase has at least one bug that came from
an integer silently changing its width or sign. Orange's first semantic rule is
that such changes are never silent.

Arithmetic on words is the one place where values do wrap, and there wrapping
is the meaning rather than an accident. `Word[32]` is not a bounded integer
that overflows; it is the ring of integers modulo 2^32, the structure SHA-256
and ChaCha20 are written over. `a + b` on words is addition in that ring, `~a`
is the complement, and `a <<< 7` is the rotation: the word operations of
FIPS 180-4 and RFC 8439, defined the way those documents define them. `Int` has the operators that make sense
for mathematical integers, `+`, `-`, `*`, and negation, with their exact
meaning. The bitwise operators are not defined on `Int`, and using one is an
error rather than a guess about representation.

`Mod[m]` generalizes the word types to any modulus a standard names.
`Mod[(1 << 255) - 19]` is the field of X25519 and `Mod[3329]` the ring of
ML-KEM. Its values are the least residues 0 through m − 1, its `+`, `-`, and
`*` reduce by themselves, and its `/` multiplies by an inverse and gives 0
when there is none. It has no order and no bits, because a residue's order
and bits are those of a chosen representative, and a program that means the
least residue says so with `as`.

## The Typed Reference Core

A successful analysis produces one Typed Reference Core module. Its grammar is
short enough to quote whole:

```text
core_module    = module_name core_function* ;
core_function  = function_id function_name parameter_type* core_type body ;
core_type      = Int | Word8 | Word16 | Word32 | Word64 ;
body           = core_node+ ;
core_node      = core_type node_kind ;
node_kind      = literal value
               | parameter index
               | call function_id argument_count
               | unary (negate | complement)
               | binary (add | subtract | multiply | and | or | xor)
               | shift (shl | shr | rotl | rotr) amount ;
```

Only typed specifications enter the Core. Empty `spec` and `impl` declarations
remain valid syntax but gain no type, value, or execution meaning, and they do
not appear. Functions keep source order and receive contiguous identifiers from
zero. The Core of a program of several modules lists the functions of the
modules used first and the root's last, each recording its module, with
identifiers contiguous across the whole program. A literal written `-0x2a` becomes the mathematical integer −42, and every
spelling of negative zero becomes zero. A body is stored in postorder, each
node after its operands and each call after its arguments, and every node
carries its type. Parentheses leave no trace, because grouping is already the
shape of the tree. A residue type records its modulus exactly, and a `type`
declaration leaves no trace either: every declared name is replaced by the
type it names. A loop records the bindings of its step, and a conditional
those of its branches, each with the point in the step's or branch's
postorder where its value ends, so the evaluator knows when a name takes its
value. A tuple pattern is one binding of a tuple type, and a read of one of
its names reads the whole and selects the element, so tuples add only two
nodes to the Core: one that builds a tuple and one that selects from it. A
byte string is an array literal like any other, and the byte slice adds three
nodes: one joins two arrays, one takes a run of elements, and one replaces a
run, the last two with their bounds as `Int` operands. Each instance of a
sized function is one Core function that records its sizes, and a size's
name in an expression is an `Int` literal, so sizes add no node at all. A
conversion in a byte order is one node that records its operand's type and
its order. Each instance of a function with type parameters is likewise one
Core function that records its types, each as its position in its list, and
every type in its body is concrete, so type parameters add no node either.

The Core is bounded in the same spirit as the lexer and parser: at most
262,144 Core nodes, 1,048,576 semantic events, and 100 ordinary semantic
diagnostics. Exhausting a budget fails closed with a stable resource
diagnostic. There is no partial Core. An error in one declaration does not
authorize the others; the analyzer may keep going to report more errors, but
the result is unsuccessful.

Evaluation is the last step. `orangec eval` visits each of the root module's
Core functions in order and prints one line for each function without
parameters, decimal for `Int`
and residues, which print as their least residues, and fixed-width lowercase
hexadecimal for words, from two digits for `Word[8]`
to sixteen for `Word[64]`:

```text
demo::answer: Int = 42
demo::negative: Int = -42
demo::mask: Word[8] = 0xff
```

That output format is precise down to its bytes, including the absence of a
plus sign and the leading zero in `0x0a`. The precision is not decoration. A
reference evaluator is useful only if another implementation can be compared
against it byte for byte.

Evaluation is bounded too. Every function of one program shares a budget of
1,048,576 steps, the call stack holds at most 256 frames, and no `Int` result
may exceed 16,384 significant bits. An acyclic program can still ask for an
exponential amount of work, a function that calls another twice, twenty levels
deep; the step budget is what stops it, with a diagnostic rather than a hang.
The reader chooses a larger budget, up to 1,073,741,824 steps, with
`orangec eval --steps`, and a program's steps are the same wherever it runs,
so `--stats` reports them as exactly as the values.

## What the Core is not

The Typed Reference Core is an internal compiler boundary. It has no canonical
encoding, serialization, content digest, theorem fingerprint, proof identity,
refinement relation, or promise that identifiers stay stable across
revisions. It is noncanonical on purpose. Freezing an encoding before the
semantic strata are decided would make a proof-bearing choice by accident,
which is exactly the kind of hidden decision the project forbids.

The **proposed** end state is a family of canonical Cores: a Spec Core for pure
mathematics, an Impl Core for stateful procedures with contracts and typed
failure, a Game Core for probabilistic experiments, and a Proof IR checked by
a small authoritative checker. A canonical Core would have a deterministic
encoding, so that two tools, or two revisions, can agree on exactly which
definition a theorem is about. The
[architecture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARCHITECTURE.md#4-core-semantic-family) describes those
proposals in detail; [D-004](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DECISIONS.md#d-004--semantic-strata) decides their
number and relationships.

## The next steps of meaning

The twenty-one current slices complete bounded parts of the roadmap's S3 stage:
literals first, then pure expressions with parameters, calls, and operators
over integers and words, then `let` bindings and explicit conversions, then
fixed-length arrays, then loops over literal ranges with indices proved in
range, then truth values, comparisons, Euclidean division, and conditionals,
then indices keyed by data, proved in range from their types, then programs
of several modules, each checked once, after the modules it uses, then the
integers modulo a constant, with names for types, then `let` bindings inside
a loop's step and a branch, then tuples, so that a loop carries several
values, then byte strings, joins, and slices at bounds proved in range,
then size parameters, so that one function serves every length in a range
and is checked once for each, then byte orders, so that words are read from
bytes and written back in the order a standard names, then type parameters,
so that one function serves a list of fields or word widths and is checked
once for each, then arrays of up to 65,536 elements, so that a standard's long
vectors are written whole, then known-answer tests and equality of whole
arrays and tuples, so that a standard's examples are claims inside the
program, then shift and rotation amounts computed from data, each with the
value the arithmetic gives, then arrays of scalar rows, so that a state is a
table whose axes are checked separately, then modulus expressions over a
function's own finite sizes, each instance checked with its exact residue
domain, then arrays of three and four dimensions and update paths, so that a
matrix of polynomials is one type and a state is updated one index per
dimension.
The rest of S3 adds the remaining substance of a language: records with named
fields, functions generic over any modulus rather than a listed few, and
explicit failure
semantics,
together with one conformance case per normative rule. Each addition follows the same
pattern as the slices before it: a normative rule, a diagnostic for
every way to break it, a bound on the work it can cause, and a reference result
that can be printed and compared.

Meaning is where Orange's promises start to cost something. A lexer can be
made deterministic with care. A semantics has to be right about arithmetic,
about failure, and about what a name refers to, and every later proof inherits
whatever it gets wrong. That is why the first semantic slice is small, and why
each later slice is meant to be small enough to state completely.

