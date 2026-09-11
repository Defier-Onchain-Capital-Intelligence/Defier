# Privacy

Last updated 11 September 2026.

DeFier reads public data from the Base blockchain and shows you what it means.
It holds no funds, no keys, and no accounts. This page says exactly what data
touches our servers, because a policy that describes a generic web app is not a
policy about this one.

## What we never have

- **No account.** There is no sign up, no password, no email address.
- **No keys.** DeFier never asks you to sign a transaction or a message to use
  the product, and never sees a private key or seed phrase.
- **No custody.** No funds ever move through us.
- **No advertising, no tracking pixels, no analytics.** We run no Google
  Analytics, no Meta pixel, no Segment, no session recording, and no
  cross-site trackers of any kind.
- **No sale of data.** We do not sell or share data with data brokers or
  advertisers.

## What we store

**Aggregate usage.** When a wallet is analysed we record a one-way keyed hash
of its address together with the capital measured, a count of positions, and
timestamps. The hash cannot be reversed to recover the address. It exists so
the same wallet analysed twice is counted once in the public total on our home
page, and for nothing else.

**Shared cards.** When you create a share link we store the figures on the
card, a one-way keyed hash of the wallet, and the last four characters of the
address. The full address is deliberately not stored. Anyone with the link can
see the card, which is what a share link is for.

**Alerts, only if you turn them on.** Inside the Base App you can subscribe a
position to range alerts. That stores your Farcaster account id, the wallet and
position being watched, and a notification credential issued by the Base App.
This is the one place an identity is linked to a wallet address, it exists only
because an alert has to know where to go, and it is deleted when you turn the
alert off.

## What passes through but is not kept

**Wallet addresses you type.** An address is sent to our server so it can be
analysed. Apart from the hashed record above, it is not stored.

**Questions you ask.** Questions in the Ask screen are sent to Anthropic's API
along with the figures our engine computed for the wallet, so the assistant can
answer. We do not store your conversation. Anthropic does not use API traffic to
train its models.

**Your IP address.** Held in memory for a few minutes to rate limit abusive
traffic, then discarded. It is never written to a database.

**Server logs.** Errors are logged with the wallet address involved so faults
can be diagnosed. These are ordinary hosting logs and rotate out.

## Cookies

**DeFier sets no cookies and uses no browser storage of its own.** There is no
cookie banner because there is nothing to consent to.

If you connect a wallet, the wallet library stores your connection state in
your own browser so you are not asked to reconnect on every page. That is
strictly necessary for the feature you asked for, never leaves your device, and
is cleared when you disconnect.

## Who else sees data

To read the chain and price it, requests go to infrastructure providers. Each
sees only what it needs to answer.

| Who | What they see | Why |
| --- | --- | --- |
| Alchemy and public Base RPC nodes | The wallet address being read | Reading the blockchain |
| DeFiLlama | Token and pool addresses | Prices and market rates |
| Anthropic | Your question and the computed figures | Answering in the Ask screen |
| Supabase | The stored records listed above | Our database |
| Vercel | Ordinary request data | Hosting |
| Coinbase Developer Platform | Wallet connection data | The Connect Wallet button |
| Farcaster and the Base App | Your account id, only if you enable alerts | Delivering notifications |

## A public blockchain is public

Everything DeFier reads about a wallet is already visible to anyone with a
block explorer. We do not make public information more public: a report is
reachable only by someone who has the address or the share link you created.

Analysing a wallet you do not own is possible because the data is public. If
you do it, do not treat what you see as private to you.

## Search engines

Pages that carry a wallet address are excluded from search indexing, so a
report does not turn up in a search for someone's address.

## Your rights

You can ask what we hold about a wallet, and ask for it to be deleted, by
writing to the address below. Because the usage record is hashed rather than
stored as an address, you will need to send the address so we can compute the
same hash and find the row.

You can delete alert subscriptions yourself by turning the alert off.

## Children

DeFier is not directed at children and we do not knowingly collect data from
anyone under 16.

## Changes

Material changes will be reflected in the date at the top of this page. The
page lives in the product's own source repository, so its history is public.

## Contact

Write to **hola@getdefier.com**.
