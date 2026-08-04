const FILLER = [
  [/\bit(?:'s| is) (?:worth (?:noting|mentioning)|important to (?:note|remember|understand))\b/i, 'filler opener; state the fact directly'],
  [/\b(?:needless to say|as (?:we|you) can see|as mentioned (?:above|earlier|previously)|at the end of the day|when all is said and done)\b/i, 'filler phrase carrying no information'],
  [/\b(?:in this (?:section|document|guide|article),? (?:we|I) (?:will|'ll)|this (?:section|document|guide) (?:will )?(?:covers?|explains?|describes?|walks? through)|let(?:'s| us) (?:dive in|get started|take a look|explore))\b/i, 'announces content instead of delivering it'],
  [/\b(?:simply put|put simply|in other words,? (?:what|this) (?:this |it )?means)\b/i, 'restates the previous sentence'],
  [/\bin order to\b/i, 'use "to"'],
  [/\b(?:due to the fact that|for the (?:simple )?reason that|in spite of the fact that)\b/i, 'use "because" or "although"'],
  [/\b(?:a (?:wide )?(?:variety|number|range) of|a plethora of|any and all)\b/i, 'padded quantifier'],
  [/\b(?:first and foremost|last but not least|each and every)\b/i, 'padded phrase'],
  [/\bhope(?:fully)? this helps\b|\blet me know if you (?:have any questions|need anything)\b/i, 'conversational filler in a document'],
];

const CEREMONY_HEADING = /^#{1,6}\s*(conclusion|summary|in (?:closing|summary)|final thoughts?|wrapping up|wrap[- ]up|closing (?:thoughts|remarks)|that(?:'s| is) it|key takeaways?|recap)\s*$/i;

const HEDGES = /\b(?:might|may|could|possibly|potentially|perhaps|somewhat|fairly|rather|generally|typically|usually|often|arguably|seemingly|apparently|relatively|quite|likely|tends? to|sort of|kind of)\b/gi;

const STOPWORDS = new Set(['a', 'an', 'the', 'of', 'to', 'this', 'that', 'these', 'is', 'are', 'be', 'we', 'it', 'its', 'for', 'in', 'on', 'at', 'and', 'or', 'as', 'with', 'from', 'by', 'into', 'all', 'each', 'any', 'here', 'up', 'out', 'do', 'does', 'if', 'then', 'so', 'you', 'your', 'can', 'will', 'how', 'what', 'when', 'why', 'use', 'using']);

function tokens(text) {
  return text
    .replace(/[^A-Za-z0-9\s]+/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function classifyLines(lines) {
  const out = [];
  let inFence = false;
  let inFrontmatter = false;
  let pendingHeading = null;

  const hasFrontmatter = (lines[0] ?? '').trim() === '---'
    && lines.slice(1).some((l) => (l ?? '').trim() === '---');

  lines.forEach((raw, idx) => {
    const line = raw ?? '';
    const trimmed = line.trim();

    if (idx === 0 && hasFrontmatter) { inFrontmatter = true; return; }
    if (inFrontmatter) {
      if (trimmed === '---') inFrontmatter = false;
      return;
    }
    if (/^(```|~~~)/.test(trimmed)) { inFence = !inFence; return; }
    if (inFence || !trimmed) return;
    if (/^\|/.test(trimmed) || /^(\s*)(>|\[[^\]]+\]:)/.test(trimmed)) return;

    const heading = trimmed.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      if (CEREMONY_HEADING.test(trimmed)) {
        out.push({ index: idx, raw: trimmed, rule: 'ceremony-heading', why: 'ceremony section; fold the content into the body or drop it' });
        pendingHeading = null;
        return;
      }
      pendingHeading = { text: heading[1], index: idx };
      return;
    }

    const prose = trimmed.replace(/^[-*+]\s+|^\d+\.\s+/, '');

    if (pendingHeading) {
      const hw = tokens(pendingHeading.text);
      const pt = tokens(prose);
      const pw = new Set(pt);
      if (hw.length >= 2 && pw.size && pt.length <= 12 && !prose.endsWith(':')) {
        const hits = hw.filter((w) => pw.has(w)).length;
        const hs = new Set(hw);
        const novel = [...pw].filter((w) => !hs.has(w)).length / pw.size;
        if (hits / hw.length >= 0.6 && novel <= 0.5) {
          out.push({ index: idx, raw: trimmed, rule: 'heading-echo', why: `adds nothing beyond the heading "${pendingHeading.text}"` });
        }
      }
      pendingHeading = null;
    }

    for (const [re, why] of FILLER) {
      const m = prose.match(re);
      if (m) {
        out.push({ index: idx, raw: m[0], rule: 'filler', why });
        break;
      }
    }

    for (const sentence of prose.split(/(?<=[.!?])\s+/)) {
      const hedges = sentence.match(HEDGES);
      if (hedges && hedges.length >= 3) {
        out.push({ index: idx, raw: hedges.join(' + '), rule: 'hedge-stack', why: 'stacked hedging; commit to a claim or state the uncertainty once' });
        break;
      }
    }
  });

  return out;
}

function analyze(addedLines, allLines) {
  const added = new Set(addedLines);
  return { violations: classifyLines(allLines).filter((v) => added.has(v.index)).map((v) => ({ ...v, line: v.index + 1 })) };
}

module.exports = { analyze, classifyLines, FILLER, CEREMONY_HEADING };
