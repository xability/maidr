# Languages

MAIDR speaks the language the reader chooses. Every announcement, the
description dialog, the AI chat, the keyboard shortcut help, the command
palette, and the settings dialog itself render from one dictionary per
language.

## Choosing a language

Open Settings (**Ctrl + ,** on Windows and Linux, **Command + ,** on macOS).
The first row of the **General** tab is **Language**:

| Option          | Effect                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Browser default | Follow the browser's language; English when MAIDR has no dictionary for it |
| English         | Always English                                                         |
| 한국어          | Always Korean                                                          |

The choice is saved with the other settings and takes effect as soon as you
save: the next announcement, and every dialog you open afterwards, use the new
language. The `<article>` wrapping each chart carries a matching `lang`
attribute, so a screen reader switches to a voice for that language.

Chart data is never translated. Axis labels, category names, and titles are
read exactly as the chart's author wrote them; only MAIDR's own words around
them change. The AI chat is asked to answer in the chosen language.

## Languages available

| Code | Language |
| ---- | -------- |
| `en` | English  |
| `ko` | 한국어   |

## Adding a language

The dictionaries live in `src/util/i18n/`. English defines the key set; every
other language is typed against it, so a missing key is a type error rather
than a silent fallback.

1. Add the locale code to `Locale`, `SUPPORTED_LOCALES`, and `LOCALE_NAMES` in
   `src/util/i18n/index.ts`. Name the language in itself, the way a reader who
   does not read the current language would look for it.
2. Create `src/util/i18n/<code>/` by copying `src/util/i18n/ko/`. Each file
   covers one area of the code (`text.ts`, `keybinding.ts`, `settings.ts`, …)
   and is typed `satisfies Partial<Record<MessageKey, string>>`; the
   `index.ts` that merges them is typed `Record<MessageKey, string>`, which is
   what makes an omission fail `npm run type-check`.
3. Register the dictionary in `MESSAGES` in `src/util/i18n/index.ts`.
4. Translate every value. Placeholders such as `{label}` and `{index}` are
   filled at render time; keep them, and reorder them freely to suit the
   language's word order.

Numbers are formatted by the chart's own `format` options, not by the
dictionary.

### Korean particles

A Korean particle changes with the syllable before it — 가격**은** but
온도**는** — and the word it attaches to is usually chart data MAIDR cannot
know in advance. Write the pair after a `|` in the placeholder and the right
form is chosen for the actual word:

```
'text.labelIsValue': '{label|은는} {value}',
```

Supported pairs are `은는`, `이가`, `을를`, `과와`, `으로`, and `이다`. Digits
and Latin letters are judged by their usual Korean reading, so `1은`, `2는`,
`Team은`, and `Price는` all come out right. A language with a similar need can
add its own modifier in `src/util/i18n/index.ts`.

## For code

- Non-React code imports `t` from `@util/i18n` and calls it where the string
  is produced, never at module load: a `const LABEL = t('…')` would freeze the
  language at import time.
- React components call `useLocale()` from `@state/hook/useLocale`, which
  re-renders the component when the language changes.
- Tables keyed by an enum store a `MessageKey` and translate on lookup; see
  `CHART_TYPE_LABEL` in `src/model/abstract.ts`.
- English output is the reference: a change that alters an English string is
  a behaviour change and must update the tests that assert it.
