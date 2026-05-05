javascript:(async function() {
  try {
    /* ── title & slug ── */
    const title = (
      document.querySelector('[data-testid="chat-title-button"]')?.getAttribute('aria-label')?.trim()
      ?? document.querySelector('[aria-current="page"] span.truncate')?.textContent?.trim()
      ?? document.title.replace(/\s*[-–|].*$/, '').trim()
    );
    const slug = title.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/(^-)|(-$)/g, '');

    /* ── collect copy buttons in document order ──
         Claude renders one [data-testid="action-bar-copy"] per turn
         (both human and AI turns expose this button in their action bar). */
    const copyButtons = [
      ...document.querySelectorAll('[data-testid="action-bar-copy"]')
    ];
    if (copyButtons.length === 0) {
      throw new Error(
        'No copy buttons found (data-testid="action-bar-copy"). ' +
        'Make sure the full conversation is loaded.'
      );
    }

    /* ── request clipboard-read permission up front ── */
    if (navigator.permissions) {
      const perm = await navigator.permissions.query({ name: 'clipboard-read' });
      if (perm.state === 'denied') {
        throw new Error(
          'Clipboard read permission denied. ' +
          'Please allow clipboard access for claude.ai and try again.'
        );
      }
    }

    /* ── iterate over turns ── */
    const parts = [];
    for (const btn of copyButtons) {
      /* Determine role by looking for turn-identifying elements near the button.
         - User turns contain a [data-testid="user-message"] element.
         - Claude turns contain an element with class 'font-claude-response'. */
      const container = btn.closest('[data-testid], .font-claude-response')
                        ?? btn.parentElement;
      const isUser = !!(
        btn.closest('[data-testid]')
          ?.querySelector('[data-testid="user-message"]')
        ?? btn.closest(':has([data-testid="user-message"])')
      );

      /* Walk up the DOM to find the turn's root container, then check
         which marker element it contains. This is more reliable than
         relying on a single ancestor attribute. */
      let turnRoot = btn.parentElement;
      while (turnRoot && turnRoot !== document.body) {
        if (turnRoot.querySelector('[data-testid="user-message"]')) {
          break;  // found a user turn
        }
        if (turnRoot.querySelector('.font-claude-response')) {
          break;  // found a Claude turn
        }
        turnRoot = turnRoot.parentElement;
      }

      const hasUserMsg  = !!(turnRoot?.querySelector('[data-testid="user-message"]'));
      const hasClaudeMsg = !!(turnRoot?.querySelector('.font-claude-response'));
      const label = hasUserMsg ? '**You:**' : '**Claude:**';

      /* Click Claude's own copy button — writes plain Markdown to the clipboard */
      btn.click();

      /* Wait for the async clipboard write to settle */
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
    a.download = `claude-${slug}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

  } catch (e) {
    alert('claude bookmark (md/clipboard): ' + e.message);
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
})();
