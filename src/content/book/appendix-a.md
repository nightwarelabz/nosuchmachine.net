---
title: "Appendix A: Current Grammar and CLI"
part: "Appendices"
order: 18
description: "A reference for the current grammar, types, operators, commands, and diagnostic families."
---

This appendix restates the implemented Orange 2026 surface for convenience.
The [lexical and grammar specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LANGUAGE_2026.md) and the
[typed-literal semantics](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SEMANTICS_2026.md) are normative, and the
[pure expression specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/EXPRESSIONS_2026.md), the
[bindings and conversions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BINDINGS_2026.md), the
[arrays specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ARRAYS_2026.md), the
[loops specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LOOPS_2026.md), the
[conditions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/CONDITIONS_2026.md), the
[lookups specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LOOKUPS_2026.md), the
[modules specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/MODULES_2026.md), the
[modular arithmetic specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/MODULAR_2026.md), the
[blocks specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BLOCKS_2026.md), the
[tuples specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TUPLES_2026.md), the
[bytes specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/BYTES_2026.md), the
[sizes specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/SIZES_2026.md), the
[byte order specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/ORDER_2026.md), the
[type parameters specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TYPE_PARAMETERS_2026.md), the
[lengths specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/LENGTHS_2026.md), the
[tests specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/TESTS_2026.md), the
[computed amounts specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/AMOUNTS_2026.md), the
[nested arrays specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/NESTED_ARRAYS_2026.md), the
[static moduli specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/STATIC_MODULI_2026.md), and the
[array dimensions specification](https://github.com/chasebryan/orange/blob/d794b4333c0500d7542d28b8b2ffe3cde5b1bf41/docs/DIMENSIONS_2026.md) are proposed under
OEP-0005 through OEP-0021 and OEP-0023 through OEP-0025 and in the owner's
review. Where this summary and those documents differ, they control.

## Grammar

The parser accepts exactly this grammar, with at most two tokens of
lookahead, except that `if` before `(`, `-`, `[`, the word `as`, or the word
`with` followed by `[` scans forward, without backtracking, for a brace group
followed by `else`, and a name followed by `[` scans forward, reading each
token at most twice over a whole source, for brackets that hold only
integers, names, a name's `[n]`, `+`, `-`, `*`, `/`, `%`, `^`, commas, and
parentheses followed by `(`, which make it a call with sizes or types:

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

Sources are valid UTF-8 of at most 16 MiB. Identifiers are ASCII. Integers
may be decimal, `0b` binary, or `0x` hexadecimal, with single underscores
between digits. `edition`, `module`, `spec`, `impl`, `game`, `proof`, and
`claim` are reserved; the last three have no grammatical role yet. `let`, `as`,
`for`, `in`, `with`, `if`, `else`, `use`, `type`, `hex`, `big`, `little`, `true`, and `false` are not reserved: `let`
starts a binding only at the start of a body, step, or branch item before a
name or a tuple pattern, `as` converts
only after a complete operand, `for` starts a loop only before a name, `in` and
`with` are words only in a loop's header, `in` also between a size's or a
type parameter's name and its bounds or list, `with` updates only after a complete
operand and before `[`, which begins one through four indices or one range, `if` starts a conditional only where a condition can
follow it, `else` is a word only after a conditional's value, `use` and `type`
start declarations only at the head of a module before its first function,
`Mod` takes a modulus only before `[`, `hex` begins a hex string only directly
before a quote, `big` and `little` are byte orders only directly after `as`
and before `(` or a name other than `as` and `with`, and `true` and `false`
are values only where no name of that spelling is in scope.
Line and
nested block comments are trivia. `<<`, `>>`, `<<<`, `>>>`, and `++` are
single tokens, matched longest first, and a string is a byte string of
printable ASCII and escapes or, when `hex` touches its opening quote, a hex
string of digit pairs and spaces. Operators from different groups, or two shifts,
two comparisons, or two divisions, may not share a level without parentheses, and a conversion or an update shares
a level with no operator and no other conversion or update. `^` after a declared
type gives its array length; anywhere else it is exclusive or. Expressions may
nest at most 64 levels deep, counting groups, tuples, calls, arrays, indices,
slices, loops, conditionals, updates, moduli, and prefix operators, and reach
height 256; a function declares at most 4 size parameters, 64 parameters,
and 256 bindings and has at most 256 instances, a loop's step
or a branch at most 256 bindings, a call supplies at most 4 sizes and 256
arguments, an array literal lists at most 65,536 elements, a byte string holds 1
through 65,536 bytes, a tuple type, a tuple, and a tuple pattern hold at most 16
parts, and a loop's bounds and a size parameter's bounds satisfy
0 ≤ a < b ≤ 65536. A module declares at most 64 `use` declarations and 64
`type` declarations, and a program holds at most 64 modules, its root
included.

## Types and values

| Type | Values | Displayed as |
| --- | --- | --- |
| `Int` | All mathematical integers (unbounded); a literal's magnitude may use at most 16,384 significant bits | Decimal, with `-` when negative |
| `Bool` | The truth values | `true` or `false` |
| `Word[8]` | The integers modulo 2^8, 0 through 255 | `0x` and 2 lowercase hex digits |
| `Word[16]` | The integers modulo 2^16 | `0x` and 4 lowercase hex digits |
| `Word[32]` | The integers modulo 2^32 | `0x` and 8 lowercase hex digits |
| `Word[64]` | The integers modulo 2^64 | `0x` and 16 lowercase hex digits |
| `Mod[m]` | The integers modulo a constant m from 2 through 2^521 − 1, as least residues 0 through m − 1 | Decimal |
| `T^n` | Sequences of exactly n values of a scalar type above, for n from 1 through 65,536 | The elements in order, separated by a comma and a space and enclosed in `[` and `]` |
| `A^n`, where a `type` name or a type parameter specialized to an array names an array of rank 1, 2, or 3 | n elements of that exact array, giving rank 2, 3, or 4; each axis is from 1 through 65,536 and the product of the axes is at most 65,536 scalars | The outer elements in order, each spelled as its type |
| `(T, U, ...)` | Tuples of 2 through 16 values, each of a scalar or array type above and never a tuple | The elements in order, separated by a comma and a space and enclosed in `(` and `)` |

No other type, width, or length is accepted; a name declared by `type` stands
for the type it names, including an array of rank two, three, or four.
Repeated `^` in one type remains rejected. A modulus is built from integer
literals, parentheses, and `+`, `-`, `*`, and `<<`. Inside one sized function
it may also use that function's own size names; a module-level alias stays a
constant. Two moduli are one type when their values are equal. Word and residue literals are never wrapped, truncated,
saturated, or coerced: a literal of `Mod[m]` has a magnitude less than m, and
`-n` stands for m − n. No value changes type implicitly. `e as T` converts
between any two scalar types other than `Bool`: it takes the integer value
of `e`, the least residue for a residue, and, for `Word[n]` or `Mod[m]`, its
residue modulo 2^n or m. The operand's type comes from its first
name, call, conversion, or index, so a conversion of literals alone is an
error. An array literal lists exactly as many elements as its type, and `x[k]`
selects the element at position k, which must be proved below the length
before anything runs. Further indices, as `m[i][j]`, select the next axis
the same way, and a slice ends the chain. An index is checked as the word type of its first name,
call, conversion, or element, and ranges over that type, narrowed by its
operators; otherwise it is an `Int` built from integer literals, loop indices,
and words converted with `as Int`, using `+`, `-`, `*`, `/`, `%`, and
conditionals. An update of one index, a fill, a join, a slice, or a slice update costs one
evaluation step per 64 elements of the array it builds, or part of 64, and a
byte string costs one. A path of several indices costs that charge for each
array it copies. No operator but `++`, and no conversion without a byte
order, applies to a whole array. An array's elements are scalars or, through
a `type` name or a type parameter specialized to an array, arrays of lower rank,
up to four dimensions; they are never tuples. A byte string `"..."`
of printable ASCII characters and the escapes `\"`, `\\`, `\n`, `\r`, `\t`,
`\0`, and `\xNN`, or `hex"..."` of hex digit pairs, is the array `Word[8]^n`
of its bytes. `a ++ b` is the elements of a followed by those of b, of one
element type. `x[a..b]` is the elements of x from index a up to but not
including b, `x with [a..b] = v` is x with them replaced by v, and an omitted
bound is 0 or the length. A slice's bounds are built from integer literals
and loop indices with `+`, `-`, and `*` by a constant, and are proved a fixed
positive distance apart and in range at every step.
A tuple lists exactly as many elements as its type, `p.k` selects element k,
counted from zero, and no operator, comparison, conversion, index, or update
applies to a whole tuple; neither a tuple's nor an array's elements are ever
tuples.
A `spec f[n in a..b, ...]` stands for one instance for each value of its
sizes, ordered with the first size changing slowest, and each instance is
checked as the function written out with those values; only the first
instance of a function in error is reported. A size is built from integer
literals and size parameters with `+`, `-`, `*`, `/`, `%`, prefix `-`, and
parentheses and computed exactly, with `/` and `%` Euclidean and total; it
writes an array length, a fill length, or a loop bound, and a size
parameter's name is an `Int` constant, which index and slice analysis read as
a literal. `f[s, ...](args)` calls the instance with those sizes, and
`f(args)` the one instance whose array parameters have the lengths of its
arguments. Sizes cost nothing at run time.
A type parameter `K in {T, U, ...}` lists distinct types, resolved once and
written without sizes; its name is a type in the function's signature and
body, never a value, and the function stands for one instance for each
combination of its sizes' values and types, with at most four parameters in
brackets and 256 instances. A call's entries are `Int`, `Bool`, a word, an
array of them, a `type` declaration's name, or the caller's type parameter,
matched by type equality; `f(args)` calls the one instance whose parameters
have its arguments' types, literal lengths deciding only where a type does
not, and among several, the one whose result has the type its place
expects. Types cost nothing at run time.
`e as big T` and `e as little T` convert words, a word or an array of words,
to words of the same number of bits, to `Int`, or to `Mod[m]`, and an `Int`
or a residue to words, through the number N the words spell, their first
word most significant for `big` and least significant for `little`; a number
becomes the words that spell its residue modulo 2 to the power of their
width, and words become N, or N modulo m. The operand's type is its first
typed leaf's, an array literal's or a fill's from its elements and its
length. A conversion in a byte order costs one evaluation step per 64 bits of
its width, or part of 64, and a conversion to `Mod[m]` also the cost of
`as Mod[m]`.

## Operators

| Expression | On `Int` | On `Word[n]` | On `Mod[m]` |
| --- | --- | --- | --- |
| `a + b`, `a - b`, `a * b` | Exact | Modulo 2^n | Modulo m |
| `-a` | Exact negation | Not defined; write `0 - a` | m − a, or 0 when a is 0 |
| `a & b`, `a \| b`, `a ^ b` | Not defined | Bitwise and, or, exclusive or | Not defined |
| `~a` | Not defined | Bitwise complement | Not defined |
| `a << k`, `a >> k` | Not defined | Logical shift left, right | Not defined |
| `a <<< k`, `a >>> k` | Not defined | Rotation left, right | Not defined |
| `a / b` | Euclidean quotient | Unsigned quotient | a times the inverse of b, or 0 when b has none |
| `a % b` | Euclidean remainder, 0 ≤ `a % b` < \|b\| | Unsigned remainder | Not defined |
| `a == b`, `a != b` | Equality, giving `Bool` | Equality, giving `Bool` | Equality, giving `Bool` |
| `a < b`, `a <= b`, `a > b`, `a >= b` | Order by value, giving `Bool` | Unsigned order, giving `Bool` | Not defined |

For every type, `a / 0` is 0, and `a % 0` is a where `%` is defined. On `Bool`, `!a`, `a && b`, and
`a || b` are negation, conjunction, and disjunction, evaluating every operand,
and `==` and `!=` compare. `if c { a } else { b }` has the type of both
branches and evaluates only the one its `Bool` condition chooses; an
`else if` chain is one conditional per arm.

An amount `k` written as one integer literal must be unsigned and from 0
through n − 1. Any other amount is an `Int` or a word, typed by its first
typed leaf: `a << k` is floor(a · 2^k) and `a >> k` is floor(a · 2^−k)
modulo 2^n, so a shift by n or more is 0 and a negative amount shifts the
other way, and a rotation turns by k modulo n, at one evaluation step
whatever k's size. Calls
name typed `spec` functions of the same module, or, as `m::f(...)`, of a
module `m` it uses, pass exactly one argument per parameter, and may not form
a cycle; nor may the uses of a program. A `let` binding states its type, is in
scope after its semicolon, and may not reuse the name of a parameter or another
binding. A tuple pattern, as in `let (s: T, c: U) = e;` or a loop's
`with (a: T, b: U) = e`, names each element of its value and states each
name's type, and each of its names follows the same rules.

## Commands

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

| Command | Behavior |
| --- | --- |
| `check` | Lexical, syntactic, and semantic validation; silent on success |
| `eval` | Validate one program, then print each typed `spec` without parameters of its root module as `module::name: Type = value`, and each instance of a sized one as `module::name[2]: Type = value` |
| `lex` | Print the deterministic token stream with byte spans |
| `fmt` | Print one formatted source or check sources without changing them |
| `doc` | Print standalone offline HTML for one parsed source |
| `replay` | Validate one program and reference-evaluate a Boolean specification for exact typed local arguments |
| `analyze` | Read imported modules as `replay` does, then compute the exact metrics of one checked S-box or Boolean function, the branch numbers of a linear layer, or the bounded trail weights of a small substitution-permutation network. A clean run reports properties of that one function. It is not a proof the cipher is secure, not a constant-time or side-channel check, and not a verification of the implementation |
| `test` | Validate one program, then run its root module's tests in source order, printing `test "TITLE" ... ok` or `... FAILED` for each and a count; status 1 when any fails |
| `keygen` | Make a random key for a scheme, mode 0600, never replacing a file |
| `enc` | Seal one file as `FILE.orange` with its key's scheme |
| `dec` | Open one sealed file; output is published only if every chunk is authentic |
| `schemes` | List the built-in schemes or check a scheme program |

Options are `--edition <YEAR>` (only `2026`, at most once), for `eval`,
`test`, `replay` and `analyze` `--steps <N>` (a step budget from 1 through 1,073,741,824, at most
once; default 1,048,576) and `--stats` (report each evaluated function's or
test's steps and the total on standard error, after the values or the
report), for `eval` only `--spec <NAME>` (evaluate only this function without
parameters; up to 64 names), for `fmt` only `--check` (check one through 256
sources without changing files; otherwise `fmt` requires exactly one source),
for `replay` and `analyze` `--function <MODULE::NAME>` and optional
`--instance <N[,N...]>` (an exact numeric finite-instance vector), for
`replay` only `--witness <FILE>`, for `analyze` only `--bits <N[,M]>` (the
low N input bits and M output bits), `--linear` (a linear layer over GF(2)),
`--word <W>` (the word width of a `--linear` layer, defaulting to the element's width, or to 8), `--table <TABLE>`
(`values`, `ddt`, `lat`, `bct`, `anf`, or `matrix`), `--layer <MODULE::NAME>`,
and `--rounds <R>` (a canonical decimal from 1 through 32), `--scheme <NAME>`
(a built-in name or a program path), `--key <FILE>` (default
`$XDG_CONFIG_HOME/orange/key`), `-o` or `--output <FILE>`, `--` to end option
parsing, `-h` or `--help`, and `-V` or `--version`. A file name of `-` reads
UTF-8 source from standard input, once per invocation. For `check`, `eval`,
`test`, `replay` and `analyze`, each `use m;` reads the module `m` from `m.or` beside the file that names it,
or from the current directory for standard input, once per program. Exit status is 0 on
success, 1 on a compile or input failure, and 2 on a usage error.

## Diagnostic families

| Codes | Phase | Examples |
| --- | --- | --- |
| `ORC0001`–`ORC0009` | Lexing | Unexpected character, unterminated comment or string, malformed integer, token budget, malformed hex string |
| `ORC0101`–`ORC0108` | Parsing | Expected syntax, unsupported edition, trailing syntax, parser budget, ungrouped operators |
| `ORC0201`–`ORC0242` | Semantic analysis | Duplicate function, parameter, or binding, unsupported type or word width, negative or out-of-range word, magnitude limit, unknown name or function, name used before its binding, argument count, type mismatch, undefined operator, shift amount, call cycle, conversion operand without a type, unsupported array length, wrong element count, index out of range, index on a non-array, loop range empty or too large, `Int` index without a bound, comparison whose operands have no type, a `use` naming no module, a call qualified by a module not used, a cycle of uses, a duplicate module, a modulus that is not a constant from 2 through 2^521 − 1, a `type` declaration naming a built-in type or repeating a name, `.k` on a value that is not a tuple, a byte string character that is not printable ASCII, a slice whose length changes or is not positive, a size built from anything but literals and size parameters, a size's range that is empty or too large, too many instances, a size outside its range, a wrong number of sizes, a call that fits no instance or several, words converted to words of a different width, a type listed twice, a type entry not listed or not a type, a call that fits no instance by its arguments' types, a test's title that is empty, too long, unprintable, or repeated |
| `ORC0250`–`ORC0252` | Formatting | Formatter resource limit, inconsistent result, source requiring formatting under `--check` |
| `ORC0260`–`ORC0261` | Documentation | Documentation resource limit or inconsistent construction |
| `ORC0270`–`ORC0274` | Witness replay | Noncanonical argument value, type mismatch, decode resource limit, invalid binding or inconsistent replay |
| `ORC0301` | Evaluation | Step budget, call depth, or `Int` result size exhausted |
| `ORC1001`–`ORC1017` | Command line | Unreadable or oversized input, invalid UTF-8, duplicate standard input, output limit, key file, scheme, sealed-file format, a chunk that is not authentic, randomness, a `--spec` or `--function` name that selects nothing, an analysis whose selector or shape the command cannot take, an analysis whose bits, table, or layer the search cannot accept |

Codes and their meanings are stable automation surfaces. Every resource budget
fails closed with a diagnostic rather than a panic, hang, or partial success.

