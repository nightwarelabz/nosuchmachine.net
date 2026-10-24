---
title: "Chapter 8: Orange 2026: The Smallest Honest Slice"
part: "Part III: Building the Language"
order: 8
description: "The current Orange 2026 grammar, semantic slices, executable examples, and explicit capability limits."
---

Every language has a first edition that is embarrassingly small. Orange's is
smaller than most, and it is small on purpose. This chapter is a guided tour of
Orange 2026 as it exists: every construct it accepts, every value it can
compute, and the precise places where it stops. It is **current** throughout,
and every example in it was run against the compiler in this repository. The
normative sources are the [lexical and grammar specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LANGUAGE_2026.md),
the accepted [typed-literal semantics](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SEMANTICS_2026.md) of S3a, the
[pure expression specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/EXPRESSIONS_2026.md) of S3b, the
[bindings and conversions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BINDINGS_2026.md) of S3c, the
[arrays specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARRAYS_2026.md) of S3d, the
[loops specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LOOPS_2026.md) of S3e, the
[conditions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/CONDITIONS_2026.md) of S3f, the
[lookups specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LOOKUPS_2026.md) of S3g, the
[modules specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/MODULES_2026.md) of S3h, the
[modular arithmetic specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/MODULAR_2026.md) of S3i, the
[blocks specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BLOCKS_2026.md) of S3j, the
[tuples specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TUPLES_2026.md) of S3k, the
[bytes specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BYTES_2026.md) of S3l, the
[sizes specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SIZES_2026.md) of S3m, the
[byte order specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ORDER_2026.md) of S3n, the
[type parameters specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TYPE_PARAMETERS_2026.md) of S3o, the
[lengths specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LENGTHS_2026.md) of S3p, the
[tests specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TESTS_2026.md) of S3q, and the
[computed amounts specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/AMOUNTS_2026.md) of S3r, the
[nested arrays specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/NESTED_ARRAYS_2026.md) of S3s, the
[static moduli specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/STATIC_MODULI_2026.md) of S3t, and the
[array dimensions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DIMENSIONS_2026.md) of S3u. S3b through
S3u are implemented and tested, but their specifications are **proposed**:
[OEP-0005](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0005-orange-2026-pure-spec-expressions.md),
[OEP-0006](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0006-orange-2026-bindings-and-conversions.md),
[OEP-0007](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0007-orange-2026-fixed-length-arrays.md),
[OEP-0008](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0008-orange-2026-bounded-loops.md),
[OEP-0009](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0009-orange-2026-conditions.md),
[OEP-0010](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0010-orange-2026-lookups.md),
[OEP-0011](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0011-orange-2026-modules.md),
[OEP-0012](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0012-orange-2026-modular-arithmetic.md),
[OEP-0013](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0013-orange-2026-blocks.md),
[OEP-0014](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0014-orange-2026-tuples.md),
[OEP-0015](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0015-orange-2026-bytes.md),
[OEP-0016](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0016-orange-2026-sizes.md),
[OEP-0017](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0017-orange-2026-byte-order.md),
[OEP-0018](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0018-orange-2026-type-parameters.md),
[OEP-0019](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0019-orange-2026-lengths.md),
[OEP-0020](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0020-orange-2026-tests.md),
[OEP-0021](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0021-orange-2026-computed-amounts.md),
[OEP-0023](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0023-orange-2026-nested-arrays.md),
[OEP-0024](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0024-orange-2026-static-moduli.md), and
[OEP-0025](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0025-orange-2026-array-dimensions.md) are in
the owner's review and have not been accepted. Where this chapter and
those documents disagree, they win.

The edition name matters. `2026` is not a version number that will be bumped
with every release. It names a language edition, in the same sense that Rust
editions do: a named interpretation of source text. During pre-alpha it
carries no stability promise and has already been extended in place, but every
change must say whether it extends 2026 or introduces a new edition and must
give an explicit source migration boundary, so meaning never changes silently.
Every Orange source begins by saying which edition it is written in, and today
exactly one exists.

## A complete program

Here is a program that touches most of what Orange 2026 accepts:

```orange
// A tour of Orange 2026.
edition 2026;
module tour {
  spec identity() {}
  impl rounds() {}

  spec answer() -> Int { 42 }
  spec negative() -> Int { -0x2a }
  spec mask() -> Word[8] { 0xff }

  spec square(n: Int) -> Int { n * n }
  spec two_to_the_64() -> Int { square(square(square(square(square(square(2)))))) }
  spec wraps() -> Word[64] { 0xffff_ffff_ffff_ffff + 1 }
  spec high_nibble() -> Word[8] { ~0x0f & mask() }
  spec rotated() -> Word[16] { 0x8001 <<< 4 }
}
```

Running `orangec check` on it prints nothing and exits with status 0. Running
`orangec eval` prints one line for each typed specification without
parameters, in source order:

```text
tour::answer: Int = 42
tour::negative: Int = -42
tour::mask: Word[8] = 0xff
tour::two_to_the_64: Int = 18446744073709551616
tour::wraps: Word[64] = 0x0000000000000000
tour::high_nibble: Word[8] = 0xf0
tour::rotated: Word[16] = 0x0018
```

The empty `identity` and `rounds` declarations are valid and print nothing:
they have no type, value, or execution meaning. `square` has a parameter, so it
prints nothing either; it runs only when another function calls it.
`two_to_the_64` shows that `Int` is not a machine integer: six nested squarings
of 2 reach 2^64 exactly, with nothing lost. `wraps` shows the other discipline.
`Word[64]` is the ring of integers modulo 2^64, and adding one to its largest
element gives zero, because that is what addition in the ring means.

## The lexical layer

Orange 2026 source is UTF-8, at most 16 MiB. Whitespace is exactly tab, line
feed, carriage return, and space. Comments come in two forms, `//` to the end
of the line and `/* ... */`, and block comments nest, so commenting out a
region that already contains a comment works as a reader expects.

Identifiers are ASCII: a letter or underscore followed by letters, digits, and
underscores. Seven words are reserved:

```text
edition  module  spec  impl  game  proof  claim
```

The first four have grammatical roles. `game`, `proof`, and `claim` are
reserved so that future editions can give them meaning without breaking
programs that used them as names; today they cannot be used at all.

Integer tokens are decimal, binary with `0b`, or hexadecimal with `0x`. A
single underscore may separate two digits, which keeps long constants
readable: `0x6a09_e667` rather than `0x6a09e667`. Leading, trailing, or doubled underscores are errors.

The expression slice gives grammatical roles to `,`, `:`, `+`, `-`, `*`, `&`,
`|`, `^`, and `~`, and adds four tokens of its own, `<<`, `>>`, `<<<`, and
`>>>`, matched longest first, so `<<<<` is `<<<` followed by `<`. The
condition slice gives roles to `==`, `!=`, `<`, `<=`, `>`, `>=`, `&&`, `||`,
`!`, `/`, and `%`, which the lexer has always produced. The byte slice gives
strings their role, as byte strings, and adds two tokens, `++` and the hex
string `hex"..."`, whose `hex` touches its opening quote. The size,
byte-order, type-parameter, length, test, and amount slices add no token, and
the test slice reserves no word: `test` followed by a string begins a test only
where a module member may begin. The remaining punctuation is lexically reserved but has no
grammatical role yet.
`orangec lex` shows how any source
tokenizes, with exact byte spans.

## The grammar

The whole Orange 2026 grammar fits on a page:

```text
source_file     = edition_decl module_decl EOF ;
edition_decl    = "edition" "2026" ";" ;
module_decl     = "module" IDENTIFIER "{" use_decl* type_decl* member* "}" ;
member          = function_decl | test_decl ;
use_decl        = "use" IDENTIFIER ";" ;
type_decl       = "type" IDENTIFIER "=" declared_type ";" ;
function_decl   = "spec" IDENTIFIER "(" ")" spec_tail
                | "spec" IDENTIFIER size_params? "(" parameters? ")" typed_tail
                | "impl" IDENTIFIER "(" ")" empty_body ;
test_decl       = "test" STRING "{" binding* expression "}" ;
size_params     = "[" size_param ("," size_param)* "]" ;
size_param      = IDENTIFIER "in" (INTEGER ".." INTEGER | type_list) ;
type_list       = "{" declared_type ("," declared_type)* "}" ;
spec_tail       = empty_body | typed_tail ;
typed_tail      = "->" declared_type "{" binding* expression "}" ;
binding         = "let" pattern "=" expression ";" ;
pattern         = typed_name | "(" typed_name ("," typed_name)+ ","? ")" ;
typed_name      = IDENTIFIER ":" declared_type ;
empty_body      = "{" "}" ;
parameters      = parameter ("," parameter)* ","? ;
parameter       = IDENTIFIER ":" declared_type ;
declared_type   = element_type | tuple_type ;
tuple_type      = "(" element_type ("," element_type)+ ","? ")" ;
element_type    = parsed_type ("^" size)? ;
size            = INTEGER | IDENTIFIER | "(" expression ")" ;
parsed_type     = "Mod" "[" expression "]" | IDENTIFIER ("[" INTEGER "]")? ;

expression      = arithmetic | chain("&") | chain("|") | chain("^") | shift
                | comparison | chain("&&") | chain("||") | division
                | chain("++") | conversion | update ;
conversion      = prefixed "as" (parsed_type | tuple_type | order declared_type) ;
order           = "big" | "little" ;
update          = prefixed "with" update_target "=" expression ;
update_target   = "[" expression "]" path_index? path_index? path_index?
                | "[" range "]" ;
path_index      = "[" expression "]" ;
arithmetic      = product (("+" | "-") product)* ;
product         = prefixed ("*" prefixed)* ;
chain(op)       = prefixed (op prefixed)+ ;
shift           = prefixed shift_operator prefixed ;
shift_operator  = "<<" | ">>" | "<<<" | ">>>" ;
comparison      = prefixed compare_op prefixed ;
compare_op      = "==" | "!=" | "<" | "<=" | ">" | ">=" ;
division        = prefixed ("/" | "%") prefixed ;
prefixed        = literal | ("-" | "~" | "!") prefixed | primary ;
literal         = "-"? INTEGER ;
primary         = IDENTIFIER suffix? | call suffix? | "(" expression ")"
                | byte_string | tuple | array | fill | loop | conditional ;
byte_string     = STRING | HEX_STRING ;
suffix          = projection index* slice? | index+ slice? | slice ;
projection      = "." INTEGER ;
tuple           = "(" expression ("," expression)+ ","? ")" ;
index           = "[" INTEGER "]" | "[" expression "]" ;
slice           = "[" range "]" ;
range           = expression ".." expression? | ".." expression ;
array           = "[" expression ("," expression)* ","? "]" ;
fill            = "[" expression ";" size "]" ;
loop            = "for" IDENTIFIER "in" size ".." size
                  "with" pattern "=" expression block ;
conditional     = "if" expression block "else" (block | conditional) ;
block           = "{" binding* expression "}" ;
call            = (IDENTIFIER "::")? IDENTIFIER sizes? "(" arguments? ")" ;
sizes           = "[" expression ("," expression)* "]" ;
arguments       = expression ("," expression)* ","? ;
```

It has no implicit semicolons. The edition declaration must be first and
must spell `2026` exactly. `let`, `as`, `for`, `in`, and `with` are contextual
words: `let` starts a binding only at the start of a body, step, or branch
item and before a name or a tuple pattern, `as` converts only directly after a complete operand, `for` starts a loop
only before a name, `in` and `with` are words only inside a loop's header,
`in` also between a size's or a type parameter's name and its bounds or
list, and `with` updates only
directly after a complete operand and before `[`, which begins one through
four indices or one range. In the
same way, `if` starts a conditional only where a condition can follow it,
`else` is a word only after a conditional's value, `use` and `type` start
declarations only at the head of a module, before its first function, `Mod`
takes a modulus only before `[`, `hex` begins a hex string only directly
before a quote, `big` and `little` are byte orders only directly after `as`
and before `(` or a name other than `as` and `with`, and `true` and `false`
are values only where no name of that spelling is in scope. Anywhere else
they are
ordinary names, so no program that used them as names changed meaning when
they gained a role. After a declared type, `^` and a length make it an array
type; everywhere else `^` is exclusive or. One source holds one module, and a
program joins several sources through their `use` declarations. A name
qualified by its module, as in `sha256::initial()`, is always called. A
name followed by square brackets and then `(` is a call with sizes or types
when the brackets hold only integers, names, a name's `[n]`, `+`, `-`, `*`,
`/`, `%`, `^`, commas, and parentheses, as in `sha256[2](m)` or
`ch[Word[32]](e, f, g)`; any other brackets are an index or a slice, as
before. A typed `impl` is a syntax error, not a feature waiting to be switched
on, and a `spec` with parameters must declare a result type and a body. A `-`
written directly before an integer is that literal's sign, so the S3a body
`{ -42 }` is still one literal and means what it always meant.

## Grouping you can see

Most languages inherit a precedence table from C, and few programmers can
recite it. In C, `a + b ^ c` means `(a + b) ^ c` and `a & b == c` means
`a & (b == c)`, and cryptographic code is exactly where those rules bite.
Orange 2026 keeps only the precedence every reader already knows: prefix
operators bind first, and `*` binds more tightly than `+` and `-`. Beyond that,
operators fall into nine groups: arithmetic, `&`, `|`, `^`, the shifts and
rotations, the comparisons, `&&`, `||`, and division with remainder. Two
operators from different groups may not share a level without parentheses:

```text
error[ORC0108]: `^` follows `+` without grouping parentheses
 --> <stdin>:4:11
  |
4 |     a + b ^ b <<< 7
  |           ^ ungrouped operator
  = note: operators from different groups have no relative precedence in Orange; parenthesize the part that applies first
```

The rule costs a pair of parentheses and buys an expression that means what it
looks like. It also matches the standards. FIPS 180-4 writes the choice
function as `(x ∧ y) ⊕ (¬x ∧ z)`, with its grouping visible, and the Orange
transcription is `(x & y) ^ (~x & z)`, the same shape symbol for symbol. A
shift or rotation takes exactly two operands, and an amount written as a
literal must fit the width, so `x >>> 32` on a `Word[32]` is an error rather
than a question about what some processor does; an amount computed from data
has the value the arithmetic gives at every amount (see
[Amounts the data choose](/book/chapter-8/#amounts-the-data-choose)). A comparison also takes exactly two
operands, so `a < b < c` is an error whose note says to join two comparisons
with `&&` or `||`. Division is deliberately not grouped with multiplication:
with integer division, `(a * b) / c` and `a * (b / c)` differ, so `a * b / c`
must say which it means.

## The types

Six types, and one family of types, have meaning:

| Source form | Meaning | Values |
| --- | --- | --- |
| `Int` | Mathematical integers | Every integer, positive or negative |
| `Bool` | Truth values | `true` and `false` |
| `Word[8]` | The integers modulo 2^8 | 0 through 255 |
| `Word[16]` | The integers modulo 2^16 | 0 through 65,535 |
| `Word[32]` | The integers modulo 2^32 | 0 through 4,294,967,295 |
| `Word[64]` | The integers modulo 2^64 | 0 through 2^64 − 1 |
| `Mod[m]` | The integers modulo m, for each constant m from 2 through 2^521 − 1 | 0 through m − 1 |

The distinction is the seed of everything Orange will later say about
arithmetic. A specification over `Int` is mathematics and does not overflow. A
specification over a word type is about machine words, and its arithmetic is
modular by definition, the way the standards write it. A literal is different:
a value outside a word's range is an error rather than a wrapped value, because
a constant that does not fit is almost always a transcription mistake. No
value changes type implicitly, and nothing is inferred. `Word` with any width
other than the exact decimal tokens `8`, `16`, `32`, and `64` is rejected, and
so is `Int` with a width. `Bool`, added by the condition slice, is the type of
comparisons and conditions, and it is not a number: no arithmetic applies to
it, and nothing converts to or from it. `Mod[m]`, added by the modular slice,
is one type for each modulus, and
[Fields as types](/book/chapter-8/#fields-as-types) describes it. `type F = Mod[7];` gives a
type a second name, never a new type.

## Naming steps and changing types

Standards are written as sequences of named steps, and they move values
between bytes, words, and integers constantly. The S3c slice gives Orange
both. A typed body may begin with `let` bindings, each with a name, a stated
type, and a value, and each ended by a semicolon; the last expression is still
the body's result. Here is the ChaCha20 quarter round of RFC 8439, as far as
its first output word:

```orange
spec quarter_a(a: Word[32], b: Word[32], c: Word[32], d: Word[32]) -> Word[32] {
  let a1: Word[32] = a + b;
  let d1: Word[32] = (d ^ a1) <<< 16;
  let c1: Word[32] = c + d1;
  let b1: Word[32] = (b ^ c1) <<< 12;
  a1 + b1
}
```

Where the RFC updates `a` in place, the Orange text writes `a1` and then `a2`.
A binding never shadows a parameter or another binding, so every name in a
body refers to exactly one thing, and a name is in scope only after its own
semicolon. Each binding is evaluated once, in order, before the result. The
same form opens a loop's step or a branch, as
[Rounds in the words of their standard](/book/chapter-8/#rounds-in-the-words-of-their-standard)
shows. The stated type is not decoration. It is the one fact a reader checking a
transcription most needs, so Orange does not infer it.

A conversion, written `e as T`, is the only way a value changes type, and its
meaning is one rule: take the operand's integer value and, for `Word[n]`, its
residue modulo 2^n. Widening keeps a value, narrowing keeps the low bits, and
an `Int` holding -1 becomes `0xff` as a `Word[8]`. That single rule, with
shifts, is enough to build a word from its bytes:

```orange
spec load_le32(b0: Word[8], b1: Word[8], b2: Word[8], b3: Word[8]) -> Word[32] {
  (b0 as Word[32]) | ((b1 as Word[32]) << 8) | ((b2 as Word[32]) << 16)
    | ((b3 as Word[32]) << 24)
}
```

Applied to the bytes `00 01 02 03`, it gives `0x03020100`, the first ChaCha20
key word of RFC 8439 section 2.3.2. The same function with its arguments
reversed reads SHA-256's big-endian message words. Since the S3n slice, the
body is one conversion, `[b0, b1, b2, b3] as little Word[32]`, as
[Words in either byte order](/book/chapter-8/#words-in-either-byte-order) shows.

A conversion applies to exactly one operand and forms a group of its own, under
the grouping rule above. `x + y as Word[32]` is `ORC0108`, because its two
readings differ: for bytes `x` and `y`, `(x + y) as Word[32]` adds modulo 2^8
and then widens, while `(x as Word[32]) + (y as Word[32])` adds modulo 2^32.
The parentheses say which one the standard means.

## A state as one value

A cipher does not work on loose words. It works on a state: ChaCha20 on
sixteen 32-bit words laid out as a 4 by 4 matrix, SHA-256 on eight working
variables and a sixteen-word message block. The S3d slice lets a specification
hold such a state as one value. `Word[32]^16` is sixteen 32-bit words, written
the way the mathematics writes (Z/2^32 Z)^16. An array literal lists every
element, and an index selects one. With both, the quarter round returns all
four of its words, and the double round of RFC 8439 section 2.3 reads as the
RFC describes it, four column rounds and then four diagonal rounds:

```orange
spec quarter_round(a: Word[32], b: Word[32], c: Word[32], d: Word[32]) -> Word[32]^4 {
  let a1: Word[32] = a + b;
  let d1: Word[32] = (d ^ a1) <<< 16;
  let c1: Word[32] = c + d1;
  let b1: Word[32] = (b ^ c1) <<< 12;
  let a2: Word[32] = a1 + b1;
  let d2: Word[32] = (d1 ^ a2) <<< 8;
  let c2: Word[32] = c1 + d2;
  let b2: Word[32] = (b1 ^ c2) <<< 7;
  [a2, b2, c2, d2]
}

spec double_round(x: Word[32]^16) -> Word[32]^16 {
  let q0: Word[32]^4 = quarter_round(x[0], x[4], x[8], x[12]);
  let q1: Word[32]^4 = quarter_round(x[1], x[5], x[9], x[13]);
  let q2: Word[32]^4 = quarter_round(x[2], x[6], x[10], x[14]);
  let q3: Word[32]^4 = quarter_round(x[3], x[7], x[11], x[15]);
  let d0: Word[32]^4 = quarter_round(q0[0], q1[1], q2[2], q3[3]);
  let d1: Word[32]^4 = quarter_round(q1[0], q2[1], q3[2], q0[3]);
  let d2: Word[32]^4 = quarter_round(q2[0], q3[1], q0[2], q1[3]);
  let d3: Word[32]^4 = quarter_round(q3[0], q0[1], q1[2], q2[3]);
  [
    d0[0], d1[0], d2[0], d3[0],
    d3[1], d0[1], d1[1], d2[1],
    d2[2], d3[2], d0[2], d1[2],
    d1[3], d2[3], d3[3], d0[3],
  ]
}
```

The last literal is the one place the text asks for care: it puts each
diagonal round's four words back where the state keeps them, and a reader can
check every position against the RFC's matrix. The
[ChaCha20 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3d/valid-chacha20-block.or) adds the
rest of the block function, the constants, the key and nonce read as
little-endian words, ten double rounds, and the final addition, and
`orangec eval` prints the serialized block of section 2.3.2 word for word:

```text
chacha20::test_vector: Word[32]^16 = [0xe4e7f110, 0x15593bd1, 0x1fdd0f50, 0xc47120a3, 0xc7f4d1c7, 0x0368c033, 0x9aaa2204, 0x4e6cd4c3, 0x466482d2, 0x09aa9f07, 0x05d7c214, 0xa2028bd9, 0xd19c12b5, 0xb94e16de, 0xe883d0cb, 0x4e3c50a2]
```

Three rules keep arrays as plain as the words inside them. Every length is
written: a type states it, from 1 through 65,536 (256 until S3p), and a
literal lists exactly that many elements. Every position is visible: in the array slice an index is a
literal, checked against the length before anything runs, so there is no
out-of-range read at run time:

```text
error[ORC0223]: index `16` is out of range for `Word[32]^16`
 --> <stdin>:4:7
  |
4 |     x[16]
  |       ^^ indices run from 0 through 15
  = note: a literal index must be less than the array's length
```

And operators act on elements: `x ^ y` on two arrays is `ORC0215`, so an
operator always means one ring operation on one pair of values. Empty arrays
are rejected. Arrays of ranks two through four, and an update that names one
index per dimension, are in [Arrays of rows](/book/chapter-8/#arrays-of-rows) and
[Four dimensions, one index each](/book/chapter-8/#four-dimensions-one-index-each). With
arrays alone, the fixture's ten double rounds are ten bindings, one after
another. The next section removes that repetition.

## Rounds as one expression

A standard says how many times. FIPS 180-4 prepares the SHA-256 message
schedule "for t = 16 to 63" and then applies sixty-four rounds; RFC 8439 runs
"10 iterations of the double round". The S3e slice, proposed in the
[loops specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LOOPS_2026.md), writes those sentences directly. A loop
names its index and its range, both given by literals, then an accumulator
with a stated type and a first value, then a step that gives the
accumulator's next value:

```orange
spec rounds(initial: Word[32]^16) -> Word[32]^16 {
  for i in 0..10 with s: Word[32]^16 = initial { double_round(s) }
}
```

Read it as "for i from 0 up to 10, with s starting at `initial`, replace s by
`double_round(s)`". Its value is s after the last step. Mathematically it is a
fold, s_(k+1) = f(k, s_k), over a range written in the text, so a reader knows
that the loop runs exactly ten times without running it. A loop always takes
at least one step, and its bounds satisfy 0 ≤ a < b ≤ 65536. There is no
`while`, no `break`, and no loop whose length depends on data. The index and
the accumulator are new names, visible only in the step, and like every other
name in Orange they never shadow one already in scope.

Two small forms make loops useful on a state. `w with [t] = v` is the array
`w` with the element at position `t` replaced by `v`; `w` itself is unchanged,
because arrays are values and nothing in Orange is mutated. `[0; 64]` is
sixty-four zeros. Together they write the SHA-256 message schedule of section
6.2.2 the way the standard prints it:

```orange
spec schedule(m: Word[32]^16) -> Word[32]^64 {
  let head: Word[32]^64 = for t in 0..16 with w: Word[32]^64 = [0; 64] { w with [t] = m[t] };
  for t in 16..64 with w: Word[32]^64 = head {
    w with [t] = small_sigma1(w[t - 2]) + w[t - 7] + small_sigma0(w[t - 15]) + w[t - 16]
  }
}
```

The indices `t - 2`, `t - 7`, `t - 15`, and `t - 16` are expressions, and this
is where Orange asks something of its checker. These use only integer
literals and the indices of enclosing loops, joined by `+`, `-`, and `*`. The
checker computes the least and the greatest value each index can take over its
loops' ranges and rejects the program unless every one selects an element. For
`w[t - 16]`, with t from 16 through 63, that range is 0 through 47, well inside
`Word[32]^64`. Written one position too far back, the error says exactly why:

```text
error[ORC0223]: this index runs from -1 through 46, out of range for `Word[32]^64`
 --> <stdin>:4:62
  |
4 | ... ith v: Word[32]^64 = w { v with [t] = w[t - 17] }
  |                                             ^^^^^^ indices run from 0 through 63
  = note: every value an index can take, over every loop index and word in it, must select an element
```

The check is deliberately simple. It bounds each side of an operator
separately, so `x[i - i]`, which is always 0, is rejected over a range of i
because its computed range reaches below 0. A rule that a reader can apply in
their head is worth more here than a cleverer one that only the compiler
understands.

The consequence matters to a cryptographer: no index is ever out of range
while a program runs, so evaluation has no failure to report and no hidden
check to trust. The price is that an index must have a bound the checker can
see. An `Int` parameter has none, so a lookup keyed by one is refused:

```text
error[ORC0226]: an `Int` index may use only integer literals, loop indices, and words converted with `as Int`
 --> <stdin>:4:10
  |
4 |     sbox[k]
  |          ^ this `Int` has no bound
  = note: every index is proved in range when the program is checked: a word index ranges over its type, and an `Int` index is built from integer literals, loop indices, and words converted with `as Int`, using `+`, `-`, `*`, `/`, `%`, and conditionals
```

A byte does have a bound, 0 through 255, and a lookup keyed by a byte is how
[Tables keyed by data](/book/chapter-8/#tables-keyed-by-data) writes AES.

With loops, a whole primitive fits in one short module. The
[SHA-256 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3e/valid-sha256.or) computes the
message schedule, runs the sixty-four rounds as
`for t in 0..64 with v: Word[32]^8 = h { round(v, k[t], w[t]) }`, adds the
result back into the hash value, and prints the digests FIPS 180-4 publishes
for "abc" and for the two-block message of the NIST examples:

```text
sha256::abc_digest: Word[32]^8 = [0xba7816bf, 0x8f01cfea, 0x414140de, 0x5dae2223, 0xb00361a3, 0x96177a9c, 0xb410ff61, 0xf20015ad]
sha256::long_digest: Word[32]^8 = [0x248d6a61, 0xd20638b8, 0xe5c02693, 0x0c3e6039, 0xa33ce459, 0x64ff2167, 0xf6ecedd4, 0x19db06c1]
```

The [ChaCha20 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3e/valid-chacha20.or) does the
same for RFC 8439. Loops load the key and the nonce as little-endian words, the
ten double rounds are one loop, and two nested loops serialize the state as
sixty-four bytes with `b with [4 * i + j] = le_bytes(s[i])[j]`, an index the
checker proves lies between 0 and 63. The encryption of the "sunscreen"
plaintext of section 2.4.2 then matches the RFC's 114-byte ciphertext, byte for
byte.

One seam still shows. The quarter round names its four positions literally. A
position passed as an `Int` has no bound, and one passed as a word must be
masked to the state's size, as in `s[a & 15]`, a mask the RFC does not print.
Positions known at every call, such as a quarter round over columns 0,
4, 8, and 12, are the natural next step.

## Choices and prime fields

Public-key cryptography lives in prime fields. RFC 7748 defines X25519 over
the integers modulo p = 2^255 − 19, and RFC 8439 defines Poly1305 over
p = 2^130 − 5. Their algorithms reduce "mod p" after every product, read one
bit of a secret scalar at a time, and swap two values when the bit is set. The
S3f slice, proposed in the [conditions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/CONDITIONS_2026.md),
adds exactly what those sentences need: a remainder, a truth value, and a
choice.

`Int` already holds any integer exactly, so a field element is an `Int` and
its reduction is `%`. Here is the step of Poly1305 section 2.5.1, which adds
a block to the accumulator, multiplies by r, and reduces:

```orange
spec absorb(a: Int, r: Int, block: Int) -> Int { ((a + block) * r) % prime() }
```

Division in Orange is Euclidean: `a % b` is never negative, whatever the signs
of a and b, so `a % p` is always the representative from 0 through p − 1 that
a cryptographer writes. `-7 % 2` is 1 in Orange; in C and Rust it is −1.
Division is also total. `x / 0` is 0 and `x % 0` is x, so no division fails,
and the identity a = b · (a / b) + a % b holds for every a and every b.

A comparison gives a value of the sixth type, `Bool`. Its values are `true`
and `false`, and its only operators are `!`, `&&`, `||`, `==`, and `!=`.
`true + 1` is an error, and so is `b as Int`; a number becomes a truth value
only through a comparison such as `x != 0`, and a truth value becomes a
number only through a choice. Integers compare by value, and words as the
unsigned numbers they denote. Whole arrays do not compare at all; a program
compares their elements, so that a reader sees what is compared.

A choice is a conditional, and it always has both branches:

```orange
spec sign(x: Int) -> Int { if x < 0 { -1 } else if x == 0 { 0 } else { 1 } }
```

Both branches have the conditional's type, and only the chosen one is
evaluated. An `if` without an `else` would have no value when its condition is
false, so Orange rejects it:

```text
error[ORC0101]: expected `else` and the value when the condition is false
 --> <stdin>:3:42
  |
3 | ...  spec pick(c: Bool) -> Int { if c { 1 } }
  |                                             ^ found RIGHT_BRACE
  = note: every `if` has an `else`, so that a conditional always has a value
```

A conditional is also the only way to skip work. `&&` and `||` always evaluate
both operands, so every choice a program makes is written where a reader can
see it.

The Montgomery ladder of RFC 7748 is 255 such choices. The fixture writes one
rung as the RFC's conditional swap around one step of the ladder, and the
ladder as a loop over the scalar's bits from 254 down to 0:

```orange
spec rung(x1: Int, s: Int^4, set: Bool) -> Int^4 {
  if set { swap(ladder(x1, swap(s))) } else { ladder(x1, s) }
}

spec x25519(scalar: Word[8]^32, u: Word[8]^32) -> Word[8]^32 {
  let k: Word[8]^32 = clamp(scalar);
  let masks: Word[8]^8 = [1, 2, 4, 8, 16, 32, 64, 128];
  let x1: Int = decode_u(u);
  let s: Int^4 = for i in 0..255 with s: Int^4 = [1, 0, x1, 1] {
    rung(x1, s, (k[(254 - i) / 8] & masks[(254 - i) % 8]) != 0)
  };
  encode((s[0] * power(s[1], prime() - 2)) % prime())
}
```

The indices divide a loop index, and the checker still proves them in range
before anything runs: `(254 - i) / 8` takes values from 0 through 31, and
`(254 - i) % 8` from 0 through 7. The proof follows Euclidean division
exactly, including its rule for zero, so an index such as `k[i % 0]` over
`0..8` has the range of `i` itself:

```text
error[ORC0223]: this index runs from 0 through 7, out of range for `Word[8]^4`
 --> <stdin>:4:47
  |
4 | ... r i in 0..8 with s: Word[8] = 0 { s ^ k[i % 0] }
  |                                             ^^^^^ indices run from 0 through 3
  = note: every value an index can take, over every loop index and word in it, must select an element
```

The [X25519 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3f/valid-x25519.or) computes the
first test vector of RFC 7748 section 5.2, byte for byte:

```text
x25519::test_vector: Word[8]^32 = [0xc3, 0xda, 0x55, 0x37, 0x9d, 0xe9, 0xc6, 0x90, 0x8e, 0x94, 0xea, 0x4d, 0xf2, 0x8d, 0x08, 0x4f, 0x32, 0xec, 0xcf, 0x03, 0x49, 0x1c, 0x71, 0xf7, 0x54, 0xb4, 0x07, 0x55, 0x77, 0xa2, 0x85, 0x52]
```

The [Poly1305 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3f/valid-poly1305.or)
reproduces the tag of RFC 8439 section 2.5.2, and the
[AEAD fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3f/valid-aead.or) seals the "sunscreen"
message of section 2.8.2 with ChaCha20-Poly1305: ChaCha20 with counter 0 makes
the one-time Poly1305 key, the plaintext is encrypted from counter 1, and
Poly1305 authenticates the additional data, the ciphertext, and both lengths.
The result matches the RFC's 114 bytes of ciphertext and its 16-byte tag.

Two seams show. The first is timing. A conditional is a choice between two
mathematical values, not a machine branch. RFC 7748 asks implementations to
swap in constant time, and the fixture's `if` says only which value results,
not how long a machine would take to decide. That question belongs to the
implementation stratum and to
[Chapter 6](/book/chapter-6/), where Orange means to
answer it with a claim rather than a keyword. The second is the field itself:
every `%` in these modules is written by hand. A type of integers modulo a
prime, whose arithmetic reduces on its own and whose values cannot leave the
field, was the natural next step, and [Fields as types](/book/chapter-8/#fields-as-types)
takes it.

## Tables keyed by data

Much of symmetric cryptography is written with tables. FIPS 197 defines AES's
SubBytes by the S-box, and each byte of the state selects one of its 256
entries. DES has eight S-boxes, Camellia, ARIA, and SM4 are specified with
tables, and the table-driven CRC reads one entry per input byte. The S3g slice,
proposed in the [lookups specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LOOKUPS_2026.md), lets an index depend
on data and keeps the rule that every index is proved in range before anything
runs. SubBytes is then one line:

```orange
spec sub_bytes(s: Word[8]^256, a: Word[8]^16) -> Word[8]^16 {
  for i in 0..16 with b: Word[8]^16 = a { b with [i] = s[a[i]] }
}
```

The proof is the index's type. An index whose first name, call, conversion, or
element is a word is checked as that word, and a word has a range: a byte runs
from 0 through 255, so `a[i]` may select from any table of 256 entries.
Operators narrow the range, each by one rule a reader can apply in their head.
For a byte x, `x & 15` and `x >> 4` each run from 0 through 15, so either may
index a table of 16, and `(x & 15) + 16` runs from 16 through 31. A remainder
stays below its divisor, a conversion from a narrower word keeps its range,
and a conditional takes the widest bounds of its values. `(x & 15) - 1` could
wrap, because `x & 15` may be 0, so like every operator that could wrap it
ranges over its whole type. When the range does not fit, the error names it:

```text
error[ORC0223]: this index runs from 1 through 16, out of range for `Word[8]^16`
 --> <stdin>:4:7
  |
4 |     t[(x & 15) + 1]
  |       ^^^^^^^^^^^^ indices run from 0 through 15
  = note: every value an index can take, over every loop index and word in it, must select an element
```

An `Int` index is still built from literals and loop indices, and it may now
also convert a word with `as Int` and choose with a conditional. That is how
the S-box itself is written. Section 5.1.1 of FIPS 197 defines it as the
multiplicative inverse in GF(2^8) followed by an affine map, and the inverse
of g^k, for a generator g, is g^(255 − k), read off tables of powers and
logarithms:

```orange
spec substitute(exp: Word[8]^256, log: Word[8]^256, a: Word[8]) -> Word[8] {
  let b: Word[8] = if a == 0 { 0 } else { exp[(255 - (log[a] as Int)) % 255] };
  b ^ (b <<< 1) ^ (b <<< 2) ^ (b <<< 3) ^ (b <<< 4) ^ 0x63
}
```

`log[a]` is a word index, and `(255 - (log[a] as Int)) % 255` is an `Int`
index that runs from 0 through 254. The
[AES-128 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3g/valid-aes128.or) builds the tables
themselves with updates keyed by data: `t with [exp[i]] = i as Word[8]` stores
each logarithm where its power points, and the inverse S-box is the S-box read
backwards, `t with [s[i]] = i as Word[8]`. It derives all 256 entries, checks
the example of section 5.1.1, where 0x53 becomes 0xed, encrypts the examples of
Appendices B and C.1 to their published ciphertexts, and decrypts C.1 back to
its plaintext:

```text
aes::example_substitution: Word[8] = 0xed
aes::example_c1: Word[8]^16 = [0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a]
aes::example_c1_inverse: Word[8]^16 = [0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff]
```

Tables built this way take many updates, and the loop slice charged one
evaluation step for every element an update copied. The lookup slice charges
one step per 64 elements, or part of 64: changing one entry of a 256-entry
table costs 4 steps rather than 256, and no update costs more than before.

Two seams show. The first is timing again, and it is the sharpest yet. A lookup
keyed by a secret byte is the pattern that made table-driven AES a textbook
cache-timing leak, and through S3f an Orange specification could not state one
at all. S3g states it, because it is what the standard states, and leaves the
question where [a lookup, two ways](/book/chapter-6/#a-lookup-two-ways) puts it: a
specification's lookup has no addresses, and whether compiled code may perform
it, must scan the whole table, or must be rejected is a decision for the
implementation and target strata. Meanwhile a reviewer can still find every
lookup, because every index not built from literals and loop indices is one.
The second seam is the range rule itself. It reads only the syntax of the
index, so `if x < 16 { t[x] } else { 0 }` is rejected for a table of 16 even
though it never selects outside it. The same choice is written `t[x & 15]`,
whose range a reader can see.

## Standards built on standards

Cryptographic standards are written in layers, and each cites the one beneath
it. RFC 2104 defines HMAC over any iterated hash function, RFC 5869 defines
HKDF over HMAC, and an AEAD is built from a cipher and an authenticator.
Through S3g an Orange program was one module, so every construction carried
its own copy of every primitive beneath it. The S3h slice, proposed in the
[modules specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/MODULES_2026.md), lets a module name the modules it
uses at its head and call their functions by module name:

```orange
module hkdf {
  use hmac;

  spec extract(salt: Word[8]^64, ikm: Word[8]^64, length: Int) -> Word[8]^32 {
    hmac::mac(salt, ikm, length)
  }
}
```

That is section 2.2 of RFC 5869, PRK = HMAC-Hash(salt, IKM), in one line, and
three rules keep its meaning plain. Nothing is imported into scope: `extract`
may call `hmac::mac`, but not `mac`, and not `sha256::compress`, which `hmac`
uses and `hkdf` does not. A call into another module always names it, and a
module declares every module it uses, so a reader sees where each function
comes from without searching, and two modules may each declare a function
named `block` without either noticing. A module means what it meant alone: it
is checked once, against the declarations of the modules it uses, and gives
the same Core whoever uses it. And the uses of a program form no cycle, so
every module is checked after the modules it uses, and the call graph stays
acyclic without any analysis across modules. A cycle is reported at the `use`
that closes it:

```text
error[ORC0230]: module cycle `ring_a` -> `ring_b` -> `ring_a`
 --> ring_b.or:4:3
  |
4 |   use ring_a;
  |   ^^^^^^^^^^^ this `use` closes the cycle
  = note: modules may not depend on each other in a cycle; move the functions they share into a module that both use
```

`orangec` finds a module by its name: `use hmac;` reads `hmac.or` from the
directory of the file that names it, or from the current directory when the
source comes from standard input. A module name is an ASCII identifier, so it
names one file in that directory and no path outside it, and each module is
read once, however many modules use it. That is a rule of the command line,
not of the language. A program is a root module and the modules it reaches
among those supplied with it, and another host may supply them another way.

The [module fixtures](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3h/valid-vectors.or) write SHA-256, HMAC, and HKDF
as three files. The program that uses them holds four modules, `hkdf` using
`hmac` and `hmac` using `sha256`, and `orangec eval` prints only the root's
values: the SHA-256 digest of "abc" from FIPS 180-4, test cases 1 and 2 of RFC
4231, and the pseudorandom key and output key material of RFC 5869's first
test case:

```text
vectors::prk: Word[8]^32 = [0x07, 0x77, 0x09, 0x36, 0x2c, 0x2e, 0x32, 0xdf, 0x0d, 0xdc, 0x3f, 0x0d, 0xc4, 0x7b, 0xba, 0x63, 0x90, 0xb6, 0xc7, 0x3b, 0xb5, 0x0f, 0x9c, 0x31, 0x22, 0xec, 0x84, 0x4a, 0xd7, 0xc2, 0xb3, 0xe5]
vectors::okm: Word[8]^42 = [0x3c, 0xb2, 0x5f, 0x25, 0xfa, 0xac, 0xd5, 0x7a, 0x90, 0x43, 0x4f, 0x64, 0xd0, 0x36, 0x2f, 0x2a, 0x2d, 0x2d, 0x0a, 0x90, 0xcf, 0x1a, 0x5a, 0x4c, 0x5d, 0xb0, 0x2d, 0x56, 0xec, 0xc4, 0xc5, 0xbf, 0x34, 0x00, 0x72, 0x08, 0xd5, 0xb8, 0x87, 0x18, 0x58, 0x65]
```

The seam this slice shows lies between a module and the file that holds it. A
file placed beside a program under a used module's name changes the
program's meaning exactly as editing the program would, and S3h pins nothing:
no digest, signature, or lock records which bytes a program's modules had. A
program is only as trustworthy as its directory until the evidence bundles of
[Chapter 14](/book/chapter-14/) record every module
by digest. The slice also stops short of generic modules. The `hmac` module is
HMAC-SHA-256, not HMAC over any hash, because a module cannot yet take another
module as a parameter.

## Fields as types

[Choices and prime fields](/book/chapter-8/#choices-and-prime-fields) ended on a seam: every
reduction in X25519 and Poly1305 was a `%` written by hand. RFC 7748 writes
`AA = A^2` and means the square in the field of 2^255 − 19 elements. A
transcription that multiplies and forgets to reduce is still a valid program,
merely a wrong one, and only a test vector notices. The S3i slice, proposed in
the [modular arithmetic specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/MODULAR_2026.md), puts the field in the
type. `Mod[m]` is the ring of integers modulo m, and a `type` declaration
names it once for the rest of its module:

```orange
module x25519 {
  // RFC 7748 section 4.1: the field of p = 2^255 - 19 elements.
  type F = Mod[(1 << 255) - 19];
  // [x_2, z_2, x_3, z_3].
  type Ladder = F^4;

  spec ladder(x1: F, s: Ladder) -> Ladder {
    let a: F = s[0] + s[1];
    let aa: F = a * a;
    let b: F = s[0] - s[1];
    let bb: F = b * b;
    let e: F = aa - bb;
    let c: F = s[2] + s[3];
    let d: F = s[2] - s[3];
    let da: F = d * a;
    let cb: F = c * b;
    [aa * bb, e * (aa + 121665 * e), (da + cb) * (da + cb), x1 * ((da - cb) * (da - cb))]
  }
}
```

Each line is the RFC's line. The values of `Mod[m]` are the least residues 0
through m − 1, and `+`, `-`, and `*` give the least residue of the exact
result, so no value leaves the field and no reduction can be forgotten. The
modulus is a constant, written as the standard writes it with integer
literals, `+`, `-`, `*`, `<<`, and parentheses, and two moduli are one type
exactly when they are equal, however they are written: `Mod[7]`,
`Mod[0b111]`, and `Mod[3 + 4]` are one type. A type is displayed the way its
standard names it: the field of X25519 is `Mod[(1 << 255) - 19]`, and a
modulus that is not within a small distance of a power of two, like P-256's,
is displayed in hexadecimal. A modulus may be as wide as 2^521 − 1, the prime
of P-521.

Division is where a field differs from the integers, and Orange keeps it
total. `x / y` multiplies x by the inverse of y when y has one and gives 0
when it has none. In a prime field only 0 has no inverse, so `x / 0` is 0,
which is exactly what the RFC's `x_2 * (z_2^(p - 2))` computes for a zero
denominator, and the fixture's ladder ends in `s[0] / s[1]`, as the RFC does.
Constants that the standards define by division are written the same way:

```orange
module fields {
  // FIPS 203: q = 3329.
  type Zq = Mod[3329];
  // RFC 8032 section 5.1: p = 2^255 - 19.
  type F = Mod[(1 << 255) - 19];

  // 17 is a primitive 256th root of unity modulo q, so 17^128 = -1.
  spec zeta_128() -> Zq { for i in 0..7 with z: Zq = 17 { z * z } }
  // The inverse NTT scales by 128^-1 modulo q.
  spec scale() -> Zq { 1 / 128 }
  // RFC 8032 section 5.1: d = -121665/121666.
  spec d() -> F { -121665 / 121666 }
}
```

```text
fields::zeta_128: Mod[3329] = 3328
fields::scale: Mod[3329] = 3303
fields::d: Mod[(1 << 255) - 19] = 37095705934669439343138083508754565189542113879843219016388785533085940283555
```

Literals follow the rule of the word types, adapted to a ring. A literal of
`Mod[m]` has a magnitude less than m, and `-n` stands for m − n, so `-1` is
the largest residue and `-121665` above is p − 121665. A literal is never
reduced: `7` is an error as a `Mod[7]`, as `256` is as a `Word[8]`, because a
constant that does not fit is almost always a transcription mistake.

Two moduli are two types, and nothing crosses between them silently:

```text
error[ORC0214]: `y` has type `Mod[11]`, but `Mod[7]` is required here
 --> <stdin>:3:53
  |
3 | ... (x: Mod[7], y: Mod[11]) -> Mod[7] { x + y }
  |                                             ^ expected `Mod[7]`
  = note: Orange has no implicit conversions between types
```

`as` is the only crossing. Into a ring, it takes the least residue of the
operand's integer value; out of one, it gives the least residue as an `Int`,
or that residue modulo 2^n as a word. So `t[x as Int]` looks a table up by a
residue, and the range rules of the lookup slice prove it in range: `x as Int`
for x of `Mod[7]` runs from 0 through 6. Residues have no order, no
remainder, and no bits. An order on a ring is a property of the
representatives one chooses, and the standards that compare field elements,
as RFC 8032 does when it checks that a scalar is less than L, compare those
representatives explicitly:

```text
error[ORC0215]: `<` is not defined for `Mod[(1 << 255) - 19]`
 --> <stdin>:4:37
  |
4 |   spec less(x: F, y: F) -> Bool { x < y }
  |                                     ^ the operands have type `Mod[(1 << 255) - 19]`
  = note: residues are compared with `==` and `!=`; they have no order, so compare least residues, such as `(x as Int) < (y as Int)`
```

The [modular fixtures](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3i/valid-x25519.or) write X25519 over `F` with
no `%` anywhere and reproduce the first test vector of RFC 7748 section 5.2,
keep [Poly1305](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3i/valid-poly1305.or)'s accumulator in `Mod[(1 << 130) - 5]` and reproduce the tag of
RFC 8439 section 2.5.2, and [compute constants in the rings their standards define](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3i/valid-fields.or):
the three above, Ed25519's square root of −1, and a check, made in
P-256's own field, that its generator lies on its curve:

```text
fields::p256_generator_on_curve: Bool = true
```

Two seams show. The first is that `Mod[m]` is a ring for every m, and nothing
checks that m is prime. For a composite modulus, dividing by a residue that
shares a factor with m gives 0: in `Mod[256]`, `1 / 2` is 0 and `1 / 3` is
171. A program over a composite modulus must expect that, and one that must
know can test `(y * (1 / y)) == 1`. The second is timing again. The reference
evaluator finds an inverse with the extended Euclidean algorithm, whose running
time depends on the value, and nothing here says how a field operation on a
secret is to be compiled; that belongs, like the conditional swap, to
[Chapter 6](/book/chapter-6/) and code generation.
The slice also stops short of generic fields: `ladder` is written for one `F`,
because, until S3t, a function could not take its modulus from a finite size
parameter, and even now it cannot take one at run time.

## Rounds in the words of their standard

A loop's step was one expression, and a standard's round is not. FIPS 180-4
section 6.2.2 writes a round of SHA-256 as a short list of named values: the
temporary words T1 and T2, and then the new working variables h through a.
RFC 7748 writes each step of the Montgomery ladder as nine named values, A,
AA, B, BB, E, C, D, DA, and CB, before the new coordinates. Through S3i, a
`let` could stand only at the start of a function's body, so those names had
to live in a helper function, apart from the loop that runs it. The
[SHA-256 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3e/valid-sha256.or) of
[Rounds as one expression](/book/chapter-8/#rounds-as-one-expression) calls a `round`
function with the state, the round's constant, and its message word, and reads
a through h as `v[0]` through `v[7]`; the ladder of
[Fields as types](/book/chapter-8/#fields-as-types) is three functions where the RFC writes
one loop.

The S3j slice, proposed in the [blocks specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BLOCKS_2026.md), lets a
loop's step and each branch of a conditional begin with `let` bindings,
exactly as a body does. The specification calls a step or a branch written
this way a block. The round then stands where it runs, in the standard's own
words:

```orange
spec compress(hash: Word[32]^8, m: Word[32]^16) -> Word[32]^8 {
  let w: Word[32]^64 = schedule(m);
  let k: Word[32]^64 = round_constants();
  let v: Word[32]^8 = for t in 0..64 with v: Word[32]^8 = hash {
    let a: Word[32] = v[0];
    let b: Word[32] = v[1];
    let c: Word[32] = v[2];
    let d: Word[32] = v[3];
    let e: Word[32] = v[4];
    let f: Word[32] = v[5];
    let g: Word[32] = v[6];
    let h: Word[32] = v[7];
    let t1: Word[32] = h + big_sigma1(e) + ch(e, f, g) + k[t] + w[t];
    let t2: Word[32] = big_sigma0(a) + maj(a, b, c);
    [t1 + t2, a, b, c, d + t1, e, f, g]
  };
  for i in 0..8 with out: Word[32]^8 = v { out with [i] = out[i] + hash[i] }
}
```

The last line of the step is the standard's step 3, read left to right: the
new a is T1 + T2, the new e is d + T1, and every other variable moves down one
place. A reviewer comparing this text with FIPS 180-4 compares names with
names. The [block fixtures](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3j/valid-sha256.or) hash the same two
messages to the same digests as before:

```text
sha256::abc_digest: Word[32]^8 = [0xba7816bf, 0x8f01cfea, 0x414140de, 0x5dae2223, 0xb00361a3, 0x96177a9c, 0xb410ff61, 0xf20015ad]
```

A step's bindings are evaluated afresh at every step, in order, each seeing
the ones before it, and then the step's value becomes the next accumulator.
Nothing a step binds survives into the next step; only the accumulator
carries. A branch's bindings are evaluated only when the branch is chosen, as
its value is, so a branch that is not chosen costs nothing, however much work
its bindings describe:

```orange
spec pick(c: Bool, x: Int) -> Int {
  if c { let t: Int = x + 1; t * t } else { x }
}
```

`pick(true, 6)` is 49 and `pick(false, 6)` is 6. A binding costs the steps of
its value each time its block runs, and one step each time it is read, so a
name costs what writing its value in place would cost, and less when the value
is read more than once.

Scope is where blocks keep Orange's promise that a name means one thing. A
block's binding is in scope from its own semicolon to the end of its block:
in the bindings after it, in the block's value, and in every loop and
conditional nested there, and nowhere else. Read outside, it is an error that
points at the binding it might have meant:

```text
error[ORC0211]: `t` is not in scope here
 --> <stdin>:4:47
  |
4 | ...  c { let t: Int = x + 1; t * t } else { t }
  |                                             ^ unknown name
 ::: <stdin>:4:16
  |
4 |     if c { let t: Int = x + 1; t * t } else { t }
  |                - a binding of this name is here
  = note: a binding of a loop's step or a branch is in scope only within that step or branch
```

A block still cannot shadow. A binding that repeats a parameter, a binding of
the body, a loop's index or accumulator, or a binding of an enclosing block
is rejected, and the error names what it would have hidden:

```text
error[ORC0219]: duplicate name `t`
 --> <stdin>:4:49
  |
4 | ... t in 0..64 with v: Word[32]^8 = h { let t: Word[32] = v[7]; v }
  |                                             ^ this name repeats a name in scope
 ::: <stdin>:4:9
  |
4 |     for t in 0..64 with v: Word[32]^8 = h { let t: Word[32] = v[7]; v }
  |         - the loop index is here
  = note: each parameter, binding, loop index, and accumulator in scope has its own name; Orange has no shadowing
```

Names whose scopes do not overlap may repeat. Two branches of one conditional
may each bind `t`, and so may two loops, one after the other. That is what
lets the [X25519 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3j/valid-x25519.or) write the
whole ladder as the RFC does, with the conditional swap and every one of the
RFC's names inside one loop, and still bind `x_2` and `z_2` again after it for
the last swap:

```orange
let ladder: Ladder = for i in 0..255 with s: Ladder = [1, 0, x_1, 1] {
  let k_t: Bool = (k[(254 - i) / 8] & masks[(254 - i) % 8]) != 0;
  // swap ^= k_t, where swap holds bit t + 1; clamping clears bit 255.
  let swap: Bool = k_t != ((k[(255 - i) / 8] & masks[(255 - i) % 8]) != 0);
  let x_2: F = if swap { s[2] } else { s[0] };
  let z_2: F = if swap { s[3] } else { s[1] };
  let x_3: F = if swap { s[0] } else { s[2] };
  let z_3: F = if swap { s[1] } else { s[3] };
  let A: F = x_2 + z_2;
  let AA: F = A * A;
  let B: F = x_2 - z_2;
  let BB: F = B * B;
  let E: F = AA - BB;
  let C: F = x_3 + z_3;
  let D: F = x_3 - z_3;
  let DA: F = D * A;
  let CB: F = C * B;
  [AA * BB, E * (AA + 121665 * E), (DA + CB) * (DA + CB), x_1 * ((DA - CB) * (DA - CB))]
};
```

It reproduces the first test vector of RFC 7748 section 5.2, as the fixtures
of the two earlier slices do. The RFC carries `swap` from one bit to the next
in a variable; a step cannot, so the step reads bit t + 1 of the scalar again,
which is the value the RFC's variable holds.

That is the seam this slice leaves. A loop carries exactly one accumulator,
so a round whose state is eight words keeps them in an array and names them
again at the top of every step, as `let a: Word[32] = v[0]` does above. The
next section closes it. A block is also not yet an expression of its own:
bindings stand only at the start of a body, a step, or a branch, where braces
already mark where their scope ends.

## Several values at once

Standards speak of several values at once. FIPS 180-4 carries eight working
variables, a through h, from one round of SHA-256 to the next and assigns all
eight at the end of every round. RFC 8439 defines the ChaCha20 quarter round
on four words, a, b, c, and d, and gives four words back. NIST SP 800-232
keeps the 320-bit state of Ascon as five 64-bit words. Through S3j, a function
gave one value and a loop carried one accumulator, so each of those states had
to become an array, and each round began by reading its words back out by
index.

The S3k slice, proposed in the [tuples specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TUPLES_2026.md), adds
tuples. A tuple type lists its element types in parentheses, as
`(Word[64], Bool)`; a tuple lists its values the same way; `p.0` selects the
first element of `p`; and a tuple pattern, written where a binding or a loop's
accumulator names its value, names every element at once. One limb of a
multi-precision addition gives its sum and its carry together:

```orange
type Limb = Word[64];
type Carried = (Limb, Limb);

spec add_carry(a: Limb, b: Limb, carry: Limb) -> Carried {
  let s: Limb = a + b;
  let t: Limb = s + carry;
  let out: Limb = if s < a { 1 } else { 0 };
  (t, if t < s { out + 1 } else { out })
}

spec add256(x: Limb^4, y: Limb^4) -> (Limb^4, Limb) {
  for i in 0..4 with (sum: Limb^4, carry: Limb) = ([0; 4], 0) {
    let (limb: Limb, out: Limb) = add_carry(x[i], y[i], carry);
    (sum with [i] = limb, out)
  }
}
```

The loop's accumulator is a pattern. It carries the sum and the carry by name
from one limb to the next, and each step gives the next pair. Adding one to
the largest 256-bit number wraps every limb to zero and carries one out, and
the evaluator prints the result as its type is written:

```text
tuples::wraps: (Word[64]^4, Word[64]) = ([0x0000000000000000, 0x0000000000000000, 0x0000000000000000, 0x0000000000000000], 0x0000000000000001)
```

With a pattern for its accumulator, the round of SHA-256 from the previous
section needs no array at all. The [tuple fixtures](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3k/valid-sha256.or)
carry a through h themselves:

```orange
let (a: Word[32], b: Word[32], c: Word[32], d: Word[32],
     e: Word[32], f: Word[32], g: Word[32], h: Word[32]) =
  for t in 0..64 with (a: Word[32], b: Word[32], c: Word[32], d: Word[32],
                       e: Word[32], f: Word[32], g: Word[32], h: Word[32]) =
    (hash[0], hash[1], hash[2], hash[3], hash[4], hash[5], hash[6], hash[7]) {
    let t1: Word[32] = h + big_sigma1(e) + ch(e, f, g) + k[t] + w[t];
    let t2: Word[32] = big_sigma0(a) + maj(a, b, c);
    (t1 + t2, a, b, c, d + t1, e, f, g)
  };
```

The loop's first value is the standard's step 2, which sets a through h to the
previous hash value; its step is step 3; and the line after it is step 4,
which adds each variable to its word of the hash, as `a + hash[0]`. The eight
names appear twice, and that is not shadowing. The loop's names are in scope
only in its step, and the body's names only after the binding's semicolon, so
the two scopes never meet. The digests of "abc" and of the two-block message
are the published ones, as they were.

The ChaCha20 quarter round becomes a function of four words that gives four:

```orange
type Quad = (Word[32], Word[32], Word[32], Word[32]);

spec quarter_round(a: Word[32], b: Word[32], c: Word[32], d: Word[32]) -> Quad {
  let a1: Word[32] = a + b;
  let d1: Word[32] = (d ^ a1) <<< 16;
  let c1: Word[32] = c + d1;
  let b1: Word[32] = (b ^ c1) <<< 12;
  let a2: Word[32] = a1 + b1;
  let d2: Word[32] = (d1 ^ a2) <<< 8;
  let c2: Word[32] = c1 + d2;
  let b2: Word[32] = (b1 ^ c2) <<< 7;
  (a2, b2, c2, d2)
}
```

The block function's loop carries the sixteen words of the state, s0 through
s15, as one pattern, and a double round is eight lines: the column round and
then the diagonal round, in the order of RFC 8439 section 2.3, each line naming
the words it takes and the words it gives:

```orange
let (c0: Word[32], c4: Word[32], c8: Word[32], c12: Word[32]) = quarter_round(s0, s4, s8, s12);
let (c1: Word[32], c5: Word[32], c9: Word[32], c13: Word[32]) = quarter_round(s1, s5, s9, s13);
let (c2: Word[32], c6: Word[32], c10: Word[32], c14: Word[32]) = quarter_round(s2, s6, s10, s14);
let (c3: Word[32], c7: Word[32], c11: Word[32], c15: Word[32]) = quarter_round(s3, s7, s11, s15);
let (d0: Word[32], d5: Word[32], d10: Word[32], d15: Word[32]) = quarter_round(c0, c5, c10, c15);
let (d1: Word[32], d6: Word[32], d11: Word[32], d12: Word[32]) = quarter_round(c1, c6, c11, c12);
let (d2: Word[32], d7: Word[32], d8: Word[32], d13: Word[32]) = quarter_round(c2, c7, c8, c13);
let (d3: Word[32], d4: Word[32], d9: Word[32], d14: Word[32]) = quarter_round(c3, c4, c9, c14);
```

A reader checks the diagonals against the RFC's list, 0, 5, 10, 15 and then
1, 6, 11, 12, by reading the names. The quarter round's test vector of section
2.1.1 comes out as the RFC prints it, and the block function reproduces
section 2.3.2:

```text
chacha20::quarter_round_vector: (Word[32], Word[32], Word[32], Word[32]) = (0xea2a92f4, 0xcb1cf8ce, 0x4581472e, 0x5881c4bb)
```

Ascon-Hash256 takes the same shape. Its state is a declared type of five
words, `type State = (Word[64], Word[64], Word[64], Word[64], Word[64]);`. A
round opens with a pattern, `let (x0: Word[64], x1: Word[64], x2: Word[64],
x3: Word[64], x4: Word[64]) = s;`, and names every word of its constant
addition, substitution, and linear layers before it gives the next state. The
sponge absorbs a block into the first word by rebuilding the state around it,
as `p12((s.0 ^ blocks[i], s.1, s.2, s.3, s.4))`. The digests of the empty
message, of the byte 00, and of the eight bytes 00 through 07 match entries 1,
2, and 9 of the designers' known-answer file.

The rules are few, and each keeps a tuple a value rather than a place. A tuple
has 2 through 16 elements, each `Int`, `Bool`, a word, a residue, or an array
of one of them, and neither a tuple nor an array ever holds a tuple. `.k`
follows a name or a call, and k is written in decimal, counted from zero. No
operator, order, conversion, index, or update applies to a whole tuple,
because each would have to choose a meaning, element by element or all at
once, that a cryptographer should see written out. Equality is the one
exception, since S3q: two tuples are equal when every element is, the only
meaning it could have (see
[Known answers beside the algorithm](/book/chapter-8/#known-answers-beside-the-algorithm)).
So the compiler points at the operator, and at a position that is not there:

```text
error[ORC0215]: `<` is not defined for `(Word[64], Word[64])`
 --> <stdin>:4:45
  |
4 | ... ec before(p: Pair, q: Pair) -> Bool { p < q }
  |                                             ^ the operands have type `(Word[64], Word[64])`
  = note: tuples are compared whole with `==` and `!=`; they have no order, so compare elements, such as `p.0 < q.0`
```

```text
error[ORC0223]: `(Word[64], Word[64])` has no element 2
 --> <stdin>:4:39
  |
4 |   spec third(p: Pair) -> Word[64] { p.2 }
  |                                       ^ its elements are numbered 0 through 1
  = note: a tuple's elements are counted from zero
```

A tuple costs what its elements cost and one step for each element, `.k` costs
one step beyond its base, and a name bound by a pattern costs two steps to
read: the read of the tuple and the selection from it. That is also how the
Core stays small. A pattern is one binding of a tuple type, and each of its
names is a read of that binding followed by a selection, so tuples add only
two kinds of node. A tuple is shared, not copied, where it is read more than
once, as an array is, and every source S3j accepted has the same Core, values,
and output under S3k, since it writes no tuple.

That leaves seams. A pattern names every element, with no wildcard for one it
does not need, and a step that changes one element of a tuple rebuilds the
whole, as Ascon's absorption does. Nothing yet takes a size or a modulus as a
parameter, so `add256` is written for four limbs rather than for n. The next
section closes a third seam: through S3k, arrays could not be joined or
sliced, and a message was written as a list of numbers rather than as the
bytes a standard prints.

## Bytes as the standards print them

Standards print their inputs as text and hex. RFC 4231 keys its second HMAC
test case with "Jefe" and authenticates "what do ya want for nothing?"; RFC
8439 seals a sentence about sunscreen under a key printed as 32 hex bytes. And
their algorithms move runs of bytes. FIPS 180-4 pads a message by appending
the byte 80, zeros, and the message's length, then reads each block's words
four bytes at a time; RFC 8439 takes the first 32 bytes of a block as a
one-time key. Through S3k, each of those inputs was a list of numbers typed
by hand, and each run of bytes was copied one element at a time by a loop.

The S3l slice, proposed in the [bytes specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BYTES_2026.md), writes
them as the standards do. A byte string `"..."` is the array `Word[8]^n` of
the ASCII codes of its characters; a hex string `hex"..."` is the array of its
hex digit pairs, spaced wherever the reader likes between bytes; `a ++ b`
joins two arrays of one element type; `x[a..b]` is the array of the elements
of `x` from index a up to, but not including, index b, with a bound left out
meaning the start or the end; and `x with [a..b] = v` is `x` with that run
replaced by `v`:

```orange
spec key() -> Word[8]^4 { "Jefe" }
spec nonce() -> Word[8]^12 { hex"07000000 40414243 44454647" }
spec iv() -> Word[8]^8 { nonce()[4..] }
spec padded() -> Word[8]^16 { "abc" ++ hex"80" ++ [0; 8] ++ hex"00 00 00 18" }
```

```text
bytes::key: Word[8]^4 = [0x4a, 0x65, 0x66, 0x65]
bytes::nonce: Word[8]^12 = [0x07, 0x00, 0x00, 0x00, 0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47]
bytes::iv: Word[8]^8 = [0x40, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47]
bytes::padded: Word[8]^16 = [0x61, 0x62, 0x63, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x18]
```

A byte string's length is part of its type, so `"Jefe"` is a `Word[8]^4` and
is an error where five bytes are required, exactly as an array literal of four
elements would be. Its characters are printable ASCII, space through tilde, so
that what a reader sees is exactly what the bytes are, and any other byte is
written with an escape, `\"`, `\\`, `\n`, `\r`, `\t`, `\0`, or `\xNN`, or in
hex. `hex` is not reserved: it begins a hex string only when a quote follows it
directly, and a parameter named `hex` keeps its meaning. `++` is an operator
group of its own, so it never shares a level with `+` or `^` without
parentheses.

The [HMAC fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3l/valid-hmac.or) pads its messages
as FIPS 180-4 section 5.1.1 says and reads the sixteen words of each block
through slices, so the schedule of section 6.2.2 is written over bytes:

```orange
spec schedule(block: Word[8]^64) -> Word[32]^64 {
  let head: Word[32]^64 = for t in 0..16 with w: Word[32]^64 = [0; 64] {
    w with [t] = word(block[4 * t..4 * t + 4])
  };
  for t in 16..64 with w: Word[32]^64 = head {
    w with [t] = small_sigma1(w[t - 2]) + w[t - 7] + small_sigma0(w[t - 15]) + w[t - 16]
  }
}
```

Here `word` is section 3.1's reading of four bytes, most significant first,
as one word. The digest goes the other way, and a slice update writes each
word of the hash as four bytes:

```orange
spec digest(hash: Word[32]^8) -> Word[8]^32 {
  for i in 0..8 with out: Word[8]^32 = [0; 32] {
    out with [4 * i..4 * i + 4] = [
      (hash[i] >> 24) as Word[8], (hash[i] >> 16) as Word[8],
      (hash[i] >> 8) as Word[8], hash[i] as Word[8],
    ]
  }
}
```

HMAC is then RFC 2104 with RFC 4231's inputs as that RFC prints them. The key
is padded with zeros to one block, exclusive-ored with the inner pad, and
joined to the text and to SHA-256's padding: the byte 80, 27 zeros, and the
length of the 92-byte inner message in bits, 0x2e0:

```orange
spec case2() -> Word[8]^32 {
  let k0: Word[8]^64 = "Jefe" ++ [0; 60];
  let text: Word[8]^28 = "what do ya want for nothing?";
  outer(k0, hash128(keyed(k0, 0x36) ++ text ++ hex"80" ++ [0; 27] ++ hex"00000000 000002e0"))
}
```

```text
hmac::case2: Word[8]^32 = [0x5b, 0xdc, 0xc1, 0x46, 0xbf, 0x60, 0x75, 0x4e, 0x6a, 0x04, 0x24, 0x26, 0x08, 0x95, 0x75, 0xc7, 0x5a, 0x00, 0x3f, 0x08, 0x9d, 0x27, 0x39, 0x83, 0x9d, 0xec, 0x58, 0xb9, 0x64, 0xec, 0x38, 0x43]
```

That is the MAC of RFC 4231 section 4.3, and the same fixture reproduces
test case 1 and FIPS 180-4's digest of "abc". The arithmetic of the padding
is still the writer's: each join's lengths must sum to the declared length,
and the analyzer says so, with both lengths, when they do not.

The [AEAD fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3l/valid-aead.or) writes
ChaCha20-Poly1305 as RFC 8439 section 2.8 does. Its plaintext is the
sentence of section 2.8.2, as text:

```orange
spec sunscreen() -> Word[8]^114 {
  "Ladies and Gentlemen of the class of '99: " ++
    "If I could offer you only one tip for the future, " ++
    "sunscreen would be it."
}
```

Poly1305 reads one message joined from the additional data padded with zeros
to sixteen bytes, the ciphertext padded the same way, and the two lengths, 12
and 114, as 64-bit little-endian numbers; the one-time key is the first 32
bytes of block 0, which is section 2.6's key generation read as a slice of a
call:

```orange
spec mac_data(aad: Word[8]^12, ciphertext: Word[8]^114) -> Word[8]^160 {
  aad ++ [0; 4] ++ ciphertext ++ [0; 14] ++ hex"0c00000000000000" ++ hex"7200000000000000"
}

spec seal(key: Word[8]^32, nonce: Word[8]^12, aad: Word[8]^12, plaintext: Word[8]^114)
  -> Word[8]^130 {
  let ciphertext: Word[8]^114 = encrypt(key, nonce, plaintext);
  ciphertext ++ mac(block(key, 0, nonce)[..32], mac_data(aad, ciphertext))
}
```

Poly1305 itself takes its sixteen-byte blocks as `m[16 * j..16 * j + 16]`,
and even its clamp is written as bytes:
`hex"ffffff0f fcffff0f fcffff0f fcffff0f"` is the mask
0ffffffc0ffffffc0ffffffc0fffffff of section 2.5 in little-endian order. The
sealed message ends in the RFC's tag, and the receiver's check, which
recomputes the tag and compares it byte by byte, accepts it:

```text
aead::tag: Word[8]^16 = [0x1a, 0xe1, 0x0b, 0x59, 0x4f, 0x09, 0xe2, 0x6a, 0x7e, 0x90, 0x2e, 0xcb, 0xd0, 0x60, 0x06, 0x91]
aead::verified: Bool = true
```

Here `tag` is `sealed()[114..]`, the last sixteen bytes.

A slice's position never depends on data. Its bounds are built from integer
literals and loop indices, with `+`, `-`, and `*` by a constant, and the
analyzer proves, before anything runs, that the distance between them is the
same positive number at every step, because that number is the slice's
length and so part of its type, and that every element the slice can take,
at every step, exists. A slice therefore needs no check when it runs, and the
compiler points at the part it cannot prove:

```orange
spec window(x: Word[8]^8, n: Int) -> Word[8]^4 { x[n..n + 4] }
spec words(x: Word[8]^8) -> Word[8]^4 {
  for i in 0..2 with w: Word[8]^4 = [0; 4] { x[4 * i + 2..4 * i + 6] }
}
spec accent() -> Word[8]^5 { "café" }
```

```text
error[ORC0226]: a slice's bounds may use only integer literals and loop indices
 --> <stdin>:3:54
  |
3 | ... (x: Word[8]^8, n: Int) -> Word[8]^4 { x[n..n + 4] }
  |                                             ^ this is neither
  = note: a slice's position never depends on data: its bounds are built from integer literals and loop indices with `+`, `-`, and `*` by a constant
```

```text
error[ORC0223]: this slice reaches elements 2 through 9, out of range for `Word[8]^8`
 --> <stdin>:5:50
  |
5 | ...  in 0..2 with w: Word[8]^4 = [0; 4] { x[4 * i + 2..4 * i + 6] }
  |                                             ^^^^^^^^^^^^^^^^^^^^ indices run from 0 through 7
  = note: every element a slice can take, over every loop index in its bounds, must be an element of the array
```

```text
error[ORC0235]: U+00E9 is not a printable ASCII character
 --> <stdin>:7:36
  |
7 |   spec accent() -> Word[8]^5 { "caf\u{e9}" }
  |                                    ^^^^^^ its UTF-8 bytes are written `hex"c3 a9"`
  = note: a byte string's characters are its bytes, so each is printable ASCII, from ` ` through `~`; write any other byte as an escape, or in a hex string joined with `++`
```

The second error names the whole range the slice sweeps: its last step, i =
1, would take elements 6 through 9 of an array of eight. The third writes the
source line with the character escaped, and its label gives the bytes a
program would write in its place.

A byte string costs one evaluation step, whatever its length, because the
evaluator builds its array once, before evaluation, and shares it, as it
shares an integer literal. A join, a slice, and a slice update cost one step
for each 64 elements, or part of 64, of the array they build, as an update or
a fill does. In the Core, a byte string is one array literal, and joins,
slices, and slice updates are three new kinds of node, each after its
operands, with a bound left out recorded as the literal it stands for. Every
source S3k accepted has the same Core, values, and output under S3l, since it
writes no string, `++`, or range in brackets.

That leaves new seams. A slice's position never depends on data, so a message
of variable length, or a format that reads a length and then that many bytes,
cannot be written yet. A byte string holds printable ASCII, so text in
another script is written in hex, and until S3p an array held at most 256
elements, so a longer message was several values. Bytes and words are converted by functions a
program writes, such as `word` above, one for each byte order. The next
section closes one more seam: through S3l, nothing took a size as a
parameter, so `hash64` and `hash128` were two functions where SHA-256 is one.

## One algorithm for every length

A standard defines each algorithm once, for inputs of many lengths. FIPS
180-4 pads a message of any length to whole 64-byte blocks and absorbs them
one at a time; RFC 2104 hashes a padded key followed by a message of any
length; RFC 8439 feeds Poly1305 sixteen bytes at a time, the last block
holding what is left. Through S3l every length in an Orange program was an
integer written in its source, so a program could hash a message of 3 bytes
or of 56, but a function for both had to be written twice.

The S3m slice, proposed in the [sizes specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SIZES_2026.md), writes
it once. A `spec` declares **size parameters** in square brackets before its
parameters, each with a finite range, and writes them wherever a length or a
loop bound is written:

```orange
spec sum[n in 1..9](x: Int^n) -> Int {
  for i in 0..n with s: Int = 0 { s + x[i] }
}
spec zeros[n in 1..4]() -> Word[8]^n { [0; n] }
spec code[a in 1..3, b in 7..9]() -> Int { (a * 10) + b }
spec total() -> Int { sum([1, 2, 3]) + sum[1]([10]) }
```

```text
sizes::zeros[1]: Word[8]^1 = [0x00]
sizes::zeros[2]: Word[8]^2 = [0x00, 0x00]
sizes::zeros[3]: Word[8]^3 = [0x00, 0x00, 0x00]
sizes::code[1, 7]: Int = 17
sizes::code[1, 8]: Int = 18
sizes::code[2, 7]: Int = 27
sizes::code[2, 8]: Int = 28
sizes::total: Int = 16
```

`sum` stands for eight functions, `sum[1]` through `sum[8]`, one for each
value of `n` from 1 up to, but not including, 9. Each is an **instance**: the
function with its sizes replaced by their values. The compiler checks every
instance before anything runs, exactly as it would check the same function
written out by hand, so in each of the eight the loop's bound is a number and
`x[i]` is proved in range. A call names its instance by its sizes in
brackets, as `sum[1]([10])`, or by the lengths of its arguments:
`sum([1, 2, 3])` calls `sum[3]`, the one instance whose parameter has three
elements. `orangec eval` evaluates every instance of a `spec` without value
parameters and names it as a call would, the first size changing slowest.

Nothing is symbolic. A size is not a variable that the checker reasons about;
it is a number, different in each instance, and the instances are finite: a
size's range, like a loop's, lies within 0 through 65536, and a function has
at most four sizes and 256 instances. What is proved for `sum` is proved for
each of its eight instances separately, which is all a finite family of
functions needs, and each instance is checked by the rules every function
already obeyed, with no new rule of type or of range.

A size is built from integer literals and size parameters with `+`, `-`,
`*`, `/`, `%`, and parentheses, and computed exactly, with `/` and `%`
Euclidean and total, as for `Int`. A length computed from sizes is written in
parentheses. That is enough for SHA-256. The
[SHA-256 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3m/sha256.or) writes the padding of
FIPS 180-4 section 5.1.1 once for every message of 1 through 119 bytes: the
message, the byte 80, zeros, and the message's length in bits fill
((len + 8) / 64) + 1 blocks, and that length, 8 · len, is under 2^16, so all
but its last two bytes are zeros:

```orange
spec pad[len in 1..120](m: Word[8]^len) -> Word[8]^(64 * (((len + 8) / 64) + 1)) {
  m ++ hex"80" ++ [0; ((64 * (((len + 8) / 64) + 1)) - len - 3)]
    ++ [((8 * len) / 256) as Word[8], (8 * len) as Word[8]]
}
```

The digest absorbs one block in each turn of a loop whose bound is a size,
and SHA-256 is the one composed with the other:

```orange
spec absorb[blocks in 1..4](p: Word[8]^(64 * blocks)) -> Word[8]^32 {
  digest(for b in 0..blocks with h: Word[32]^8 = initial_hash() {
    compress(h, p[64 * b..64 * b + 64])
  })
}

spec sha256[len in 1..120](m: Word[8]^len) -> Word[8]^32 { absorb(pad(m)) }

spec abc() -> Word[8]^32 { sha256("abc") }
```

`sha256("abc")` calls `sha256[3]`. Inside it, `pad(m)` calls `pad[3]`, whose
result has 64 bytes, and `absorb(pad(m))` calls `absorb[1]`, the instance
whose parameter has that length: a call without sizes has the result type of
the instance it calls, so lengths pass through calls. The 56-byte message of
FIPS 180-4's second example needs a second block, and the same three
functions take it there, through `pad[56]`, which gives 128 bytes, and
`absorb[2]`:

```text
sha256::abc: Word[8]^32 = [0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad]
sha256::two_blocks: Word[8]^32 = [0x24, 0x8d, 0x6a, 0x61, 0xd2, 0x06, 0x38, 0xb8, 0xe5, 0xc0, 0x26, 0x93, 0x0c, 0x3e, 0x60, 0x39, 0xa3, 0x3c, 0xe4, 0x59, 0x64, 0xff, 0x21, 0x67, 0xf6, 0xec, 0xed, 0xd4, 0x19, 0xdb, 0x06, 0xc1]
```

Those are the digests FIPS 180-4's examples print. `compress`, `schedule`,
and `digest` are the functions of the byte slice, unchanged: a function
without sizes has one instance, and it is the function it always was.

HMAC is now RFC 2104's formula and nothing else. The
[HMAC fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3m/valid-hmac.or) uses the sized SHA-256
as a module, pads any key of 1 through 63 bytes with zeros to one block, and
authenticates any message of 1 through 55 bytes:

```orange
spec padded[klen in 1..64](key: Word[8]^klen) -> Word[8]^64 { key ++ [0; (64 - klen)] }

spec hmac[len in 1..56](k0: Word[8]^64, m: Word[8]^len) -> Word[8]^32 {
  sha256::sha256(keyed(k0, 0x5c) ++ sha256::sha256(keyed(k0, 0x36) ++ m))
}

spec case2() -> Word[8]^32 { hmac(padded("Jefe"), "what do ya want for nothing?") }
```

```text
hmac::case2: Word[8]^32 = [0x5b, 0xdc, 0xc1, 0x46, 0xbf, 0x60, 0x75, 0x4e, 0x6a, 0x04, 0x24, 0x26, 0x08, 0x95, 0x75, 0xc7, 0x5a, 0x00, 0x3f, 0x08, 0x9d, 0x27, 0x39, 0x83, 0x9d, 0xec, 0x58, 0xb9, 0x64, 0xec, 0x38, 0x43]
```

The byte slice wrote SHA-256's padding, and the inner message's length of
0x2e0 bits, into `case2` by hand. Here the inner hash reads 64 + 28 = 92
bytes and calls `sha256[92]`, the outer reads 96 and calls `sha256[96]`, and
each pads its own message; the longest message, 55 bytes, gives an inner
hash of 119, the last length `sha256` takes. The MAC is RFC 4231's, and so
is that of test case 1, whose key is twenty bytes 0b.

Where an expression stands, a size's name is an `Int` constant: its value in
the instance. The [Poly1305 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3m/valid-poly1305.or)
writes RFC 8439 section 2.5 once for every message of 1 through 255 bytes,
over the type `P` of the integers modulo 2^130 − 5. Its loop runs over the
message's sixteen-byte blocks, and the byte 01 that each block carries above
its bytes sits, in the last block, just above the message's own last byte:

```orange
spec mac[len in 1..256](key: Word[8]^32, m: Word[8]^len) -> Word[8]^16 {
  let padded: Word[8]^(16 * ((len / 16) + 1)) = m ++ [0; (16 - (len % 16))];
  let r: P = number(clamp(key[..16]));
  let s: Int = number(key[16..]) as Int;
  let a: P = for j in 0..((len + 15) / 16) with a: P = 0 {
    let held: Int = if j == (((len + 15) / 16) - 1) { len - (16 * j) } else { 16 };
    (a + number(padded[16 * j..16 * j + 16]) + weight(held)) * r
  };
  tag((a as Int) + s)
}
```

Here `weight(k)` is 256^k in the field, so `weight(held)` is that byte 01. In
each instance the loop's bound is a number, so `padded[16 * j..16 * j + 16]`
is proved in range for every j the loop takes. Called with the key of section
2.5.2 and "Cryptographic Forum Research Group", 34 bytes, `mac` takes the
instance `mac[34]` and gives the RFC's tag:

```text
poly1305::example: Word[8]^16 = [0xa8, 0x06, 0x1d, 0xc1, 0x30, 0x51, 0x36, 0xc6, 0xc2, 0x2b, 0x8b, 0xaf, 0x0c, 0x01, 0x27, 0xa9]
```

A mistake is reported in the first instance that makes it:

```orange
spec last[n in 1..5](x: Word[8]^n) -> Word[8] { x[3] }
spec count[n in 1..3]() -> Int { n }
spec unclear() -> Int { count() }
spec first[n in 1..4](x: Word[8]^n) -> Word[8] { x[0] }
spec unfit() -> Word[8] { first([0; 9]) }
```

```text
error[ORC0223]: index `3` is out of range for `Word[8]^1`
 --> <stdin>:3:53
  |
3 | ... n in 1..5](x: Word[8]^n) -> Word[8] { x[3] }
  |                                             ^ indices run from 0 through 0
  = note: a literal index must be less than the array's length
  = note: in the instance `last[1]`, the first of `last` in error: a sized function is checked once for each value of its sizes
```

```text
error[ORC0239]: this call fits more than one instance of `count`, among them `count[1]` and `count[2]`
 --> <stdin>:5:27
  |
5 |   spec unclear() -> Int { count() }
  |                           ^^^^^^^ write the sizes in brackets
  = note: a call that writes no sizes calls the one instance of its function whose array parameters have the lengths of its arguments; any other call writes its sizes in brackets, as in `absorb[2](p)`
```

```text
error[ORC0238]: no instance of `first` takes arguments of these lengths
 --> <stdin>:7:29
  |
7 |   spec unfit() -> Word[8] { first([0; 9]) }
  |                             ^^^^^^^^^^^^^ an array of length 9 is given
  = note: `first` is defined for `n` in 1..4
  = note: a call that writes no sizes calls the one instance of its function whose array parameters have the lengths of its arguments; any other call writes its sizes in brackets, as in `absorb[2](p)`
```

`last` is wrong in `last[1]`, `last[2]`, and `last[3]`, where the array has
no element 3, but it is reported once, in its first instance in error, which
the note names, and the instances after it are not checked. `count` has no
array parameter, so a call without sizes fits every instance and must say
which it means; `[0; 9]` fits no instance of `first`, and the error says
which sizes `first` takes.

Sizes cost nothing when a program runs. A length, a fill, or a loop bound
written with sizes costs what the same integer costs, and a size's name in an
expression costs one step, as an integer literal does. Checking pays instead:
every instance is checked in full, each part of a size costs one semantic
event each time it is computed, and the per-source budgets of 1,048,576
semantic events and 262,144 Core nodes bound all the instances together. In
the Core, each instance is one Core function that records its sizes, a size's
name is an `Int` literal, and a call refers to the instance it names; the
Core gains no kind of node. Every source S3l accepted has the same Core,
values, and output under S3m, since it declares no size parameter and writes
every length and bound as an integer.

That leaves seams. Nothing is proved for every value of a size at once, only
for each value in its range, one instance at a time, so a family is finite,
and, until S3p, an array still held at most 256 elements. Until S3t, no
modulus was written with a parameter. S3t lets a finite size parameter stand
in `Mod[m]`, and even now a function cannot take one at run time. No
position is a parameter, so one quarter round cannot act on four positions
of a whole state. And a size is fixed in each instance, as a slice's
position is, so a format that reads a length and then that many bytes still
cannot be written.
The roadmap lists those next. The next section closes one more seam: through
S3m, bytes and words were converted by functions a program writes, one for
each width and each order.

## Words in either byte order

A standard prints bytes and computes on words, and it says in a few words how
one becomes the other. FIPS 180-4 section 3.1 fixes big-endian order for the
whole standard, so SHA-256 reads each 64-byte block as sixteen 32-bit words,
the first byte of each most significant, and writes its digest the same way.
RFC 8439 reads ChaCha20's key, counter, and nonce as little-endian words,
serializes the state as little-endian bytes, and reads each Poly1305 block as
a little-endian number, and RFC 7748 decodes and encodes an X25519
coordinate as a little-endian number. Through S3m, Orange said each of these
in code. `load_le32`, earlier in this chapter, builds a word with three shifts
and three ors, its inverse was four shifts called in another loop, and
Poly1305 read a block with a loop of sixteen multiplications. A reader checked every index against
the standard's few words, and the evaluator ran every step.

The S3n slice, proposed in the [byte order specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ORDER_2026.md),
says it as the standards do. A conversion may name a **byte order**, `big`
or `little`, between `as` and its type, and the type may then be an array:

```orange
spec big_word() -> Word[32] { hex"01020304" as big Word[32] }
spec little_word() -> Word[32] { hex"01020304" as little Word[32] }
spec text() -> Word[32] { "abcd" as big Word[32] }
spec bytes() -> Word[8]^4 { let w: Word[32] = 0xdeadbeef; w as big Word[8]^4 }
spec round_trip() -> Word[32] {
  let w: Word[32] = 0xdeadbeef;
  (w as little Word[8]^4) as little Word[32]
}
spec joined() -> Word[64] {
  let high: Word[32] = 0x01234567;
  let low: Word[32] = 0x89abcdef;
  [high, low] as big Word[64]
}
spec quarters() -> Word[16]^4 { let w: Word[64] = 0x0123456789abcdef; w as little Word[16]^4 }
```

```text
order::big_word: Word[32] = 0x01020304
order::little_word: Word[32] = 0x04030201
order::text: Word[32] = 0x61626364
order::bytes: Word[8]^4 = [0xde, 0xad, 0xbe, 0xef]
order::round_trip: Word[32] = 0xdeadbeef
order::joined: Word[64] = 0x0123456789abcdef
order::quarters: Word[16]^4 = [0xcdef, 0x89ab, 0x4567, 0x0123]
```

The meaning is one piece of arithmetic. Words x_0 through x_(k−1), each of n
bits, **spell** a number N, the first word most significant in `big` order and
least significant in `little`:

```text
big:     N = x_0 · 2^(n(k−1)) + x_1 · 2^(n(k−2)) + … + x_(k−1)
little:  N = x_0 + x_1 · 2^n + … + x_(k−1) · 2^(n(k−1))
```

A conversion in a byte order goes through that number. Words become the words
of another width that spell N in the same order, so `joined` puts `high`
above `low`, and `quarters` gives the low sixteen bits first. A single word is
an array of one, so `hex"01020304" as big Word[32]` and `w as big Word[8]^4`
are one rule read in two directions. Words convert only to words of the same
number of bits, so no conversion between words loses a bit or invents one:
writing words in the order they were read gives them back, as `round_trip`
shows, and writing them in the other order reverses the bytes of a word.

Words convert to a number, and a number to words:

```orange
spec number() -> Int { hex"0100" as big Int }
spec little_number() -> Int { hex"0100" as little Int }
spec minus_one() -> Word[8]^4 { let n: Int = -1; n as big Word[8]^4 }
spec wraps() -> Word[8]^2 { let n: Int = 65539; n as big Word[8]^2 }
spec residue() -> Mod[251] { hex"0100" as big Mod[251] }
spec residue_bytes() -> Word[8]^2 { let x: Mod[65521] = -1; x as big Word[8]^2 }
```

```text
order::number: Int = 256
order::little_number: Int = 1
order::minus_one: Word[8]^4 = [0xff, 0xff, 0xff, 0xff]
order::wraps: Word[8]^2 = [0x00, 0x03]
order::residue: Mod[251] = 5
order::residue_bytes: Word[8]^2 = [0xff, 0xf0]
```

As an `Int`, words are N itself, and as a `Mod[m]`, N modulo m, as
`N as Mod[m]` would give. In the other direction a number becomes the words
that spell its residue modulo 2^(nk), the width of the words, and a residue
first becomes its least residue. That is the rule of `as Word[n]` stretched
across an array: one word keeps a value's residue modulo 2^n, so −1 is `0xff`
as one byte and four bytes `0xff` as four, 65539 keeps its low sixteen bits,
which are 3, and the residue −1 of `Mod[65521]`, which is 65520, is the two
bytes that spell it. Two numbers convert to each other without a byte order,
as before, and `Bool`, tuples, and arrays of anything but words convert in
none.

SHA-256 then reads and writes its words where FIPS 180-4 says to. The
[SHA-256 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3n/valid-sha256.or) is the sized
SHA-256 of [One algorithm for every length](/book/chapter-8/#one-algorithm-for-every-length)
with its byte functions gone. The first sixteen words of the message schedule
are the block, read as big-endian words, and the padding ends in the
message's length in bits as a big-endian 64-bit number, all eight of its
bytes, as the standard writes it:

```orange
spec schedule(block: Word[8]^64) -> Word[32]^64 {
  let head: Word[32]^16 = block as big Word[32]^16;
  for t in 16..64 with w: Word[32]^64 = head ++ [0; 48] {
    w with [t] = small_sigma1(w[t - 2]) + w[t - 7] + small_sigma0(w[t - 15]) + w[t - 16]
  }
}

spec absorb[blocks in 1..4](p: Word[8]^(64 * blocks)) -> Word[8]^32 {
  let hash: Word[32]^8 = for b in 0..blocks with h: Word[32]^8 = initial_hash() {
    compress(h, p[64 * b..64 * b + 64])
  };
  hash as big Word[8]^32
}

spec pad[len in 1..120](m: Word[8]^len) -> Word[8]^(64 * (((len + 8) / 64) + 1)) {
  m ++ ([0; ((64 * (((len + 8) / 64) + 1)) - len - 8)] with [0] = 0x80)
    ++ ((8 * len) as big Word[8]^8)
}
```

The S3m fixture wrote a function `word` of four bytes and called it sixteen
times in a loop, wrote the digest one word at a time in another, and wrote
only the length's last two bytes, all that a message of at most 119 bytes
needs. Here each of those is one conversion. The
[SHA-512 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3n/valid-sha512.or) is the same
program over 64-bit words, reading `block as big Word[64]^16` and writing its
length as `(8 * len) as big Word[8]^16`, sixteen bytes, and both hash FIPS
180-4's examples, a message that fills its last block exactly, and the
longest message each takes to their digests.

ChaCha20 reads the other way. The 64 bytes of its constant, key, counter,
and nonce are its initial state as sixteen little-endian words, and the state
it gives is those words as little-endian bytes:

```orange
let initial: Word[32]^16 =
  ("expand 32-byte k" ++ key ++ (counter as little Word[8]^4) ++ nonce) as little Word[32]^16;
```

```orange
state as little Word[8]^64
```

The constant is text, as RFC 8439 prints it, "expand 32-byte k", and the
[ChaCha20 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3n/valid-chacha20.or) gives the
serialized block of section 2.3.2 byte for byte and encrypts the sunscreen
sentence of section 2.4.2 to its ciphertext:

```text
chacha20::block_vector: Word[8]^64 = [0x10, 0xf1, 0xe7, 0xe4, 0xd1, 0x3b, 0x59, 0x15, 0x50, 0x0f, 0xdd, 0x1f, 0xa3, 0x20, 0x71, 0xc4, 0xc7, 0xd1, 0xf4, 0xc7, 0x33, 0xc0, 0x68, 0x03, 0x04, 0x22, 0xaa, 0x9a, 0xc3, 0xd4, 0x6c, 0x4e, 0xd2, 0x82, 0x64, 0x46, 0x07, 0x9f, 0xaa, 0x09, 0x14, 0xc2, 0xd7, 0x05, 0xd9, 0x8b, 0x02, 0xa2, 0xb5, 0x12, 0x9c, 0xd1, 0xde, 0x16, 0x4e, 0xb9, 0xcb, 0xd0, 0x83, 0xe8, 0xa2, 0x50, 0x3c, 0x4e]
```

A number in a field is where a byte order earns the most. RFC 8439 section
2.5 reads Poly1305's key as two little-endian numbers, r and s, clamps r,
reads each block of the message as a little-endian number with a byte 01
above it, and writes the low 128 bits of the accumulator plus s as sixteen
little-endian bytes. The
[Poly1305 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3n/valid-poly1305.or) says so, over
the type `P` of the integers modulo 2^130 − 5:

```orange
spec mac[len in 1..256](key: Word[8]^32, m: Word[8]^len) -> Word[8]^16 {
  // r &= 0x0ffffffc0ffffffc0ffffffc0fffffff, on its two 64-bit halves.
  let half: Word[64]^2 = key[..16] as little Word[64]^2;
  let r: P = [half[0] & 0x0ffffffc0fffffff, half[1] & 0x0ffffffc0ffffffc] as little P;
  let s: Int = key[16..] as little Int;
  let padded: Word[8]^(16 * ((len / 16) + 1)) = m ++ [0; (16 - (len % 16))];
  let a: P = for j in 0..((len + 15) / 16) with a: P = 0 {
    let held: Int = if j == (((len + 15) / 16) - 1) { len - (16 * j) } else { 16 };
    (a + (padded[16 * j..16 * j + 16] as little P) + weight(held)) * r
  };
  ((a as Int) + s) as little Word[8]^16
}
```

The clamp is the RFC's mask, written on two 64-bit halves where the byte
slice wrote it as bytes in little-endian order. A block goes straight into
the field, since sixteen bytes spell a number below 2^128, which is its own
residue. The tag needs no reduction of its own: a number becomes words by
its residue, so writing the sum as sixteen bytes keeps exactly its low 128
bits. The example of section 2.5.2 gives the RFC's tag, and two vectors of
Appendix A.3, one whose sum passes 2^128, give theirs:

```text
poly1305::example: Word[8]^16 = [0xa8, 0x06, 0x1d, 0xc1, 0x30, 0x51, 0x36, 0xc6, 0xc2, 0x2b, 0x8b, 0xaf, 0x0c, 0x01, 0x27, 0xa9]
```

X25519 decodes a coordinate as RFC 7748's decodeUCoordinate does, the top bit
masked and the 32 bytes read as a little-endian number modulo 2^255 − 19,
and encodes its result as encodeUCoordinate does, the least residue as 32
little-endian bytes. In the
[X25519 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3n/valid-x25519.or) each is one line
around the ladder of
[Rounds in the words of their standard](/book/chapter-8/#rounds-in-the-words-of-their-standard):

```orange
let x_1: F = (u with [31] = u[31] & 127) as little F;
```

```orange
(x_2 / z_2) as little Word[8]^32
```

```text
x25519::test_vector: Word[8]^32 = [0xc3, 0xda, 0x55, 0x37, 0x9d, 0xe9, 0xc6, 0x90, 0x8e, 0x94, 0xea, 0x4d, 0xf2, 0x8d, 0x08, 0x4f, 0x32, 0xec, 0xcf, 0x03, 0x49, 0x1c, 0x71, 0xf7, 0x54, 0xb4, 0x07, 0x55, 0x77, 0xa2, 0x85, 0x52]
```

That is the result of the first test vector of section 5.2.

A conversion that would lose a bit, or that has no words to order, is an
error:

```orange
spec w(b: Word[8]^3) -> Word[32] { b as big Word[32] }
spec m(x: Int) -> Mod[7] { x as big Mod[7] }
spec n(x: Word[8]^4) -> Int { x as Int }
```

```text
error[ORC0240]: `Word[8]^3` and `Word[32]` have different widths
 --> <stdin>:3:47
  |
3 | ...  w(b: Word[8]^3) -> Word[32] { b as big Word[32] }
  |                                             ^^^^^^^^ `Word[32]` has 32 bits
 ::: <stdin>:3:38
  |
3 |   spec w(b: Word[8]^3) -> Word[32] { b as big Word[32] }
  |                                      - `Word[8]^3` has 24 bits
  = note: a byte order keeps every bit of the words it converts, so words convert only to words of the same number of bits
```

```text
error[ORC0215]: `big` orders words, but this converts `Int` to `Mod[7]`
 --> <stdin>:4:35
  |
4 |   spec m(x: Int) -> Mod[7] { x as big Mod[7] }
  |                                   ^^^ neither side is a word or an array of words
  = note: a number converts to another without a byte order, as `x as Mod[7]`
```

```text
error[ORC0215]: `as` is not defined for `Word[8]^4`
 --> <stdin>:5:35
  |
5 |   spec n(x: Word[8]^4) -> Int { x as Int }
  |                                   ^^ `as` converts one `Int`, word, or residue value
  = note: name a byte order to read the words as one number or as words of another width, as in `x as big Int`, or convert each element, such as `x[0] as Int`
```

Three bytes are 24 bits and a word is 32, and the error counts both sides.
Between two numbers there is nothing to order. An array of words converts to
a number only in a byte order, since without one there is no telling which
end is the most significant, and the note names the byte order. `big` and
`little` are byte orders only directly after `as` and before `(` or a name
other than `as` and `with`, and anywhere else they are names, so a program
that calls a function `big` or a type `little` means what it meant; without
a byte order, an array type after `as` is still the ungrouped `^` of
`ORC0108`, whose note now names the byte order too.

A conversion in a byte order costs one evaluation step for each 64 bits of
its width, or part of 64: 8 steps for a SHA-256 block read as sixteen words,
and 256 for `Word[64]^256`, whose 16,384 bits are also the most an `Int`
holds; since S3p an array may be wider, and a conversion of one to a number
stops at run time if the number passes that limit. A conversion to `Mod[m]` also costs what
`as Mod[m]` costs. In the Core it is one `pack` node that records its
operand's type and its order. The three schemes of `orangec enc` read and
write their words this way, the ChaCha20 state, the key stream, the exclusive
or of a chunk eight bytes at a time, each Poly1305 block, the tag, and
Ascon's blocks, and sealing one chunk takes 24,152 through 28,325 steps where
it took 43,805 through 55,096; a megabyte seals in about a third of the time,
and every file sealed before the change opens after it, and every file sealed
after opens before. Every source S3m accepted has the same Core, values, and
output under S3n, since `big` or `little` after `as` was a type's name only
where S3n still reads it as one.

That leaves seams. A byte order reads a whole value, never words at a
position computed from data, so a format that reads a length and then that
many bytes still cannot be written. An array of residues, such as field
elements serialized one after another, converts one element at a time. A bit
order within a word, as some hash functions and ciphers number their bits,
is not defined, and a word has no byte order of its own: a word is a number,
and only a sequence of words spells a number in an order. The roadmap lists
moduli written with parameters, positions given as parameters, and slices
and words at positions computed from data next. The next section closes a
seam that S3m named another way: through S3n, one function could not serve
several fields, or words of several widths, and was written again for each.

## One function for several types

Cryptography computes the same way in many types. Square-and-multiply raises
an element to a power in any field, Fermat's little theorem inverts in any
field of prime order, and Euler's criterion tells squares from nonsquares in
any of them. RFC 7748 computes modulo 2^255 − 19, RFC 8032 also modulo the
order of the Curve25519 subgroup, RFC 8439 modulo 2^130 − 5, and FIPS 203 and
FIPS 204 modulo 3329 and 8380417. FIPS 180-4 defines Ch, Maj, and the round
of SHA-256 and SHA-512 by the same formulas, once on 32-bit words and once on
64-bit ones. Through S3n, each had to be written once for each type, word for
word the same, and a reader compared the copies by eye.

The S3o slice, proposed in the
[type parameters specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TYPE_PARAMETERS_2026.md), writes each once.
Beside its sizes, or instead of them, a `spec` may declare a **type
parameter**, a name and the list of types the function is written for, and
write that name wherever a type is written:

```orange
type P = Mod[65521];

spec seven[K in {Int, Word[16], P}]() -> K {
  let x: K = 3;
  x + 4
}
spec minus_one[K in {Word[16], P}]() -> K {
  let n: Int = -1;
  n as K
}
spec square[K in {Word[16], P}](x: K) -> K { x * x }
spec squares() -> (Word[16], P) { (square[Word[16]](300), square[P](300)) }
```

```text
kinds::seven[Int]: Int = 7
kinds::seven[Word[16]]: Word[16] = 0x0007
kinds::seven[P]: Mod[65521] = 7
kinds::minus_one[Word[16]]: Word[16] = 0xffff
kinds::minus_one[P]: Mod[65521] = 65520
kinds::squares: (Word[16], Mod[65521]) = (0x5f90, 24479)
```

`seven` stands for three functions, `seven[Int]`, `seven[Word[16]]`, and
`seven[P]`, one for each listed type, and each is an **instance**, as each
value of a size gives one in [One algorithm for every length](/book/chapter-8/#one-algorithm-for-every-length):
the function with `K` replaced by its type. The compiler checks every
instance before anything runs, exactly as it would check the function
written out with that type, so `let x: K = 3` is checked as an `Int`, as a
word, and as a residue, and `n as K` is the conversion to a word in one
instance and to a residue in the other. The same −1 is `0xffff`, sixteen bits
of ones, and 65520, the least residue of −1 modulo 65521, and the same
square of 300 is 90000 modulo 2^16 in one instance and modulo 65521 in the
other. `orangec eval` evaluates every instance of a `spec` without value
parameters and names it by its types, as a call names it.

Nothing is generic at run time. A type parameter is not a type variable that
the checker reasons about for all types; it is a type, different in each
instance, and the list is finite and written in the source, so the source
says which types a function was checked for. That is exactly what a size
already is, and the two mix: a function has at most four parameters in
brackets, sizes and types together, and one instance for each combination of
their values, the first parameter changing slowest, at most 256 in all.

A call names its instance in brackets, as `square[P](300)`, with one entry
for each of the callee's parameters in brackets: `Int`, `Bool`, a word, an
array of them, a `type` declaration's name, or a type parameter of the
caller. Without brackets, its arguments choose: the instance whose
parameters have the arguments' types. Where they do not decide, because an
argument is a literal that fits several types, the type the call's place
expects does:

```orange
spec zero[K in {Int, Word[16], P}]() -> K { 0 }
spec total[K in {Int, Word[16], P}, n in 1..4](xs: K^n) -> K {
  for i in 0..n with sum: K = 0 { sum + xs[i] }
}
spec chosen() -> (Word[16], P, Int) {
  let w: Word[16] = 40000;
  let r: P = 40000;
  (square(w), total([r, r, r]), total([1, 2, 3]) + zero())
}
```

```text
fit::chosen: (Word[16], Mod[65521], Int) = (0x1000, 54479, 6)
```

`square(w)` is `square[Word[16]]`, since `w` is a word. `total([r, r, r])`
is `total[P, 3]`: its argument's elements are residues and there are three
of them, so one call chooses a type and a size at once. `total([1, 2, 3])`
has an argument whose elements are literals, which could be any of the three
types, and so could `zero()`, which has no argument at all; each sits where
an `Int` is expected, and each is its `Int` instance.

That is enough for the fields. The
[field fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3o/valid-fields.or) writes
exponentiation, inversion, and Euler's criterion once, for the five prime
fields of Curve25519, its subgroup, Poly1305, ML-KEM, and ML-DSA:

```orange
type F = Mod[(1 << 255) - 19];
type L = Mod[(1 << 252) + 27742317777372353535851937790883648493];
type P = Mod[(1 << 130) - 5];
type Q = Mod[3329];
type D = Mod[8380417];

// x^e for 0 <= e < 2^256, squaring x once for each bit of e and
// multiplying the bits that are set into the power.
spec pow[K in {F, L, P, Q, D}](x: K, e: Int) -> K {
  let (square: K, power: K, rest: Int) =
    for i in 0..256 with (square: K, power: K, rest: Int) = (x, 1, e) {
      (square * square, if (rest % 2) == 1 { power * square } else { power }, rest / 2)
    };
  power
}

// Fermat's little theorem: in a field of prime order m, x^(m - 2) is the
// inverse of x, for x not 0.
spec inverse[K in {F, L, P, Q, D}](x: K) -> K { pow(x, modulus[K]() - 2) }

// Euler's criterion: 1 for a nonzero square, -1 for a nonsquare, 0 for 0.
spec legendre[K in {F, L, P, Q, D}](x: K) -> Int {
  let t: K = pow(x, (modulus[K]() - 1) / 2);
  if t == 0 { 0 } else if t == 1 { 1 } else { -1 }
}

// RFC 8032 section 5.1.3 takes square roots in F with 2^((m - 1) / 4),
// a square root of -1.
spec sqrt_minus_one() -> F { pow(2, (modulus[F]() - 1) / 4) }

// ML-KEM's number-theoretic transform is built on 17, a primitive 256th
// root of unity modulo 3329, and ML-DSA's on 1753, a primitive 512th root
// of unity modulo 8380417: 17^128 and 1753^256 are both -1.
spec kem_root() -> Q { pow(17, 128) }

spec dsa_root() -> D { pow(1753, 256) }
```

```text
fields::two_is_square[F]: Int = -1
fields::two_is_square[L]: Int = -1
fields::two_is_square[P]: Int = -1
fields::two_is_square[Q]: Int = 1
fields::two_is_square[D]: Int = 1
fields::sqrt_minus_one: Mod[(1 << 255) - 19] = 19681161376707505956807079304988542015446066515923890162744021073123829784752
fields::squares_to_minus_one: Bool = true
fields::kem_root: Mod[3329] = 3328
fields::dsa_root: Mod[8380417] = 8380416
```

Inside `inverse`, `modulus[K]()` passes the caller's own type parameter on,
so each instance of `inverse` calls the instance of `modulus` for its own
field, and `pow(x, ...)` takes the instance of `pow` that `x`'s type chooses.
In `sqrt_minus_one`, `pow(2, ...)` has only literals for arguments, and the
result `F` chooses. The five instances of `two_is_square`, a call of
`legendre` on 2, give −1 where the modulus is 3 or 5 modulo 8 and 1 where it
is 1 modulo 8, as the second supplement to quadratic reciprocity says, and
the constant RFC 8032 takes square roots with squares to −1. 17^128 is 3328
and 1753^256 is 8380416, both −1: 17 and 1753 are the roots of unity FIPS
203 and FIPS 204 build their transforms on, and −1 shows that each has
exactly the order its standard names, since a root of smaller order would
divide 128 or 256 and give 1.

SHA-256 and SHA-512 share their round. The
[SHA-2 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3o/valid-sha2.or) writes Ch, Maj, the
round that updates the eight working variables, and their addition to the
hash value once, over `W in {Word[32], Word[64]}`, and each compression
function calls them without brackets, on its own words:

```orange
// Sections 4.1.2 and 4.1.3: the same Ch and Maj on words of either width.
spec ch[W in {Word[32], Word[64]}](x: W, y: W, z: W) -> W { (x & y) ^ (~x & z) }
spec maj[W in {Word[32], Word[64]}](x: W, y: W, z: W) -> W { (x & y) ^ (x & z) ^ (y & z) }

// Step 3 of sections 6.2.2 and 6.4.2: one round on the working variables,
// given the round's two Sigma values and its constant plus schedule word.
spec round[W in {Word[32], Word[64]}](
  v: (W, W, W, W, W, W, W, W),
  sigma0: W,
  sigma1: W,
  kw: W,
) -> (W, W, W, W, W, W, W, W) {
  let (a: W, b: W, c: W, d: W, e: W, f: W, g: W, h: W) = v;
  let t1: W = h + sigma1 + ch(e, f, g) + kw;
  let t2: W = sigma0 + maj(a, b, c);
  (t1 + t2, a, b, c, d + t1, e, f, g)
}
```

```orange
round(v, big_sigma0_256(v.0), big_sigma1_256(v.4), k[t] + w[t])
```

```orange
round(v, big_sigma0_512(v.0), big_sigma1_512(v.4), k[t] + w[t])
```

The rotations, the schedules, the constants, and the padding differ, and
each hash keeps its own; what the standard writes once, the fixture writes
once. Both reproduce FIPS 180-4's digests of "abc" and of the messages whose
padding takes a second block:

```text
sha2::sha256_abc: Word[8]^32 = [0xba, 0x78, 0x16, 0xbf, 0x8f, 0x01, 0xcf, 0xea, 0x41, 0x41, 0x40, 0xde, 0x5d, 0xae, 0x22, 0x23, 0xb0, 0x03, 0x61, 0xa3, 0x96, 0x17, 0x7a, 0x9c, 0xb4, 0x10, 0xff, 0x61, 0xf2, 0x00, 0x15, 0xad]
sha2::sha512_abc: Word[8]^64 = [0xdd, 0xaf, 0x35, 0xa1, 0x93, 0x61, 0x7a, 0xba, 0xcc, 0x41, 0x73, 0x49, 0xae, 0x20, 0x41, 0x31, 0x12, 0xe6, 0xfa, 0x4e, 0x89, 0xa9, 0x7e, 0xa2, 0x0a, 0x9e, 0xee, 0xe6, 0x4b, 0x55, 0xd3, 0x9a, 0x21, 0x92, 0x99, 0x2a, 0x27, 0x4f, 0xc1, 0xa8, 0x36, 0xba, 0x3c, 0x23, 0xa3, 0xfe, 0xeb, 0xbd, 0x45, 0x4d, 0x44, 0x23, 0x64, 0x3c, 0xe8, 0x0e, 0x2a, 0x9a, 0xc9, 0x4f, 0xa5, 0x4c, 0xa4, 0x9f]
```

An instance in error is reported by its name, the first of its function, as
for sizes, and a call that its arguments and place cannot place is an error
that says what it was given:

```orange
edition 2026;
module errors {
  type Q = Mod[3329];
  spec twice[K in {Q, Mod[3329]}](x: K) -> K { x + x }
  spec double[K in {Word[32], Q}](x: K) -> K { x + x }
  spec unfit(x: Int) -> Int { double(x) }
  spec unclear() -> Int { double(3) as Int }
}
```

```text
error[ORC0241]: `K` lists the type `Mod[3329]` twice
 --> <stdin>:4:23
  |
4 |   spec twice[K in {Q, Mod[3329]}](x: K) -> K { x + x }
  |                       ^^^^^^^^^ this is the same type as an earlier one
 ::: <stdin>:4:20
  |
4 |   spec twice[K in {Q, Mod[3329]}](x: K) -> K { x + x }
  |                    - first listed here
  = note: a type parameter lists each type once, so that each instance has a type of its own
```

```text
error[ORC0241]: no instance of `double` takes arguments of these types
 --> <stdin>:6:31
  |
6 |   spec unfit(x: Int) -> Int { double(x) }
  |                               ^^^^^^^^^ an argument of type `Int` is given
  = note: `double` is defined for `K` in {Word[32], Q}
  = note: a call that writes no brackets calls the one instance of its function whose parameters have its arguments' types, and among several, the one whose result has the type its place expects; any other call writes its types in brackets, as in `pow[F](x, e)`
```

```text
error[ORC0239]: this call fits more than one instance of `double`, among them `double[Word[32]]` and `double[Q]`
 --> <stdin>:7:27
  |
7 |   spec unclear() -> Int { double(3) as Int }
  |                           ^^^^^^^^^ write the types in brackets
  = note: a call that writes no brackets calls the one instance of its function whose parameters have its arguments' types, and among several, the one whose result has the type its place expects; any other call writes its types in brackets, as in `pow[F](x, e)`
```

`Q` and `Mod[3329]` are one type under two spellings, and a list names each
type once, so that no two instances are the same function. `Int` is not
among `double`'s types, and the error lists the ones that are. In
`unclear`, the literal 3 fits a word and a residue, and `as Int` expects no
type of its operand, so nothing chooses, and the error says to write the
types in brackets. The listed types are resolved once, before any size has a
value, so their lengths are written without sizes; a type parameter's name
is no built-in type's, no declared type's, and no other bracket parameter's;
and it names a type, not a value, so `K` in an expression names no value,
while a parameter or a binding may share its spelling.

Types cost nothing when a program runs: each instance is one Core function,
as for sizes, that records its parameters' values, a type as its position in
its list, and its name, and every type in its body is concrete. Checking
pays, as it does for sizes: every instance is checked in full, within the
same per-source budgets. Finding the instance of a call reads each of its
arguments once, so calls nested in each other's arguments cost work in
proportion to their depth. The same change removed a cost that S3m had left:
a sized call whose argument was a conditional read that argument twice when
its first branch gave no length, so each level of nesting doubled the work of
checking, and a source of 31 levels and 1,248 bytes did not finish in two
minutes. Every source S3n accepted has the same Core, values, and output
under S3o, since no source it accepted wrote braces after a size's `in`.

That leaves seams. A list is written in each function, so several functions
over the same fields repeat it, and nothing yet names a list once. A `type`
declaration takes no type parameter, so a field element cannot carry its
modulus's name, and a residue type is written in a call's brackets only
through a declaration's name. Nothing is known of all types at once, only of
each listed one, and no bound or class of types exists. The roadmap lists
positions given as parameters and slices and words at positions computed
from data next.

## Vectors at full length

The objects of cryptography are long. An ML-KEM-512 encapsulation key is 800
bytes and its ciphertext 768; an ML-DSA-44 public key is 1,312 bytes and its
signature 2,420; an RSA-2048 modulus, and every OAEP block under it, is 256
bytes, and RSA-4096's are 512. Even RFC 8439 prints test vectors of 375 and
265 bytes. Through S3o an array held at most 256 elements, so each of these
was cut into a head and a tail, and a reader had to reassemble the RFC's
vector from pieces. The S3p slice, proposed in the
[lengths specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LENGTHS_2026.md) and in the owner's review under
[OEP-0019](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0019-orange-2026-lengths.md), lets an array,
an array literal, and a byte string hold up to 65,536 elements, and the
vectors are written as printed. The text that RFC 8439 encrypts in
appendix A.2 and authenticates in appendix A.3 is one byte string of 375
bytes, and ChaCha20 and Poly1305 are each written once for every message of
1 through 256 whole blocks:

```orange
// The text of test vectors A.2 #2, A.3 #2 and A.3 #3: 375 bytes.
spec ietf() -> Word[8]^375 {
  "Any submission to the IETF intended by the Contributor for publication as all " ++
    "or part of an IETF Internet-Draft or RFC and any statement made within the " ++
    "context of an IETF activity is considered an \"IETF Contribution\". Such " ++
    "statements include oral statements in IETF sessions, as well as written and " ++
    "electronic communications made at any time or place, which are addressed to"
}

spec mac[blocks in 1..257](key: Word[8]^32, m: Word[8]^(16 * blocks), held: Int) -> Word[8]^16 {
  let half: Word[64]^2 = key[..16] as little Word[64]^2;
  let r: P = [half[0] & 0x0ffffffc0fffffff, half[1] & 0x0ffffffc0ffffffc] as little P;
  let s: Int = key[16..] as little Int;
  let a: P = for j in 0..blocks with a: P = 0 {
    let k: Int = if j == (blocks - 1) { held } else { 16 };
    (a + (m[16 * j..16 * j + 16] as little P) + weight(k)) * r
  };
  ((a as Int) + s) as little Word[8]^16
}

spec a3_2() -> Word[8]^16 {
  mac(
    hex"00000000 00000000 00000000 00000000 36e5f6b5 c5e06070 f0efca96 227a863e",
    ietf() ++ [0; 9],
    7,
  )
}
```

The text is 23 blocks and 7 bytes, so the message is padded with nine zeros
to 24 blocks, the call fits `mac[24]` by that length, and the last block is
told that 7 of its bytes are the message's. Each tag is the RFC's:

```text
rfc8439::a3_2: Word[8]^16 = [0x36, 0xe5, 0xf6, 0xb5, 0xc5, 0xe0, 0x60, 0x70, 0xf0, 0xef, 0xca, 0x96, 0x22, 0x7a, 0x86, 0x3e]
rfc8439::a3_3: Word[8]^16 = [0xf3, 0x47, 0x7e, 0x7c, 0xd9, 0x54, 0x17, 0xaf, 0x89, 0xa6, 0xb8, 0x79, 0x4c, 0x31, 0x0c, 0xf0]
```

The limit is not arbitrary. 65,536 is 2^16: the most iterations a loop has
always had, and exactly the values of a 16-bit word. The index proofs of S3g
are unchanged, and at the new limit they say that a `Word[16]` indexes an
array of 65,536 elements with no check at run time, while an index into an
array one element shorter is rejected before anything runs. A table of 16-bit
entries is therefore as safe to read as an S-box of 256 always was.
The lengths fixture fills a table with the powers of 3 modulo the Fermat
prime F4 = 2^16 + 1 and reads it with Pepin's test, which says that F4 is
prime exactly when 3^((F4 − 1)/2) is −1:

```orange
type F4 = Mod[(1 << 16) + 1];

spec powers(g: F4) -> F4^65536 {
  let (table: F4^65536, next: F4) =
    for k in 0..256 with (t: F4^65536, x: F4) = ([0; 65536], 1) {
      let r: F4^256 = row(x, g);
      (t with [256 * k..256 * k + 256] = r, r[255] * g)
    };
  table
}

spec at(table: F4^65536, i: Word[16]) -> F4 { table[i] }

spec pepin() -> (F4, F4, Bool) {
  let table: F4^65536 = powers(3);
  let half: F4 = at(table, 0x8000);
  let last: F4 = at(table, 0xffff);
  (half, last, (half == -1) && ((last * 3) == 1))
}
```

Costs do not change with length. An update, a fill, a join, a slice, and a
slice update of an array of n elements cost ceil(n / 64) steps, as they did,
so every operation that makes an array makes at most 64 elements for each
step it costs, and an evaluation's memory stays bounded by its steps. The
price is visible in the program's shape. Updating one element of an array of
65,536 costs 1,024 steps, so filling the table one element at a time would
cost 65,536 × 1,024, about 67 million steps. `powers` fills each row of 256
in an array of its own, at 4 steps an element, and places it with one slice
update of 1,024 steps: 524,288 steps for the updates, and about 1.45 million
for the whole test.

That is more than the 1,048,576 steps a source has always had, and the
evaluator says so, and says what to do:

```text
error[ORC0301]: reference evaluation step limit exceeded
 --> compiler/fixtures/s3p/valid-lengths.or:38:8
   |
38 |   spec pepin() -> (F4, F4, Bool) {
   |        ^^^^^ evaluation stopped while evaluating this function
  = note: at most 1048576 evaluation steps are permitted
  = note: no partial value set is returned
  = note: `orangec eval --steps N` sets the budget, up to 1073741824 steps
```

`orangec eval` takes three options. `--steps N` sets the budget of the whole
evaluation, from 1 through 1,073,741,824, a thousand and twenty-four times the
default. `--spec NAME`, repeatable, evaluates only the named functions without
parameters, every instance of a sized one, in source order, and checks the
rest; a name that matches none is `ORC1016`, and nothing runs. `--stats`
writes to standard error, after the values, the steps each function used and
their total against the budget:

```console
$ orangec eval --steps 2097152 --spec pepin --stats compiler/fixtures/s3p/valid-lengths.or
lengths::pepin: (Mod[65537], Mod[65537], Bool) = (65536, 21846, true)
lengths::pepin: 1452583 steps
total: 1452583 of 2097152 steps
```

3^32768 is 65536, which is −1 modulo F4, so F4 is prime and 3 generates its
multiplicative group; 3^65535 is 21846, the inverse of 3. The steps are the
cost table's and are deterministic, so the report is as reproducible as the
values: the same source, options, and edition give the same numbers on every
machine. They are not time, and they say nothing about a native
implementation or about side channels.

One consequence reaches back to S3n. Through S3o no array held more than
16,384 bits, so a conversion to a number could never exceed the evaluator's
exact-integer limit. Now 8,192 words of 64 bits are 65,536 bytes, and back,
in one conversion each; but words convert to `Int` or `Mod[m]` only while the
number they spell has at most 16,384 significant bits, and a larger number
stops the evaluation at the conversion with `ORC0301`, as every exact integer
past the limit does. The limit is on the value, not the type: 2,048 bytes of
`0xff` spell 2^16384 − 1, which converts, and which F4 divides, since
2^16 = −1 modulo F4:

```orange
spec widest() -> Int {
  let ones: Word[8]^2048 = [0xff; 2048];
  (ones as big Int) % 65537
}
```

```text
lengths::widest: Int = 0
```

S3p adds no syntax, no token, no reserved word, and no node to the Core. Every
source S3o accepted has arrays of at most 256 elements and keeps its Core,
values, output, and steps; every message that named the limit 256 now names
65536. A sealing scheme of `orangec enc` may now seal chunks of up to 65,536
bytes with their tag, with the file format unchanged.

That leaves seams. A size still covers at most 256 instances, so one function
covers every message of up to 256 whole blocks, not every length byte by
byte; a message that ends inside a block is padded and cut back, as above. No
length is known only at run time, so a format that reads a length and then
that many bytes still cannot be written. The budget belongs to the command
line, not the source, so a program cannot say what it expects to cost, and
checking has its own fixed budgets, which long literals spend like any others.

## Known answers beside the algorithm

Every cryptographic standard ends in numbers: a key, a nonce, a message, and
the bytes an implementation must produce from them. RFC 8439 prints them in
every section and again in an appendix, and FIPS 197 walks through a whole AES
encryption round by round. They are how an implementer knows the code is the
algorithm and not something near it. Through S3p an Orange program could
compute a known answer and print it, but the claim that the answer matched
the standard lived outside the program, in a runner that compared text. The
S3q slice, proposed in the [tests specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TESTS_2026.md) and in the
owner's review under
[OEP-0020](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0020-orange-2026-tests.md), puts the claim in
the program, beside the functions it is about:

```orange
test "2.1.1: the quarter round" {
  quarter_round(0x11111111, 0x01020304, 0x9b8d6f43, 0x01234567)
    == (0xea2a92f4, 0xcb1cf8ce, 0x4581472e, 0x5881c4bb)
}

test "2.3.2: the block function" {
  let key: Word[8]^32 =
    hex"00010203 04050607 08090a0b 0c0d0e0f 10111213 14151617 18191a1b 1c1d1e1f";
  let serialized: Word[8]^64 =
    hex"10 f1 e7 e4 d1 3b 59 15 50 0f dd 1f a3 20 71 c4" ++
      hex"c7 d1 f4 c7 33 c0 68 03 04 22 aa 9a c3 d4 6c 4e" ++
      hex"d2 82 64 46 07 9f aa 09 14 c2 d7 05 d9 8b 02 a2" ++
      hex"b5 12 9c d1 de 16 4e b9 cb d0 83 e8 a2 50 3c 4e";
  block(key, 1, hex"00 00 00 09 00 00 00 4a 00 00 00 00") == serialized
}
```

A test is a title and a claim. The title is a quoted string that says where
the claim comes from, here the RFC's section numbers, and it names the test in
every report, so it is held to what a report can print: 1 through 128
characters of printable ASCII, no backslash, and no title twice in a module.
Each break of that rule is `ORC0242` at the title. The claim is a `Bool`
expression, with its own `let` bindings, over the module's functions and the
functions of the modules it uses: the test is checked as a function without
parameters that gives a `Bool`, and a claim of any other type is the error an
expected `Bool` gives. The word `test` is not reserved. It begins a test only
where a module member may begin, followed by a string, so a function named
`test` is still called as `test()`.

The claims above compare a tuple of four words and an array of 64 bytes,
which no earlier slice allowed. S3q defines `==` and `!=` for every type: two
arrays are equal when every pair of elements at the same index is, and two
tuples when every pair of parts at the same position is. An array, a fill,
or a tuple written out takes its type from the other side, so neither
`x == [1, 2, 9, 4]` nor the appendix A.1 test's `zero_key_stream() ==
(hex"76 b8 ..." ++ ...)` needs a type written; two written out have no type
between them and are `ORC0227`. Arrays
and tuples have equality but no order: `<` on them is `ORC0215`, with a note
that says to compare elements.

The cost of a comparison is chosen with a cryptographer's suspicion. It
compares every part, whether or not an earlier part differs: one step for each
64 words or truth values of an array, what each pair costs for numbers and
residues, and the sum of its parts for a tuple. The
[equality fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3q/valid-equality.or) builds two
arrays of 256 bytes that differ in their first byte and two that differ in
their last, and both functions cost 17 steps; two arrays of 65,536 bytes cost
1,024 steps to compare wherever they differ. The equality a tag check needs is
the one that does not stop early. The reference evaluator is not
constant-time, and steps are not time, but the language no longer offers the
early exit that a native implementation would then have to be talked out of.

`orangec test` checks the program as `orangec check` does and runs the root
module's tests in source order, under one step budget:

```console
$ orangec test compiler/fixtures/s3q/valid-rfc8439-tests.or
test "2.1.1: the quarter round" ... ok
test "2.3.2: the block function" ... ok
test "A.1 #1: the zero key's key stream, block 0" ... ok
test "A.1 #2: the zero key's key stream, block 1" ... ok
test "the nonce changes every block" ... ok
test "2.5.2: Poly1305 of the Forum's name" ... ok
test "A.3 #1: Poly1305 of zeros under the zero key" ... ok
7 tests: 7 passed, 0 failed
```

A failed claim is a result, not an error. It goes to standard output, and the
exit status says whether every claim held: 0 when all did, 1 when any did not.
When the claim is a single `left == right`, the report shows both values and,
for arrays and tuples, where they first differ, as an index or a part followed
into its elements, so a wrong byte deep in a block is found at once. The
[failing fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3q/failing-tests.or) shows each shape:

```text
test "an array" ... FAILED
    left:  [0x01, 0x02, 0x03, 0x04]
    right: [0x01, 0x02, 0x09, 0x04]
    first difference at [2]
test "a tuple holding an array" ... FAILED
    left:  (0x01, [0x02, 0x03, 0x04])
    right: (0x01, [0x02, 0x03, 0x05])
    first difference at .1[2]
```

`--steps` and `--stats` work as they do for `eval`: the tests share one
budget, and `--stats` writes each test's steps after the report. A test that
exceeds the budget stops the whole run with `ORC0301` at its title and the
note "no test outcome is reported". A claim that could not be decided is
neither kept nor failed, so nothing else is written, and the status is 1.

Only the root module's tests run. A program is checked from the file given to
`orangec`; the modules it uses are checked for what it can call, and their
tests are neither checked nor run until that module is the root, as in
`orangec test sha256.or`. A module carries its own known answers, and a
program that uses it pays nothing for them. `orangec eval` runs no test, and
in the Core the root's tests follow its functions, each a function of result
`Bool` that keeps its title, so the evaluator runs them with no new
machinery.

S3q adds one declaration form and one language diagnostic code, and no token,
reserved word, type, or Core node. Every source S3p accepted keeps its Core,
values, output, and steps, since none began a member with `test` and none
compared arrays or tuples, which S3p rejected.

That leaves seams. A test states one claim about one computation. It takes no
parameters, so a table of vectors is several tests, and no test can claim
that a call stops or that a source is rejected, so negative vectors still
live in the conformance runners. A module's user cannot run the tests of the
modules it uses. And a passing test is evidence about the reference evaluator
at one revision, not a proof that a function meets its standard for every
input.

## Amounts the data choose

A rotation by a fixed amount is a wire in a circuit diagram. SHA-256 turns
its words by 2, 13, and 22 bits, and every one of those numbers is printed in
the standard. Some designs turn words by amounts printed nowhere, because the
data choose them. RC5 and its successor RC6 made rotations by data their
central operation. SHA-3's rho step turns each of its 24 lanes by a triangular
number, (t + 1)(t + 2)/2 modulo 64, where t counts the steps of a walk over
the state. A Montgomery ladder or a square-and-multiply reads bit i of a
scalar, `(k >> i) & 1`, and ML-KEM orders the constants of its transform by
moving bit i of an index to bit 6 − i. Through S3q an amount was a literal,
so each of these was a table that a reader had to check against the one line
the standard prints. The S3r slice, proposed in the
[computed amounts specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/AMOUNTS_2026.md) and in the owner's review
under
[OEP-0021](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0021-orange-2026-computed-amounts.md), writes
the line:

```orange
// FIPS 202 Algorithm 2, rho: from (x, y) = (1, 0), step t turns lane (x, y)
// by (t + 1)(t + 2)/2 and moves to (y, 2x + 3y), coordinates modulo 5.
spec rho_walk(a: State) -> (State, Z5, Z5) {
  for t in 0..24 with (b: State, x: Z5, y: Z5) = (a, 1, 0) {
    (
      b with [(x as Int) + 5 * (y as Int)] =
        a[(x as Int) + 5 * (y as Int)] <<< (((t + 1) * (t + 2)) / 2),
      y,
      2 * x + 3 * y,
    )
  }
}
```

The walk's coordinates are residues modulo 5, and the offset is an `Int`
computed from the loop index. Nothing in the program says "modulo 64",
because a rotation already means it: `a <<< k` turns a word of n bits by k
modulo n, whatever k is. The standard's table of offsets, whose first row
reads 0, 1, 62, 28, 27, is written nowhere in the
[SHA3-256 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3r/valid-sha3.or). The fixture
computes it, and its tests of NIST's examples pass only if every offset is
right.

An amount is any expression of type `Int` or a word, and its type is found
as an index's is, from its first typed leaf. In `x <<< r` with a byte r the
amount is a `Word[8]`, and the word it turns may be a `Word[64]`; in
`x >> (i % 8)` with a loop index i it is an `Int`. A truth value, a residue,
or an array is not an amount, and is reported with the error an expected
`Int` gives. A residue becomes an amount with `as Int`.

What gives the slice its character is that every amount has a value, the one
the arithmetic gives. For a word a of n bits:

| Amount k | `a << k` | `a >> k` | `a <<< k` | `a >>> k` |
| --- | --- | --- | --- | --- |
| 0 through n − 1 | as in S3b | as in S3b | as in S3b | as in S3b |
| n or more | 0 | 0 | turns left by k mod n | turns right by k mod n |
| negative | `a >> −k` | `a << −k` | `a >>> −k` | `a <<< −k` |

`a << k` is floor(a · 2^k) and `a >> k` is floor(a · 2^−k), each kept to the
word, so a shift by the width or more pushes every bit out and a negative
amount shifts the other way. A rotation is periodic, so it turns by k modulo
n. This is a choice, and not the common one. C leaves a shift by the width or
more undefined, and Java and x86 reduce a 32-bit shift's amount modulo 32, so
there `x << 32` gives back x while two shifts by 16 give 0. A specification
cannot inherit either answer: undefined behavior is not a meaning, and the
machine's answer breaks the identity that two shifts by 16 are one shift by
32. Orange gives the arithmetic's answer at every amount, and a backend that
compiles a shift to an instruction that reduces its amount must add the
comparison that makes the answer come out right.

RC6 shows what that buys. Its paper defines `a <<< b` as a rotation to the
left by the amount in the least significant lg w bits of b, which for 32-bit
words is b modulo 32, exactly Orange's rotation by a word. So the key
schedule and the rounds are written as the paper writes them, with no mask:

```orange
// Key schedule, v = 132 steps of mixing:
//   A = S[i] = (S[i] + A + B) <<< 3
//   B = L[j] = (L[j] + A + B) <<< (A + B)
let a1: Word[32] = (s[k % 44] + a + b) <<< 3;
let b1: Word[32] = (l[k % 4] + a1 + b) <<< (a1 + b);

// Encryption, twenty rounds of
//   A = ((A ^ t) <<< u) + S[2i]; C = ((C ^ u) <<< t) + S[2i + 1]
(b, ((c ^ u) <<< t) + s[2 * i + 1], d, ((a ^ t) <<< u) + s[2 * i])
```

The [RC6 fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3r/valid-rc6.or) states the paper's
test vectors for 128-bit keys as tests, each run both ways:

```console
$ orangec test compiler/fixtures/s3r/valid-rc6.or
test "RC6 paper, 128-bit key 1: encryption" ... ok
test "RC6 paper, 128-bit key 1: decryption" ... ok
test "RC6 paper, 128-bit key 2: encryption" ... ok
test "RC6 paper, 128-bit key 2: decryption" ... ok
4 tests: 4 passed, 0 failed
```

A third program reads bits at positions a loop computes. BitRev7, in FIPS
203 section 4.3, reverses the seven bits of an index, and ML-KEM's
transform takes its constants as powers of 17 in that order:

```orange
spec bit_rev7(r: Word[8]) -> Word[8] {
  for i in 0..7 with b: Word[8] = 0 { b | (((r >> i) & 1) << (6 - i)) }
}
```

The [zetas fixture](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/fixtures/s3r/valid-zetas.or) derives all 128
constants of the transform and all 128 of its multiplication this way, and
its tests reproduce the start of both tables in FIPS 203's Appendix A.

A literal amount keeps its old rule. `x >>> 32` written on a `Word[32]` is
still `ORC0216`, now labeled "a literal amount is from 0 through 31", because
a literal names a fixed bit position, and one past the width is far more
often a slip than a wish for 0. So is a literal with a sign. Written in any
other way, as `x << (32)` or through a name, the same number is computed and
shifts every bit out. As an index, a shift by a computed amount ranges over
its whole type, since the range analysis of S3g never follows an amount, so a
table read by a nibble at a computed position masks it:
`ones[(x >> (4 * i)) & 15]`.

A computed amount costs one step, whatever its size. The evaluator reads
only its sign, whether its magnitude has more than 64 bits, and its low 64
bits, which settle every width, so `x <<< k` costs the same with k of 16,384
bits as with k = 3. That is a statement about steps, not time. A rotation by
a secret amount is where RC5 and RC6 drew the attention of timing analysis:
on a processor without a barrel shifter a shift takes time that grows with
its amount. What a backend makes of a shift by a possibly secret amount, a
fixed ladder of conditional rotations by 1, 2, 4, 8, and 16 or a refusal
under a constant-time profile, belongs to its leakage model, as a lookup at a
secret index does since S3g.

S3r adds one Core node, `shift-by`, and no token, reserved word, diagnostic
code, or command. Every source S3q accepted keeps its Core, values, output,
and steps, since each of its amounts was a literal below the width.

## From bytes to a value

It is worth following one line through the compiler, because each step is a
permanent phase rather than a shortcut. Take `spec negative() -> Int { -0x2a }`.

The lexer reads bytes and produces tokens with exact spans: the reserved word
`spec`, the identifier `negative`, two parentheses, the arrow, the identifier
`Int`, a brace, a minus sign, the integer token `0x2a`, and a closing brace. It
assigns no numeric value; `0x2a` is still only a spelling. The parser
recognizes the typed `spec` tail and builds a syntax node that records the
sign, the integer token, and the type syntax, each with its span. Semantic
analysis then does three separate things: it resolves `Int` to the
mathematical integer type, decodes the hexadecimal magnitude 42, and applies
the sign to obtain -42, checking the magnitude bound along the way. The result
is lowered into the Typed Reference Core, a small typed representation that
knows nothing about spelling. Finally the evaluator reads the Core and prints
`tour::negative: Int = -42`.

A call follows the same chain with more work in the middle. In
`square(square(2))`, the parser builds a call node around a call node around a
literal. Semantic analysis finds that `square` names a typed `spec` in the
module, checks that it takes one argument, checks that argument against `Int`,
and records an edge in the call graph, which must stay acyclic. The Core stores
the body in postorder: the literal, then the inner call, then the outer call,
each tagged with its type. The evaluator runs that sequence under a step budget
and a limit of 256 call frames.

Nothing in that chain is a stand-in. Each phase is bounded, deterministic, and
tested on its own, and each is the phase that later slices will extend.

## Diagnostics

Errors carry stable codes, precise spans, and a note explaining the rule. A
duplicate declaration points at both places:

```text
error[ORC0201]: duplicate spec function `same`
 --> <stdin>:4:8
  |
4 |   spec same() {}
  |        ^^^^ this declaration repeats a name in the same namespace
 ::: <stdin>:3:8
  |
3 |   spec same() {}
  |        ---- first declaration is here
  = note: `spec` and `impl` use separate declaration namespaces
```

The code families follow the phases. `ORC00xx` codes are lexical, `ORC01xx`
parse, `ORC02xx` semantic, and `ORC0301` evaluation resource exhaustion.
`ORC10xx` codes belong to the command line itself: unreadable files, invalid
UTF-8, oversized input, and similar. Once a code is assigned, it keeps its
meaning; wording can improve, but a code is never reused for a different error.
[Appendix A](/book/appendix-a/) lists them all.

A few rules show how the phases divide the work. `spec x() -> Word[12] { 1 }`
parses, then fails semantic analysis with `ORC0204` because only widths 8, 16,
32, and 64 are supported. `spec x() -> Word[8] { -1 }` fails with `ORC0206`, a
negative word literal. Two declarations named `spec x` fail with `ORC0201`,
while `spec x` and `impl x` together are fine. A stray `@` fails lexing with
`ORC0001` and is never parsed at all.

The expression slice adds codes in the same families: `ORC0108` for ungrouped
operators, and `ORC0211` through `ORC0218` for unknown names and functions,
wrong argument counts, type mismatches, undefined operators, bad shift and
rotation amounts, call cycles, and repeated parameter names. A cycle is
reported once, at the call that closes it:

```text
error[ORC0217]: call cycle `even` -> `odd` -> `even`
 --> <stdin>:4:29
  |
4 |   spec odd(n: Int) -> Int { even(n) }
  |                             ^^^^^^^ this call closes the cycle
  = note: a `spec` may not depend on itself; recursion is not part of Orange 2026
```

The binding slice adds `ORC0219` for a name bound twice and `ORC0220` for a
conversion whose operand has no type of its own, such as `(1 + 2) as Word[8]`,
where nothing says which ring the addition belongs to. A name used before its
binding is `ORC0211`, and the error also points at the binding that comes
too late. The array slice adds `ORC0221` for an unsupported length, `ORC0222`
for a literal with the wrong number of elements, `ORC0223` for an index past
the end, and `ORC0224` for an index on a value that is not an array. The loop
slice adds `ORC0225` for a loop range that is empty or reaches past 65536 and
`ORC0226` for an index built from anything but literals and loop indices, and
it reuses `ORC0219` for a loop name that repeats a name in scope and `ORC0223`
for a computed index whose range leaves the array. The condition slice adds
`ORC0227` for a comparison whose operands have no type of their own, such as
`1 < 2`, and reuses `ORC0214` for a condition that is not a `Bool` and
`ORC0215` for an operator that a type does not have, such as `<` on `Bool`
values or `&&` on words. The lookup slice adds no code. It narrows `ORC0226` to
an `Int` index without a bound and reports a word index whose range leaves its
array as `ORC0223`, naming the range. The module slice adds `ORC0228` for a
`use` that names no module of the program, `ORC0229` for a call qualified by
a module its module does not use, `ORC0230` for a module that uses itself or
a cycle of uses, and `ORC0231` for two modules of one name or a module used
twice. The modular slice adds `ORC0232` for a modulus that is not a constant
from 2 through 2^521 − 1, or a `Mod` without one, and `ORC0233` for a `type`
declaration that names a built-in type or repeats a name, and it reuses
`ORC0207` for a residue literal out of range, `ORC0214` for a residue of
another modulus, and `ORC0215` for an order, remainder, or bitwise operator
on residues. The block slice adds no code: a malformed block is `ORC0101`
with a note that describes a block, a block of more than 256 bindings is
`ORC0106`, a binding that repeats a name in scope is `ORC0219`, and a name
read outside its block is `ORC0211`, pointing at the binding it might mean.
The tuple slice adds `ORC0234` for `.k` on a value that is not a tuple, and
reuses `ORC0203` for a tuple of tuples or an array of tuples, `ORC0214` for a
tuple of the wrong length or where no tuple is wanted, `ORC0223` for a
position the tuple lacks, `ORC0215` for an operator on a whole tuple,
`ORC0224` for an index into a tuple or an update of one, and `ORC0101` and
`ORC0106` for a malformed or oversized tuple, tuple type, or pattern.
The byte slice adds `ORC0009` for a malformed hex string, `ORC0235` for a
character in a byte string that is not printable ASCII, and `ORC0236` for a
slice whose length is not the same positive number at every step, and it
reuses `ORC0003` for an unterminated hex string, `ORC0221` for an empty or
oversized byte string, `ORC0222` for a byte string, join, or slice of the
wrong length, `ORC0224` for a join, slice, or slice update of a value that is
not an array, `ORC0226` for a slice bound that is neither a literal nor a
loop index, `ORC0223` for a slice that leaves its array, `ORC0214` where no
array is wanted, `ORC0108` for `++` beside another operator, and `ORC0101`
for a slice with no bounds or with a step. The size slice adds `ORC0237` for a
size built from anything but integer literals and size parameters, `ORC0238`
for a size's range that is empty or has a bound over 65536, a function of
more than 256 instances, a size outside its range, and a call that fits no
instance, and `ORC0239` for a call with the wrong number of sizes or one that
fits more than one instance, and it reuses `ORC0218` and `ORC0219` for a name
that repeats a size parameter's, `ORC0221` and `ORC0225` for a length or a
loop bound whose value in an instance is out of range, `ORC0205` for a part
of a size that is too large, `ORC0217` for a cycle between instances,
`ORC0232` for a modulus written with a size, and `ORC0101` for a malformed
size parameter, size, or sized call. The byte-order slice adds `ORC0240` for
words converted to words of a different number of bits, and it reuses
`ORC0215` for a byte order between two numbers or on a type that is neither
words nor a number, `ORC0220` for an operand with no type of its own,
`ORC0214` for a target other than the type expected, `ORC0221` for a target
of more than 256 words, and `ORC0108` for an array type after `as` without a
byte order. The type-parameter slice adds `ORC0241` for a type listed twice,
a type entry that is not listed or not a type, and a call that fits no
instance by its arguments' types, and it reuses `ORC0233` for a type
parameter named like a built-in or declared type, `ORC0218` for one named
like another parameter in brackets, `ORC0237` for a size inside a listed
type, `ORC0238` for more than 256 instances, `ORC0239` for a wrong number of
entries or a call that several instances fit, `ORC0211` for a type
parameter's name used as a value, and `ORC0101` for a malformed list. The
length slice adds no language code: its limits are the old codes with 65536
in their messages, a number too wide for the evaluator is the `ORC0301` of
every exact integer, and `orangec` adds `ORC1016` for a `--spec` or
`--function` name that selects nothing, and for an analysis whose selector
or shape the command cannot take, and `ORC1017` for an
analysis whose bits, table, or layer the search cannot accept. A step overrun
during that analysis is still `ORC0301`. The test slice adds `ORC0242` for a
test's title that is empty, longer than 128 bytes, not printable ASCII,
holding a backslash, or repeating another's, and it reuses `ORC0101` for a
test without a quoted title or a body, `ORC0214` for a claim that is not a
`Bool`, `ORC0227` for a comparison of two arrays or tuples both written out,
and `ORC0215` for an order on arrays or tuples. The amount slice adds no code:
a literal amount past the width or with a sign is still `ORC0216`, labeled
with the amounts a literal may be, and a computed amount of another type is
the `ORC0214` of an expected `Int`.

One mistake is never reported twice through its consequences. A call to an
unknown function stops there, without complaints about its arguments, and a
parameter or binding whose type was already rejected is not rejected again at
each use.

## The command line

`orangec` has twelve commands. `analyze` computes the properties of one
checked function. An S-box or a Boolean function is evaluated at every
input. A linear layer with `--linear` is checked at every input when it has
at most 16 bits. A wider layer is checked only at zero, at each single-bit
input, and at each two-bit input: the summary says that shows no term of
degree 2 and that higher degrees are unchecked. The branch numbers are those
of the matrix read from zero and the single-bit inputs, or they read
`not computed` when the search is too large. With `--layer` and `--rounds`
it bounds the trails of a small substitution-permutation network.

```text
orangec [OPTIONS] <check|eval|lex> <FILE>...
orangec eval [--steps <N>] [--spec <NAME>]... [--stats] <FILE>
orangec test [--steps <N>] [--stats] <FILE>
orangec fmt <FILE>
orangec fmt --check <FILE>...
orangec doc <FILE>
orangec replay --function <MODULE::NAME> [--instance <N[,N...]>]
               --witness <FILE> [--steps <N>] [--stats] <SOURCE>
orangec analyze --function <MODULE::NAME> [--instance <N[,N...]>]
                [--bits <N[,M]> | --linear [--word <W>]]
                [--layer <MODULE::NAME> --rounds <R>]
                [--table <TABLE>] [--steps <N>] [--stats] <SOURCE>
orangec keygen [--scheme <NAME>] [-o <FILE>]
orangec <enc|dec> [--key <FILE>] [--scheme <NAME>] [-o <FILE>] <FILE>
orangec schemes [<NAME>...]
```

- `check` performs lexical, syntactic, and semantic validation of one or more
  sources and is silent on success.
- `eval` validates exactly one program and prints the value of each typed
  `spec` without parameters of its root module. `--steps N` sets its step
  budget, from 1 through 1,073,741,824; `--spec NAME`, repeatable, evaluates
  only the functions named; and `--stats` reports on standard error the
  steps each function used, as
  [Vectors at full length](/book/chapter-8/#vectors-at-full-length) shows. It runs no test.
- `test` validates exactly one program and runs its root module's
  known-answer tests in source order, printing `ok` or `FAILED` for each on
  standard output and exiting with status 1 when any fails; it takes
  `--steps` and `--stats` as `eval` does, as
  [Known answers beside the algorithm](/book/chapter-8/#known-answers-beside-the-algorithm)
  shows.
- `lex` prints the deterministic token stream.
- `fmt FILE` prints one complete formatted source; `fmt --check FILE...`
  checks sources without printing formatted text or changing files.
- `doc FILE` prints a standalone offline HTML reference for one parsed source.
- `replay` validates one program and reference-evaluates one selected Boolean
  function/instance for a typed local witness file; both completed Boolean
  outcomes use status 0.
- `analyze` reads the modules a program imports the way `replay` does, then
  computes the exact metrics of one checked S-box or Boolean function, the
  branch numbers of a linear layer, or the bounded trail weights of a small
  substitution-permutation network. `--function` and `--instance` select that
  function, as they do for `replay`. `--bits`, `--linear`, `--word`,
  `--table`, `--layer`, and `--rounds` belong to `analyze` alone, and
  `--rounds` is a canonical decimal from 1 through 32. `--steps` and
  `--stats` apply to `analyze` as well.
  A clean run is not a proof that a cipher is secure, not a constant-time or
  side-channel check, and not a verification of the implementation. It
  reports properties of the one function it was given.
- `keygen`, `enc`, `dec`, and `schemes` seal files with authenticated ciphers
  written in Orange. `orangec keygen` makes a key, `orangec enc FILE` writes
  `FILE.orange`, and `orangec dec FILE.orange` writes the file back only when
  every chunk is authentic. A scheme is any Orange program with the
  specifications `seal`, `open`, and `authentic`, and it may use other
  modules; XChaCha20-Poly1305, the default, ChaCha20-Poly1305, and
  Ascon-AEAD128 are built in. The [scheme guide](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/compiler/schemes/README.md)
  gives the interface and the sealed-file format, and states the limits: the
  ciphers run on the reference evaluator, which is not constant-time, nothing
  about them is verified, and keys are stored unencrypted.

`check`, `eval`, `test`, `replay` and `analyze` treat each source as the root of a
program and read the modules it uses from beside it, as
[Standards built on standards](/book/chapter-8/#standards-built-on-standards) describes; `lex`,
`fmt` and `doc` read only the source they are given.

The [formatter contract](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/FORMATTER_2026.md) defines a syntax-only tool. It uses
the parsed structure to lay out whitespace between tokens, preserving every
token's spelling and each comment's bytes, order and anchor. Before returning
text it re-lexes and re-parses the bounded result; formatting that result again
must leave it byte-identical. Generated layout whitespace uses LF, while bytes
inside strings and comments are retained. Formatting does not load imports or
check types. It changes source bytes, spans and digests and does not preserve
or migrate source-bound proof/evidence identities. It adds no proof claim and
leaves the language marker unchanged.

The [documentation generator](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DOCUMENTATION_2026.md) describes the module's
imports, aliases, specifications, implementation declarations and tests in
source order, with written signatures, finite domains, unique ordinal anchors
and source locations. It includes a full escaped source listing with comments;
source-derived text cannot introduce HTML, scripts or external assets. Output
is bounded and deterministic and adds no ambient filename, host path or date.
It describes parsed source, with no type checking, imported-module loading,
evaluation or test pass status. It provides no proof/evidence identity or
checked claim matrix. The remaining product documentation and complete 1.0
obligations stay explicit in the [execution record](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RELEASE_1_0_EXECUTION.md).

The [local witness contract](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/WITNESS_REPLAY_2026.md) defines a complete outer
argument list using exact current value spellings. Checked parameter types
supply widths, shapes and residue moduli; no expression or implicit reduction
is accepted. `--function MODULE::NAME` selects a Boolean specification and
`--instance N[,N...]` names its numeric finite-instance vector. The command
prints `falsified` or `holds_for_this_witness`, actual arguments and parameter
types; it runs within bounded decoding and evaluation budgets. It establishes
no universal property, selected solver format, authoritative atomic claim or
source/proof/evidence identity. D-009 remains without actual candidate runs.

`-` reads UTF-8 source from standard input. `--edition 2026` selects the
edition explicitly. `--version` prints
`orangec 0.0.1 (Orange edition 2026; implemented slice S3u)`. The slice
identifies implemented behavior, not its proposal's acceptance or a release.
The exit status is 0 on success, 1 when compilation or I/O fails, and 2 for a
usage error. Output streams are bounded like everything else. A compiler-phase
failure makes `eval` print no values at all; if writing the output itself
fails, `eval` exits with status 1, although a prefix the stream already
accepted may remain, and that prefix is never reported as a result.

A separate workbench, [Tabula](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/tabula/README.md), puts `orangec` beside an
editor in the browser. It runs `check`, `eval`, and `lex` as you write and
shows their diagnostics, values, and tokens next to the source and this book.
It is a tool for writing Orange, not part of the language, and it reports only
what `orangec` reports.

## Conformance

The specifications are backed by executable conformance. The lexical and
grammar document defines thirteen rule identifiers, `S2-SOURCE-01` through
`S2-DETERMINISM-01`, each mapped to named tests that a conformance runner
checks. The typed-literal semantics adds its own rule index and an external
black-box corpus: three valid and seven invalid sources that the runner feeds
through `check` and `eval` twice each, comparing exact codes, messages, and
locations. The expression specification does the same with 28 rule
identifiers and fourteen sources, five valid and nine invalid. Two of the
valid sources are the SHA-256 round functions and the ChaCha20 quarter round,
checked against the values published with the standards, and generated
sources pin every resource limit at its exact boundary. The binding and
conversion specification adds 17 rule identifiers and ten sources, five valid
and five invalid, including SHA-256 message words and round 0 of the "abc"
example and the ChaCha20 quarter round written with named steps. The array
specification adds 17 rule identifiers and eight sources, three valid and five
invalid, including the whole ChaCha20 block function, checked against the
serialized block of RFC 8439 section 2.3.2, and the SHA-256 message schedule and
first two rounds of the "abc" example over a `Word[32]^8` state. The loop
specification adds 18 rule identifiers and seven sources, three valid and four
invalid, including the whole SHA-256 hash of both FIPS 180-4 examples and the
ChaCha20 encryption of RFC 8439 section 2.4.2, and generated sources pin the
65536 loop bound and show two nested maximal loops stopped by the evaluation
step budget. The condition specification adds 18 rule identifiers and eight
sources, four valid and four invalid, including X25519 against the first test
vector of RFC 7748, Poly1305 against RFC 8439 section 2.5.2, and the
ChaCha20-Poly1305 seal of section 2.8.2; generated sources run a conditional
of 4096 arms and show that a branch the step budget could never finish costs
nothing unless it is chosen. The lookup specification adds 10 rule identifiers
and four sources, two valid and two invalid, including AES-128 against FIPS 197
and a table-driven CRC-32 against its check value; generated sources spend the
step budget exactly and invert a permutation of 256 bytes by updates keyed by
its own values. The module specification adds 10 rule identifiers and four
programs over six modules, one valid and three invalid, in which SHA-256,
HMAC, and HKDF are three modules that reproduce the examples of FIPS 180-4,
RFC 4231, and RFC 5869; generated programs read a diamond of uses once each
and link a chain of 64 modules. The modular arithmetic specification adds 13
rule identifiers and seven sources, three valid and four invalid, including
X25519 and Poly1305 over their fields against RFC 7748 and RFC 8439 and
constants of ML-KEM, Ed25519, and P-256; generated sources pin 64 `type`
declarations, the widest modulus, 2^521 − 1, and residue literals and indices
at the edges of their ranges. The blocks specification adds 8 rule
identifiers and six sources, three valid and three invalid, including SHA-256
and X25519 whose rounds name their values inside their loops, against FIPS
180-4 and RFC 7748; generated sources pin a step and a branch of 256 bindings
and of 257. The tuples specification adds 8 rule identifiers and seven
sources, four valid and three invalid, including SHA-256 with a through h as
eight named accumulators, the ChaCha20 quarter round and block, and
Ascon-Hash256, against FIPS 180-4, RFC 8439, and the Ascon designers' known
answers; generated sources pin tuple types, tuples, and patterns of 16 parts
and of 17. The bytes specification adds 10 rule identifiers and six sources,
three valid and three invalid, including HMAC-SHA-256 with RFC 4231's keys
and messages as that RFC prints them and ChaCha20-Poly1305 with RFC 8439's
plaintext as text, against FIPS 180-4, RFC 4231, and RFC 8439; generated
sources pin byte strings and hex strings of 256 bytes and of 257. The sizes
specification adds 10 rule identifiers and six sources, four valid and two
invalid, including SHA-256 written once for every message of 1 through 119
bytes, HMAC-SHA-256 over it, and Poly1305 written once for every message of 1
through 255 bytes, against FIPS 180-4, RFC 4231, and RFC 8439; generated
sources pin functions of 256 instances and of 257 and 320, and a size's bound
of 65536 and of 65537. The byte order specification adds 8 rule identifiers
and eight sources, six valid and two invalid, including SHA-256, SHA-512,
ChaCha20, Poly1305, and X25519 reading and writing their words in the orders
their standards name, against FIPS 180-4, RFC 8439, and RFC 7748; a generated
source converts words of every width in both orders to words of every width
and to `Int` against a reference computed in the runner, and converts the
widest array to an `Int` and back, and an array one element longer is no
type. The type parameters specification adds 10 rule identifiers and five
sources, three valid and two invalid, including exponentiation, inversion,
and Euler's criterion written once for five prime fields and SHA-256 and
SHA-512 sharing one round, against RFC 7748, RFC 8032, RFC 8439, FIPS 203,
FIPS 204, and FIPS 180-4; a generated source evaluates the 256 instances of
one function over 64 residue types and four sizes, and one type more is 260
instances and an error. The lengths specification adds 11 rule identifiers
and three sources, two valid and one invalid, including RFC 8439's 375-byte
and 265-byte vectors written as the RFC prints them and a table of all 65,536
powers of 3 modulo 2^16 + 1 read by 16-bit words, against the vectors of
RFC 8439 pinned in the D-011 suite; generated sources pin literals and byte
strings of 65,536 elements and of 65,537, and every step budget, selection,
report, and usage error of the three new options. The tests specification
adds 12 rule identifiers and five sources, two valid, one whose tests fail,
and two invalid, including seven of RFC 8439's examples and test vectors
written as tests, with inputs and expected bytes as the RFC prints them;
generated sources pin titles at and past their limits, that only the root's
tests run, a test that stops, every option and usage error of `orangec test`,
and comparisons of 65,536 bytes that cost the same wherever they differ. The
computed amounts specification adds 10 rule identifiers and six sources, four
valid and two invalid, including RC6 with its paper's 128-bit-key vectors run
both ways, SHA3-256 with NIST's examples, and ML-KEM's transform constants
derived as FIPS 203 defines them; generated sources compare every shift and
rotation at every width with its definition for amounts of every sign and
size and of every word width, show amounts of 2 through 16,384 bits costing
the same steps, and refuse every literal amount at the width or with a sign.
The complete test suite covers the lexer, parser, semantic analyzer, Core, evaluator,
diagnostics, resource limits, and command-line behavior.

The documents are careful about what those tests mean. A named test is evidence
for the recorded implementation revision; it does not prove that a rule is
complete or that the parser is correct. That caution is not modesty. It is the
same discipline Chapter 2 applied to claims, applied to the project's own
compiler.

## Arrays of rows

A cryptographic state or polynomial vector often has two dimensions. S3s
makes that shape a type, using the aliases Orange already has:

```orange
edition 2026;
module rows {
  type Row = Word[32]^4;
  type Matrix = Row^4;
  spec diagonal(m: Matrix) -> Row {
    for i in 0..4 with out: Row = [0; 4] { out with [i] = m[i][i] }
  }
  test "diagonal" { diagonal([[1, 2, 3, 4]; 4]) == [1, 2, 3, 4] }
}
```

The outer index chooses a row; the inner index chooses its scalar. Each is
proved in range on its own axis. The rows have one exact type, so a short row,
a different word width, or another residue modulus is rejected. A matrix
holds at most 65,536 scalars, including the product of both dimensions.
Arrays of tuples remain outside this bounded slice, and a third and fourth
dimension arrive with S3u, below.

Rows are immutable values. Updating one row can share every other row, and
slices and joins preserve the row type. Equality visits every row and every
scalar with deterministic interpreter costs; those costs are not a timing
guarantee. A byte-order conversion must select a row explicitly, because a
matrix has no implicit flattening order.

The [nested-array specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/NESTED_ARRAYS_2026.md) and
[OEP-0023](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0023-orange-2026-nested-arrays.md) record S3s as
implemented and in owner review. It supplies vocabulary for the polynomial
vectors of the development plan, without accepting a ring transformation,
proof rule, machine layout, or backend. The conformance corpus includes
quadratic-pair arithmetic with hand-derived answers; it makes no complete
ML-KEM claim.

## A modulus for each finite size

A size can now describe a residue domain as well as an array length:

```orange
edition 2026;
module rings {
  spec add[m in 2..8](a: Mod[m], b: Mod[m]) -> Mod[m] { a + b }
  spec result() -> (Mod[3], Mod[4]) { (add[3](2, 2), add[4](2, 2)) }
  test "distinct domains" { (add[3](2, 2) == 1) && (add[4](2, 2) == 0) }
}
```

The size range is finite and excludes its upper endpoint. The analyzer checks
every declared instance, including those no call selects. Each has a concrete
modulus from 2 through 2^521 − 1, and that exact integer remains part of its
type. An invalid unused instance rejects the definition. The function's own
sizes may also occur in expressions such as `Mod[(1 << bits) - 19]`, in body
annotations and conversions, and in direct explicit type arguments. Global
aliases and finite type lists remain concrete; this is finite specialization,
not universal dependent typing. The [static-modulus specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/STATIC_MODULI_2026.md)
and [OEP-0024](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0024-orange-2026-static-moduli.md) remain
in owner review.

The [five-limb field definitions](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/algorithms/x25519/field25519-limbs.or)
implement OEP-0022 P2: reconstruction, abstraction and tight/loose/canonical
predicates, followed by addition, carrying and canonicalization. Partial P4
mathematical preparation adds multiplication, biased subtraction, dedicated
squaring and multiplication by a24. Five exact `Int` accumulators hold the
folded products, and three normalization passes expose each digit array and
top carry before canonicalization. Biased subtraction adds the limb form of
2p and carries limbs below 4B on its own schedule; dedicated squaring doubles
off-diagonal pairs; a24 coefficients are kept in `Int` because they exceed
`Word[64]`. Boundary and generated binary-reference tests check coefficients,
differences, squares, a24 products and every carry stage; the third product
pass can be needed to keep every output digit below 2^51. These definitions
supply no native wide multiplication primitive and do not complete P4.
Transparent type aliases do not enforce the predicates, and these tests are
not P3 checked refinement proofs. The
[complete 1.0 execution record](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/RELEASE_1_0_EXECUTION.md) keeps those later
proof, compiler, corpus and release obligations explicit.

## Four dimensions, one index each

Lattice cryptography has more than two dimensions. FIPS 203 writes
ML-KEM's public matrix as a k × k array of polynomials, each 256
coefficients modulo q = 3329. S3u names each dimension with one more
`type` declaration, up to four, and lets an update name one index per
dimension it reaches:

```orange
edition 2026;
module lattice {
  type Zq = Mod[3329];
  type Poly = Zq^4;
  type Vector = Poly^2;
  type Matrix = Vector^2;
  spec transpose(a: Matrix) -> Matrix {
    for i in 0..2 with t: Matrix = a {
      for j in 0..2 with u: Matrix = t { u with [i][j] = a[j][i] }
    }
  }
  spec sample() -> Matrix {
    [[[1, 2, 3, 4], [5, 6, 7, 8]], [[9, 10, 11, 12], [13, 14, 15, 3328]]]
  }
  test "the transpose exchanges A[0][1] and A[1][0]" {
    let t: Matrix = transpose(sample());
    (t[0][1] == [9, 10, 11, 12]) && (transpose(t) == sample())
  }
  test "one coefficient, three indices deep" {
    let b: Matrix = sample() with [1][1][3] = sample()[1][1][3] + 1;
    b[1][1] == [13, 14, 15, 0]
  }
}
```

Polynomials here have four coefficients so the example fits on a page;
the conformance corpus uses all 256. `u with [i][j] = a[j][i]` replaces
one polynomial of the matrix, and `with [1][1][3]` one coefficient of one
polynomial. A path means the nested updates it abbreviates,
`m with [i] = (m[i] with [j] = v)`, and every index is proved in range on
its own axis before the program runs. Its cost is one step for each array
of up to 64 elements it copies, so it is cheaper than the nested form,
which also selects each row. Every axis is positive, and the product of all
of them is at most 65,536 scalars, so a 16 × 16 × 16 × 16 array fits.

Repeated powers are still not types. `Zq^256^2^2` reads in mathematics as
a tower of exponents, and a declaration names the object a standard names:
a polynomial, a vector, a matrix. The display spells the type from the
innermost dimension out, as `((Mod[3329]^256)^2)^2`, for readers, not as
source.

The S3u corpus writes AES-128's state as FIPS 197 draws it, a 4 × 4 array
`s[r][c]`, and reproduces Appendix A.1's key expansion and the cipher
examples of Appendices B and C.1; SHA3-256 with its lanes `A[x][y]` as
FIPS 202 indexes them; and ML-KEM-512's NTT over a 2 × 2 matrix of
polynomials, checked against Appendix A's zetas, against reduction modulo
each of its 128 quadratic factors, and against multiplication in
Z_q[X]/(X^256 + 1). The [array dimensions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DIMENSIONS_2026.md)
and [OEP-0025](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/governance/oeps/OEP-0025-orange-2026-array-dimensions.md)
record S3u in owner review. The corpus tests representation and arithmetic;
it makes no complete ML-KEM claim.

## What Orange 2026 does not have

The list of absences is long, and it is printed in the specifications rather
than hidden: imports of names into scope, module paths and packages, modules
that take modules as parameters, attributes, visibility, type parameters of
`type` declarations, bounds or classes of types, types and sizes reasoned
about for all their values at once, lists of types named once for several
functions, sizes fitted outside the finite argument and expected-result
types, contracts, effects, statements other than `let`, mutation,
shadowing, type inference, arrays of rank five or more, tuples of tuples, arrays of
tuples, operators other than `==` and `!=` on whole tuples, records with named fields, indices
narrowed by conditions, slices at positions computed from data, empty arrays,
arrays of more than 65,536 elements, step budgets written in a source,
an order on arrays or tuples, tests with parameters or expected failures,
text beyond printable ASCII, conversions of
arrays other than words, bit orders, loops over ranges computed at run time, early exit, short-circuit
operators, conditionals without `else`, blocks as expressions of their own,
moduli computed at run time,
unbounded modulus parameters, sizes on `type` declarations, distinct types by declaration, extension
fields, signed words, shifts of `Int`, arithmetic shifts, recursion, typed
implementations,
failure values, secrecy labels, proof terms, claims, games, targets, layout,
ABI, leakage behavior, lowering, optimization, code generation, packaging, and
releases.

That is not a finished language in miniature, and it does not pretend to be.
It is the smallest language whose every behavior is specified, bounded,
tested, and deterministic, built as the permanent foundation that later slices
extend. S3b is its first step past literals. It was built before the semantic
strata decision described in
[Chapter 3](/book/chapter-3/), and it assumes
only what every candidate gives the specification stratum: pure, total,
deterministic meaning over mathematical values. Accepting it is the owner's
decision, through OEP-0005, S3c's, which builds on it, through OEP-0006,
S3d's, which builds on S3c, through OEP-0007, S3e's, which builds on S3d,
through OEP-0008, S3f's, which builds on S3e, through OEP-0009, S3g's, which
builds on S3f, through OEP-0010, S3h's, which builds on S3g, through
OEP-0011, S3i's, which builds on S3h, through OEP-0012, S3j's, which builds
on S3i, through OEP-0013, S3k's, which builds on S3j, through OEP-0014,
S3l's, which builds on S3k, through OEP-0015, S3m's, which builds on S3l,
through OEP-0016, S3n's, which builds on S3m, through OEP-0017, S3o's,
which builds on S3n, through OEP-0018, S3p's, which builds on S3o,
through OEP-0019, S3q's, which builds on S3p, through OEP-0020, and S3r's,
which builds on S3q, through OEP-0021, and S3s's, which builds on S3r,
through OEP-0023, and S3t's, which builds on S3s, through OEP-0024, and
S3u's, which builds on S3t, through OEP-0025.
Orange 2026 is pre-alpha and makes no compatibility promise, but any change to
what the programs in this chapter mean has to arrive with an explicit,
documented migration. All twenty migrations so far are small: every source
that S3a accepted still has the same values and prints the same bytes under
S3b, every source S3b accepted does the same under S3c, every source S3c
accepted does the same under S3d, every source S3d accepted does the same
under S3e, every source S3e accepted does the same under S3f, every source
S3f accepted does the same under S3g, where it costs no more steps, every
source S3g accepted does the same under S3h, as a program of one module,
every source S3h accepted does the same under S3i, since it declares no type
and writes no modulus, every source S3i accepted does the same under S3j,
since it binds nothing in a step or a branch, every source S3j accepted does
the same under S3k, since it writes no tuple, every source S3k accepted
does the same under S3l, since it writes no string, `++`, or range in
brackets, every source S3l accepted does the same under S3m, since it
declares no size parameter and writes every length and bound as an integer,
every source S3m accepted does the same under S3n, since `big` or
`little` after `as` was a type's name only where S3n still reads it as one,
every source S3n accepted does the same under S3o, since it wrote no
braces after a size's `in`, every source S3o accepted does the same under
S3p, in the same steps, since its arrays hold at most 256 elements, every
source S3p accepted does the same under S3q, since none began a member with
`test` or compared arrays or tuples, and every source S3q accepted does the
same under S3r, in the same steps, since each of its amounts was a literal
below the width. Every source S3r accepted retains its values and costs
under S3s; rank-two type aliases and chained indices are newly admitted.
S3t retains S3s values and costs and admits own finite size names in modulus
expressions, while rejecting invalid concrete instances before evaluation.
S3u retains S3t values and costs; a third and fourth dimension and update
paths, both rejected before, are newly admitted.

