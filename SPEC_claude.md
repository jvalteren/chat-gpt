# SPEC: Claude.ai Chat Export Bookmarklet

## Purpose

Export a Claude.ai conversation as a Markdown `.md` file by leveraging the
native per-turn copy buttons, exactly as `bookmark_chatgpt_md_clipboard.js` does for
ChatGPT.

## Target

`https://claude.ai/chat/*` — Chrome / Brave desktop browsers.

---

## DOM Structure (claude.ai)

### Chat title

```
button[data-testid="chat-title-button"]
  └─ div.min-w-0.flex-1
       └─ div.truncate.font-base-bold   ← title text
```

XPath: `//button[@data-testid="chat-title-button"]/div/div/text()`

Fallback: `document.title`

### User turns

```
div.mb-1.mt-6.group                          ← turn wrapper  (2 levels above bubble)
  h2.sr-only "You said: …"
  div.gap-2.flex.flex-wrap.justify-end       ← attachment thumbnails (optional)
    div > div.relative > div.group/thumbnail ← one per attachment (see below)
  div.flex.flex-col.items-end.gap-1          ← user message container (1 level above bubble)
    div[data-user-message-bubble="true"]     ← user bubble  ← XPath anchor
      …message content…
    div[role="group"][aria-label="Message actions"]
      …
        button[data-testid="action-bar-copy"]  ← copy button
```

XPath for copy button (relative to bubble):
```
./..//button[@data-testid="action-bar-copy"]
```

### User turn attachments

Attachment thumbnails appear inside the turn wrapper, 2 levels above the bubble.
Two mutually exclusive thumbnail shapes exist:

**Image / PDF** — rendered as a thumbnail image:
```
div.group/thumbnail.relative
  div[data-testid="{filename}"]
    button
      img[alt="{filename}"]          ← filename here
```

XPath (relative to bubble):
```
./../..//div[contains(@class,"group/thumbnail")]//button/img/@alt
```

**Other file types** (MD, YAML, TXT, …) — rendered as a labelled card:
```
div.group/thumbnail[data-testid="file-thumbnail"]
  button
    div.flex.flex-col
      h3  {filename}                 ← filename here
```

XPath (relative to bubble):
```
./../..//div[contains(@class,"group/thumbnail")]//h3/text()
```

### Claude turns

```
div.group                                        ← outer wrapper (3 levels above font-claude-response)
  div.contents
    div[data-is-streaming="false"].group.pb-3   ← direct parent of response div
      h2.sr-only "Claude responded: …"
      div.font-claude-response …               ← response content (XPath anchor)
    div[role="group"][aria-label="Message actions"]
      …
        button[data-testid="action-bar-copy"]  ← copy button
```

XPath for copy button:
```
//div[contains(@class, "font-claude-response")]/../../..//button[@data-testid="action-bar-copy"]
```

> Both XPaths are **mutually exclusive**: they navigate through disjoint ancestor
> chains, so no button is counted twice.

---

## Implementation Plan

### 1. Title extraction

Use `document.evaluate()` with the title XPath. Fall back to `document.title`
when not found. Derive a URL-safe slug with the same regex as the ChatGPT
bookmarklet.

### 2. Turn collection

User and Claude turns are collected separately, then merged and sorted.

**User turns** — bubble-scoped (iterate each `data-user-message-bubble` element):
1. Find the copy button via relative XPath `./..//button[@data-testid="action-bar-copy"]`.
2. Find image/PDF attachment names via relative XPath on `img/@alt` (attribute nodes → `.value`).
3. Find other-file attachment names via relative XPath on `h3/text()` (text nodes → `.nodeValue`).
4. Store `{ label: '**You:**', btn, attachments: [...imgAlts, ...h3Names] }`.

**Claude turns** — collect all Claude copy buttons globally, store
`{ label: '**Claude:**', btn, attachments: [] }`.

Combine both arrays and sort by DOM document order using
`Node.compareDocumentPosition()`.

### 3. Content extraction (per turn, in order)

1. Call `btn.click()` — the button writes Markdown to the system clipboard.
2. `await delay(400)` — allow the async clipboard write to complete.
3. `await navigator.clipboard.readText()` — retrieve the Markdown text.
4. Prepend role label (`**You:**` or `**Claude:**`).
5. If the turn has attachments, insert an italicised list between the label and
   the message text.

### 4. Document assembly

```markdown
# {title}

---

**You:**

*Attachments: consultatie.md, report.pdf*

{user message}

---

**Claude:**

{claude response}

---

…
```

The `*Attachments: …*` line is omitted entirely for turns without attachments.

### 5. File download

Create a `Blob` with `type: 'text/markdown'`, attach a temporary `<a>` element,
trigger `.click()`, and revoke the object URL. Filename: `claude-{slug}.md`.

---

## Error Handling

| Condition | Behaviour |
|---|---|
| No copy buttons found | `alert(…)` with "make sure chat is loaded" message |
| `clipboard-read` permission denied | `alert(…)` with instructions to allow access |
| General runtime error | `alert('claude bookmark (md/clipboard): ' + e.message)` |

---

## Differences from `bookmark_md_clipboard.js` (ChatGPT)

| Aspect | ChatGPT | Claude.ai |
|---|---|---|
| Copy button selector | `[data-testid="copy-turn-action-button"]` | `[data-testid="action-bar-copy"]` |
| Role detection | `closest('[data-turn]').dataset.turn` | Determined by XPath used to find the button |
| Title selector | `[data-active] span[dir="auto"]` | `button[data-testid="chat-title-button"]/div/div` |
| Filename prefix | `chat-gpt-` | `claude-` |
| Role labels | `**You:** / **ChatGPT:**` | `**You:** / **Claude:**` |
| Attachment support | None | Image/PDF via `img/@alt`; other files via `h3/text()` |
| Turn collection | Global button list | Bubble-scoped (XPath relative to each bubble element) |
