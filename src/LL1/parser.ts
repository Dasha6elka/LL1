import {
    TokenTable,
    LiteralTable,
    LiteralOptions,
    RuleValue,
    GrammarValue,
    SymbolType,
    Literal,
} from "../common/common";
import { utils } from "../common/utils";
import { EMPTY, END, ARR_EN } from "../common/constants";
import { factory } from "../common/factory";
import { terminize, tokenize } from "../common/parser";

export namespace parser {
    type Transitions = Map<string, string[]>;

    const STACK_REG_EXP = new RegExp("<(?:(?!<|>).)+>|(?!->)([^<> ]+)", "gi");
    const RIGHT_PART_REG_EXP = new RegExp("(?<=->).*", "gim");
    const NON_TERMINALS_REG_EXP = new RegExp("<.+>(?=->)", "gim");

    export function transitionize(input: string): Transitions {
        const { nonTerminals } = terminize(input);

        const transitions = new Map<string, string[]>();

        const lines = utils.Input.normalize(input);

        lines.forEach(line => {
            let stack = line.match(STACK_REG_EXP) ?? [];
            stack.shift();
            stack = stack.reverse().map(utils.NonTerminal.normalize);

            let curr = stack.pop()!;
            let next: string | null = null;
            while (stack.length) {
                next = stack.pop()!;
                if (nonTerminals.includes(curr) && nonTerminals.includes(next)) {
                    const to = transitions.get(curr);
                    if (to) {
                        transitions.set(curr, [...to, next]);
                    } else {
                        transitions.set(curr, [next]);
                    }
                }
                curr = next;
            }
        });

        return transitions;
    }

    export function factorization(input: string, alphabetIndex: number, letterIndex: number): string {
        const lines = utils.Input.normalize(input);

        const matches = new Map<string, Set<string[]>>();
        const matchesKey: string[] = [];
        const simples = new Set<string[]>();
        const simplesKey: string[] = [];
        const matchesList = new Set<string[]>();

        lines.forEach((line, index, array) => {
            const stack = utils.Input.stack(line);
            const key = utils.Input.key(line);

            array.slice(index + 1).forEach(subLine => {
                const subStack = utils.Input.stack(subLine);

                fillMatches(subStack, stack, matches, matchesKey, key, matchesList);
            });

            if (simple(matchesList, stack)) {
                simples.add(stack);
                simplesKey.push(key);
            }
        });

        let result = "";

        result = addInResultMatches(matches, matchesKey, result, alphabetIndex, letterIndex);

        result = addInResultSimples(simples, simplesKey, result);

        return result;
    }

    export function leftRecursion(
        input: string,
        alphabetIndex: number,
        letterIndex: number,
    ): { result: string; alphabetIndex: number; letterIndex: number } {
        const lines = utils.Input.normalize(input);
        const tokensMap = new Map<Literal, Set<string[]>>();
        const recursionKey: string[] = [];

        lines.forEach(line => {
            const key = utils.Input.key(line);
            const stack = utils.Input.stack(line);

            const values = tokensMap.get(key);
            if (values) {
                values?.add(stack); // TODO: unsafe cast
                tokensMap.set(key, values!); // TODO: unsafe cast
            } else {
                tokensMap.set(key, new Set([stack]));
            }

            if (key === stack[0]) {
                recursionKey.push(key);
            }
        });

        if (!isLeftRecursiveness(input, tokensMap)) {
            return {
                result: "Grammar is not LL (1), parsing table cannot be built",
                alphabetIndex,
                letterIndex,
            };
        }

        const result = addInResult(tokensMap, recursionKey, alphabetIndex, letterIndex);

        return {
            result: result.result,
            alphabetIndex: result.alphabetIndex,
            letterIndex: result.letterIndex,
        };
    }

    function isLeftRecursiveness(input: string, tokensMap: Map<Literal, Set<Literal[]>>): boolean {
        let isLL = true;
        for (const [key, values] of tokensMap) {
            values.forEach(value => {
                if (!isLL) {
                    return;
                }
                let token = value[0];
                if (key === token) {
                    return;
                }
                isLL = isLeftRecursion(input, token, tokensMap, key);
            });
        }

        return isLL;
    }

    function isLeftRecursion(
        input: string,
        token: Literal,
        tokensMap: Map<Literal, Set<Literal[]>>,
        key: Literal,
    ): boolean {
        const { nonTerminals } = terminize(input);
        let result = true;

        if (nonTerminals.includes(utils.NonTerminal.normalize(token))) {
            let isLL = true;
            while (isLL) {
                const string = tokensMap.get(token)!; // TODO: unsafe cast
                string.forEach(s => {
                    if (!isLL) {
                        return;
                    }
                    if (s[0] === key) {
                        isLL = false;
                        result = false;
                    } else if (token !== key) {
                        isLL = false;
                        result = true;
                    } else {
                        token = s[0];
                        isLeftRecursion(input, token, tokensMap, key);
                        isLL = false;
                    }
                });
            }
        }

        return result;
    }

    export function optionize(input: string): LiteralOptions {
        const options: LiteralOptions = factory.createLiteralOptions();
        const lines = utils.Input.normalize(input);

        lines.forEach(line => {
            const stack = (line.match(STACK_REG_EXP) ?? []).map(utils.NonTerminal.normalize);
            const rule = stack[0];
            stack.shift();
            options.add({
                rule,
                grammar: factory.createLiteralSet(stack),
                first: factory.createLiteralSet(),
            });
        });

        return options;
    }

    export function rules(options: LiteralOptions): RuleValue[] {
        return Array.from(options.values()).map((option, index, array) => {
            const next = array[index + 1];
            const set = option.first;
            return {
                literal: option.rule,
                set,
                last: !(next && next.rule === option.rule),
            };
        });
    }

    export function grammars(input: string, table: LiteralTable): GrammarValue[] {
        const lines = utils.Input.normalize(input);
        const { terminals, nonTerminals } = tokenize(input);

        const isTerminal = (v: string): boolean => terminals.has(v);
        const isNonTerminal = (v: string): boolean => nonTerminals.has(v);
        const isEmpty = (v: string): boolean => v === EMPTY;
        const isEnd = (v: string): boolean => v === END;

        let isEndToken: boolean = false;
        lines.every(line => {
            if (line.search(END)) {
                isEndToken = true;
            }
        });

        const grammars: GrammarValue[] = [];

        lines.forEach((line, index, array) => {
            const isLastLine = index === array.length - 1;
            const stack = (line.match(STACK_REG_EXP) ?? []).map(utils.NonTerminal.normalize);
            stack.shift();
            stack.forEach((literal, index, array) => {
                const next = array[index + 1];

                const type =
                    isEmpty(literal) || isEnd(literal)
                        ? SymbolType.Empty
                        : isTerminal(literal)
                        ? SymbolType.Terminal
                        : SymbolType.Nonterminal;

                const set =
                    isEmpty(literal) || isEnd(literal)
                        ? factory.createLiteralSet([END])
                        : isTerminal(literal)
                        ? factory.createLiteralSet([literal])
                        : table.get(literal)!; // TODO: unsafe cast

                const end = (isLastLine && !next && !isEndToken) || isEnd(literal);

                const last = next && (isTerminal(literal) || isNonTerminal(literal)) ? false : true;

                const grammar = {
                    literal: literal,
                    options: {
                        set,
                        type,
                        last,
                        end,
                    },
                };

                grammars.push(grammar);
            });
        });

        return grammars;
    }

    export function parse(input: string, options: LiteralOptions): LiteralTable {
        const transitionsMap = transitionize(input);

        const cache = factory.createLiteralTable();
        const cacheSafePush = utils.useSafePush(cache, value => factory.createLiteralSet([value]));
        const table = factory.createLiteralTable();
        const tableSafePush = utils.useSafePush(table, value => factory.createLiteralSet([value]));

        const lines = utils.Input.normalize(input);

        lines.forEach(line => {
            const nonTerminalMatch = utils.NonTerminal.normalize((line.match(NON_TERMINALS_REG_EXP) ?? [])[0]); // TODO: unsafe cast
            let rightPartMatch = (line.match(RIGHT_PART_REG_EXP) ?? [])[0]; // TODO: unsafe cast
            // Recieved non terminal if first symbol is '<'
            if (rightPartMatch[0] === "<") {
                // Skip '<' symbol and take all between '<' and  '>'
                rightPartMatch = utils.NonTerminal.normalize(rightPartMatch.substring(1).split(">")[0]);
                cacheSafePush(nonTerminalMatch, rightPartMatch);
                tableSafePush(nonTerminalMatch, rightPartMatch);
            } else if (rightPartMatch[0] === EMPTY) {
                const transitions = transitionsMap.get(nonTerminalMatch);
                const values: string[] = [];
                if (transitions) {
                    transitions?.forEach(transition => {
                        const vals = cache.get(transition);
                        if (vals) {
                            vals.forEach(value => {
                                values.push(value);
                            });
                        }
                    });
                }
                let tokens: string[] = [];
                options.forEach(option => {
                    let index = 0;
                    option.grammar.forEach((gramm, unused, array) => {
                        const isLast = index++ === array.size - 1;
                        if (gramm === nonTerminalMatch && isLast && option.rule !== gramm) {
                            tokens.push(option.rule);
                        }
                        if (gramm === nonTerminalMatch && !isLast) {
                            const next = Array.from(array.values())[index];
                            values.push(next);
                        }
                    });
                });
                options.forEach(option => {
                    let index = 0;
                    option.grammar.forEach((gramm, unused, array) => {
                        const next = Array.from(array.values())[++index];
                        tokens.forEach(token => {
                            if (gramm === token && next) {
                                values.push(next);
                            }
                        });
                    });
                });
                cacheSafePush(nonTerminalMatch, new Set([...values]));
                tableSafePush(nonTerminalMatch, new Set([...values]));
            } else {
                const symbol: string = rightPartMatch.split(" ")[0];
                cacheSafePush(nonTerminalMatch, symbol);
                tableSafePush(nonTerminalMatch, symbol);
            }
        });

        const result: typeof table = new Map();

        for (const [literal] of table) {
            const sameRows = Array.from(table.entries())
                .reverse()
                .filter(([subLiteral]) => literal === subLiteral);

            const allValuesToAdd = sameRows.reduce((acc, [, value]) => {
                const valuesToAdd = Array.from(value.values());
                acc.push(...valuesToAdd);
                return acc;
            }, [] as Array<typeof literal>);

            sameRows.forEach(([key]) => table.delete(key));

            result.set(literal, new Set(allValuesToAdd));
        }

        return result;
    }

    export function pointerize(table: TokenTable, rules: RuleValue[], map: number[]) {
        for (const [key, value] of table) {
            if (key === rules.length) {
                return;
            }
            let offset = rules.length;
            if (key !== 0) {
                const allRowsBefore = Array.from(table.entries()).filter(([index]) => index < key);
                offset = allRowsBefore.reduce((acc, [index]) => acc + map[index], rules.length);
            }
            value.pointer = offset;
        }
    }

    function fillMatches(
        subStack: Literal[],
        stack: Literal[],
        matches: Map<Literal, Set<Literal[]>>,
        matchesKey: Literal[],
        key: Literal,
        matchesList: Set<Literal[]>,
    ): void {
        let match = "";
        let otherPart: Set<Literal[]> = new Set<Literal[]>();
        if (stack[0] === subStack[0] && stack[0] != EMPTY) {
            match += `${stack[0]} `;
            let i = 1;
            while (stack[i] === subStack[i] && stack.length > i) {
                const s = stack[i];
                const b = subStack[i];
                if (s !== undefined && b !== undefined) {
                    match += `${stack[i]} `;
                    i++;
                }
            }
            const stackSlice = stack.slice(i);
            const subStackSlice = subStack.slice(i);
            if (stackSlice.length === 0 && subStackSlice.length === 0) {
                arrayPush(stackSlice, otherPart);
            } else {
                arrayPush(stackSlice, otherPart);
                arrayPush(subStackSlice, otherPart);
            }

            if (matches.has(match)) {
                let matchValues = matches.get(match)!;
                matchValues.forEach(value => {
                    otherPart.forEach(other => {
                        if (utils.compare(other, value)) {
                            otherPart.delete(other);
                        }
                    });
                });
                otherPart.forEach(other => matchValues.add(other));
                matches.set(match, matchValues);
            } else {
                matches.set(match, otherPart);
                matchesKey.push(key);
            }

            matchesList.add(stack);
            matchesList.add(subStack);
        }
    }

    function addInResultMatches(
        matches: Map<Literal, Set<Literal[]>>,
        matchesKey: Literal[],
        result: string,
        alphabetIndex: number,
        letterIndex: number,
    ): string {
        const keys = matches.keys();
        let matchIndex = 0;

        matches.forEach(matchValues => {
            const letter = `${ARR_EN[alphabetIndex]}${letterIndex}`;
            result += `${matchesKey[matchIndex]}->${keys.next().value}<${letter}>\n`;

            matchValues.forEach(match => (result += `<${letter}>->${match.join(" ").trim()}` + "\n"));

            alphabetIndex++, matchIndex++;
            if (ARR_EN.length - 1 === letterIndex) {
                letterIndex++;
            }
        });

        return result;
    }

    function addInResult(
        tokensMap: Map<Literal, Set<Literal[]>>,
        recursionKey: string[],
        alphabetIndex: number,
        letterIndex: number,
    ): { result: string; alphabetIndex: number; letterIndex: number } {
        let result = "";
        for (const [key, values] of tokensMap) {
            if (recursionKey.includes(key)) {
                let recursion = "",
                    simples = "";

                const letter = `${ARR_EN[alphabetIndex]}${letterIndex}`;
                values.forEach(value => {
                    if (key === value[0]) {
                        recursion += `<${letter}>->${value.slice(1).join(" ").trim()}<${letter}>` + "\n";
                    } else if (value.includes(EMPTY)) {
                        return;
                    } else {
                        simples += `${key}->${value.join(" ").trim()}<${letter}>` + "\n";
                    }
                });

                recursion += `<${letter}>->e` + "\n";
                result += simples + recursion;

                alphabetIndex++;
                if (ARR_EN.length - 1 === letterIndex) {
                    letterIndex++;
                }
            } else {
                values.forEach(value => (result += `${key}->${value.join(" ")}`.trim() + "\n"));
            }
        }
        return {
            result,
            alphabetIndex,
            letterIndex,
        };
    }

    function addInResultSimples(simples: Set<Literal[]>, simplesKey: Literal[], result: string): string {
        let simpleIndex = 0;
        simples.forEach(simple => {
            let str = "";
            simple.forEach(s => (str += `${s} `));
            result += `${simplesKey[simpleIndex]}->${str.trim()}` + "\n";

            simpleIndex++;
        });

        return result;
    }

    function arrayPush(array: Literal[], source: Set<Literal[]>) {
        source.add(array.length ? array : [EMPTY]);
    }

    function simple(matchesList: Set<Literal[]>, stack: Literal[]): boolean {
        let isSimple = true;
        matchesList.forEach(match => {
            if (utils.compare(match, stack)) {
                isSimple = false;
            }
        });

        return isSimple;
    }
}
