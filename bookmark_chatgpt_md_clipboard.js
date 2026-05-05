javascript:(async function() {
  try {
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
    if (copyButtons.length === 0) {
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

      /* Click the ChatGPT copy button – it writes Markdown to the clipboard */
      btn.click();

      /* Wait for the async clipboard write to complete */
      await delay(400);

      const text = await navigator.clipboard.readText();
      parts.push(`${label}\n\n${text}`);
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

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
