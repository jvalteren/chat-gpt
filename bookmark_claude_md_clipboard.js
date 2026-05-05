javascript:(async function() {
  try {
    /* ── helpers ── */
    function xpathAll(expr, ctx) {
      const result = document.evaluate(
        expr, ctx || document, null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null
      );
      const nodes = [];
      for (let i = 0; i < result.snapshotLength; i++) nodes.push(result.snapshotItem(i));
      return nodes;
    }

    function xpathOne(expr, ctx) {
      return document.evaluate(
        expr, ctx || document, null,
        XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
    }

    /* ── title & slug ── */
    const titleNode = xpathOne('//button[@data-testid="chat-title-button"]/div/div');
    const title = titleNode?.textContent?.trim() ?? document.title;
    const slug = title.toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/(^-)|(-$)/g, '');

    /* ── collect user turns: per bubble → copy button + attachments ──
         Attachment thumbnails live 2 levels above the bubble (turn wrapper).
         Two thumbnail shapes exist; their DOM structures are mutually exclusive:
           • image / PDF  → button > img[@alt]
           • other files  → button > div > h3[text()]                          */
    const userBubbles = xpathAll('//div[@data-user-message-bubble="true"]');
    const userTurns = userBubbles.flatMap(bubble => {
      const btn = xpathOne(
        './..//button[@data-testid="action-bar-copy"]', bubble
      );
      if (!btn) return [];

      const imgAlts = xpathAll(
        './../..//div[contains(@class,"group/thumbnail")]//button/img/@alt',
        bubble
      ).map(n => n.value).filter(Boolean);

      const h3Names = xpathAll(
        './../..//div[contains(@class,"group/thumbnail")]//h3/text()',
        bubble
      ).map(n => n.nodeValue).filter(Boolean);

      return [{ label: '**You:**', btn, attachments: [...imgAlts, ...h3Names] }];
    });

    /* ── collect Claude turns ── */
    const claudeButtons = xpathAll(
      '//div[contains(@class, "font-claude-response")]' +
      '/../../..//button[@data-testid="action-bar-copy"]'
    );
    const claudeTurns = claudeButtons.map(btn => ({
      label: '**Claude:**', btn, attachments: []
    }));

    if (userTurns.length === 0 && claudeTurns.length === 0) {
      throw new Error(
        'No copy buttons found. Make sure the chat is fully loaded.'
      );
    }

    /* ── merge and sort by document order ── */
    const turns = [...userTurns, ...claudeTurns];
    turns.sort((a, b) => {
      const pos = a.btn.compareDocumentPosition(b.btn);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return  1;
      return 0;
    });

    /* ── request clipboard-read permission up front ──
         (some browsers require a user gesture; clicking a button counts) */
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
    for (const { label, btn, attachments } of turns) {
      /* Click the copy button – it writes Markdown to the clipboard */
      btn.click();

      /* Wait for the async clipboard write to complete */
      await delay(400);

      const text = await navigator.clipboard.readText();

      let entry = `${label}\n\n`;
      if (attachments.length > 0) {
        entry += `*Attachments: ${attachments.join(', ')}*\n\n`;
      }
      entry += text;
      parts.push(entry);
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
