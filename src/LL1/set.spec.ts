import { Literal, LiteralOption } from "../common/common";
import { set } from "./set";
import { parser } from "./parser";
import { factory } from "../common/factory";
import { END } from "../common/constants";

describe("generator", () => {
    describe("<S>->a<A>  <S>->b  <A>->c<A><S>  <A>->e", () => {
        const input = `
<S>->a <A>
<S>->b
<A>->c <A><S>
<A>->e
`;
        const TERMINALS = {
            A: "A",
            S: "S",
        };

        const NON_TERMINALS = {
            a: "a",
            b: "b",
            c: "c",
            e: "e",
        };

        const transitions = new Map<Literal, Literal>();
        transitions.set(TERMINALS.A, TERMINALS.S);

        const options = new Set<LiteralOption>();
        options.add({
            rule: TERMINALS.S,
            grammar: factory.createLiteralSet([NON_TERMINALS.a, TERMINALS.A]),
            first: factory.createLiteralSet([]),
        });
        options.add({
            rule: TERMINALS.S,
            grammar: factory.createLiteralSet([NON_TERMINALS.b]),
            first: factory.createLiteralSet([]),
        });
        options.add({
            rule: TERMINALS.A,
            grammar: factory.createLiteralSet([NON_TERMINALS.c, TERMINALS.A, TERMINALS.S]),
            first: factory.createLiteralSet([]),
        });
        options.add({
            rule: TERMINALS.A,
            grammar: factory.createLiteralSet([NON_TERMINALS.e]),
            first: factory.createLiteralSet([]),
        });


        const table = parser.parse(input, options);

        it("should return rule with set", () => {
            set.exec(table, options, input);

            const expected: Set<LiteralOption> = new Set<LiteralOption>();
            expected.add({
                rule: TERMINALS.S,
                grammar: factory.createLiteralSet([NON_TERMINALS.a, TERMINALS.A]),
                first: factory.createLiteralSet([NON_TERMINALS.a]),
            });
            expected.add({
                rule: TERMINALS.S,
                grammar: factory.createLiteralSet([NON_TERMINALS.b]),
                first: factory.createLiteralSet([NON_TERMINALS.b]),
            });
            expected.add({
                rule: TERMINALS.A,
                grammar: factory.createLiteralSet([NON_TERMINALS.c, TERMINALS.A, TERMINALS.S]),
                first: factory.createLiteralSet([NON_TERMINALS.c]),
            });
            expected.add({
                rule: TERMINALS.A,
                grammar: factory.createLiteralSet([NON_TERMINALS.e]),
                first: factory.createLiteralSet([END, NON_TERMINALS.a, NON_TERMINALS.b]),
            });

            Array.from(expected.values()).forEach((expectedValue, index) => {
                const actualValue = Array.from(options)[index];
                const actualArray = Array.from(expectedValue.first);
                const expectedArray = Array.from(actualValue?.first);
                expect(expectedArray).toEqual(expect.arrayContaining(actualArray));
            });
        });
    });
});
