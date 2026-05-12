javascript:(async function() {
  try {
    function xpathAll(expr, ctx) {
      const result = document.evaluate(
        expr,
        ctx || document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      const nodes = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        nodes.push(result.snapshotItem(i));
      }
      return nodes;
    }

    /* ── title & slug ── */
    const title = document.querySelector('[data-active] span[dir="auto"]')?.textContent?.trim()
               ?? document.querySelector('ol li a.bg-gray-100')?.textContent?.trim()
               ?? document.title;
    const slug = title.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/(^-)|(-$)/g, '');

    /* ── collect copy buttons in document order ── */
    const copyButtons = [
      ...document.querySelectorAll('[data-testid="copy-turn-action-button"]')
    ];
    const canvasButtons = xpathAll(
      '//div[contains(@id, "textdoc-message-")]//button[@aria-label="Copy"]'
    );
    if (copyButtons.length === 0 && canvasButtons.length === 0) {
      throw new Error(
        'No copy buttons found. Make sure the chat is fully loaded.'
      );
    }

    /* ── request clipboard-read permission up front ──
         (some browsers require a user gesture; clicking a button counts) */
    if (navigator.permissions) {
      const perm = await navigator.permissions.query({ name: 'clipboard-read' });
      if (perm.state === 'denied') {
        throw new Error(
          'Clipboard read permission denied. ' +
          'Please allow clipboard access for chatgpt.com and try again.'
        );
      }
    }

    /* ── iterate over turns ── */
    const parts = [];
    for (const btn of copyButtons) {
      /* Determine role from the closest section with data-turn */
      const section = btn.closest('[data-turn]');
      const role    = section?.dataset?.turn ?? 'unknown';
      const label   = role === 'user' ? '**You:**' : '**ChatGPT:**';
      const attachments = role === 'user'
        ? xpathAll('.//div[contains(@class, "group/file-tile")]/@aria-label', section)
            .map(node => node.value)
            .filter(Boolean)
        : [];
      const canvases = role === 'assistant'
        ? xpathAll('.//div[contains(@id, "textdoc-message-")]', section).map(canvas => ({
            title:
              xpathAll('.//span[contains(@class, "text-token-text-primary")]/text()', canvas)
                .map(node => node.nodeValue?.trim())
                .find(Boolean)
              ?? 'Untitled Canvas',
            button: xpathAll('.//button[@aria-label="Copy"]', canvas)[0]
          })).filter(canvas => canvas.button)
        : [];

      /* Click the ChatGPT copy button – it writes Markdown to the clipboard */
      const text = await copyFromButton(btn);
      let entry = `${label}\n\n`;
      if (attachments.length > 0) {
        entry += `*Attachments: ${attachments.join(', ')}*\n\n`;
      }
      entry += text;
      for (const canvas of canvases) {
        const canvasText = await copyFromButton(canvas.button);
        entry += `\n\n**Canvas: ${canvas.title}**\n\n${canvasText}`;
      }
      parts.push(entry);
    }

    /* ── assemble document ── */
    const markdown = `# ${title}\n\n---\n\n${parts.join('\n\n---\n\n')}\n`;

    /* ── download ── */
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([markdown], { type: 'text/markdown' })
    );
    a.download = `chat-gpt-${slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

  } catch (e) {
    alert('chat-gpt bookmark (md/clipboard): ' + e.message);
  }

  async function copyFromButton(btn) {
    let previousText = '';
    try {
      previousText = await navigator.clipboard.readText();
    } catch {}

    btn.click();
    return waitForClipboardChange(previousText, 2000);
  }

  async function waitForClipboardChange(prevText, timeoutMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await new Promise(r => setTimeout(r, 50));
      try {
        const current = await navigator.clipboard.readText();
        if (current !== prevText) return current;
      } catch { /* clipboard busy; retry */ }
    }
    throw new Error('Timed out waiting for clipboard update');
  }
})();
