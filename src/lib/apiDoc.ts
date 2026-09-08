/**
 * The API page.
 *
 * Written here rather than in a repository file because it describes a contract
 * that has to match the route it documents, and the two should move in one
 * commit. The rules are not decoration: an agent quoting a P&L that silently
 * covered three of five positions produces a confident wrong answer that nobody
 * downstream can catch, so the rules come before the schema.
 */
import { marked } from 'marked';

const MD = `
# API for agents

One endpoint, and a contract that is allowed to outlive our internal types so the
screens can be rebuilt without breaking anyone.

\`\`\`
GET https://www.getdefier.com/api/v1/wallet/{address}
\`\`\`

Base only, chain id 8453. Ten wallets a minute — a full reconstruction is
expensive. Authorisation is opt in: when keys are configured, send
\`Authorization: Bearer <key>\`.

- **OpenAPI** — [/api/v1/openapi.json](/api/v1/openapi.json)
- **Reading rules for a model** — [/llms.txt](/llms.txt)

## Read coverage before you quote anything

Every response opens with \`coverage\`, and it governs the rest of the document.

\`\`\`json
{
  "coverage": {
    "complete": false,
    "scope": "partial",
    "positionsMeasured": 4,
    "positionsExcluded": 1,
    "excluded": [{ "pair": "WETH/USDC", "reason": "no historical price on the deposit day" }],
    "concentratedIn": { "pair": "WETH/cbBTC", "sharePct": 97.7 }
  }
}
\`\`\`

**\`scope\` is the phrase to use for the period.** It says \`"all time"\` only when
every position the wallet ever opened was measured. If it says \`"partial"\`, the
figures below cover part of the history and must be described that way.

**\`concentratedIn\` travels with the headline.** A result driven overwhelmingly by
one position is a different fact from the same number spread across ten. When this
field is present, a summary that omits it is misleading even though every figure
in it is correct.

## Figures

\`result.divergenceUsd\` is signed: positive means providing liquidity beat holding
the same tokens. \`vsHoldingUsd\` adds what was earned and subtracts gas.

**\`feesUsd\` and \`emissionsUsd\` are always separate**, and \`earnedUsd\` is their
sum. Describing a total that is mostly emissions as "fees" is wrong, and the split
is given so that never has to be guessed.

\`capital.deployedUsd\` is summed at each deposit's own price, not today's.

## What this API does not do

It never writes. There is no endpoint that builds a transaction, requests a
signature, or moves anything.

It does not estimate. A position whose historical price cannot be resolved is
excluded and named in \`coverage.excluded\` rather than filled in with an adjacent
day. A figure that is absent is absent on purpose.

It does not advise. Nothing in a response is a recommendation, and a model
relaying it should not turn it into one.
`;

export const API_DOC = {
  blurb: 'One endpoint, every figure carrying its own coverage scope. OpenAPI and reading rules included.',
  html: marked.parse(MD, { async: false }) as string,
};
