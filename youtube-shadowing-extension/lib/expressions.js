// 表达引擎（首版：本地规则）
// 句式结构与固定搭配来自内置语料库；单词卡优先取漏读/错读词和高频实词
// 预留引擎接口：后续可替换为 LLM 生成中文释义与迁移解释
window.YSR = window.YSR || {};

YSR.expressions = (() => {
  const PATTERNS = [
    { re: /\bnot\s+only\b[^.!?]{0,80}?\bbut\s+(?:also)\b/i, label: 'not only ... but also', meaning: '既…又…，强调并列与递进', note: '替换槽：not only A but also B，A/B 用同类成分', example: 'Not only did he finish early, but he also helped others.' },
    { re: /\bthe\s+more\b[^.!?]{0,80}?\bthe\s+more\b/i, label: 'the more ..., the more ...', meaning: '越…，就越…', note: '替换槽：前后各接一个比较结构', example: 'The more you practice, the easier it gets.' },
    { re: /\bif\s+i\s+were\s+you\b/i, label: 'if I were you', meaning: '如果我是你（虚拟语气给建议）', note: '后接 would + 动词原形', example: 'If I were you, I would start today.' },
    { re: /\bit\s+turns?\s+out\b/i, label: 'it turns out (that)', meaning: '结果是；原来', note: '替换槽：后接事实从句', example: 'It turns out that the meeting was cancelled.' },
    { re: /\bthere'?s\s+no\s+way\b/i, label: "there's no way", meaning: '绝不可能', note: '替换槽：后接从句或 of doing', example: "There's no way he forgot." },
    { re: /\bas\s+far\s+as\s+i\s+know\b/i, label: 'as far as I know', meaning: '据我所知', note: '句首插入语，缓冲语气', example: 'As far as I know, the store closes at nine.' },
    { re: /\bwhen\s+it\s+comes\s+to\b/i, label: 'when it comes to', meaning: '说到；谈及', note: '替换槽：to 后接名词或动名词', example: 'When it comes to cooking, she is the expert.' },
    { re: /\bin\s+terms\s+of\b/i, label: 'in terms of', meaning: '就…而言', note: '替换槽：后接名词短语', example: 'In terms of price, this one wins.' },
    { re: /\bmake\s+sure\b/i, label: 'make sure (that)', meaning: '确保；务必', note: '替换槽：make sure (that) + 从句', example: 'Make sure you lock the door.' },
    { re: /\bit'?s?\s+worth\b/i, label: "it's worth ...-ing", meaning: '值得做…', note: '替换槽：worth + 名词/动名词', example: 'It is worth trying again.' },
    { re: /\bend\s+up\b/i, label: 'end up ...-ing', meaning: '到头来；最终落得', note: '替换槽：end up + doing / 介词短语', example: 'We ended up staying home.' },
    { re: /\bbe\s+able\s+to\b/i, label: 'be able to', meaning: '能够', note: '比 can 更正式，可用各种时态', example: 'You will be able to do it.' },
    { re: /\bused\s+to\b/i, label: 'used to', meaning: '过去常常（现在不再）', note: '后接动词原形；注意与 be used to doing 区分', example: 'I used to live in Beijing.' },
    { re: /\bbe\s+used\s+to\b/i, label: 'be used to ...-ing', meaning: '习惯于', note: '后接名词或动名词', example: 'She is used to working late.' },
    { re: /\bhave\s+to\b/i, label: 'have to', meaning: '不得不', note: '替换槽：have to + 动词原形', example: 'I have to leave now.' },
    { re: /\bget\s+to\b(?!\s+know\b)/i, label: 'get to', meaning: '得以；有机会做', note: 'get to + 动词原形', example: 'We got to meet the author.' },
    { re: /\bthe\s+thing\s+is\b/i, label: 'the thing is', meaning: '问题是；关键在于', note: '口语中引出真正的重点', example: 'The thing is, we have no time.' },
    { re: /\bas\s+long\s+as\b/i, label: 'as long as', meaning: '只要', note: '替换槽：as long as + 条件从句', example: 'As long as you try, you improve.' },
    { re: /\bno\s+matter\s+(what|how|where|when)\b/i, label: 'no matter what/how', meaning: '无论如何', note: '替换槽：no matter + 疑问词 + 从句', example: 'No matter how hard it is, keep going.' },
    { re: /\bit\s+depends?\s+on\b/i, label: 'it depends on', meaning: '取决于', note: '替换槽：on 后接名词/动名词', example: 'It depends on the weather.' },
    { re: /\blook\s+forward\s+to\b/i, label: 'look forward to ...-ing', meaning: '期待', note: 'to 是介词，后接动名词', example: 'I look forward to hearing from you.' },
    { re: /\bbe\s+about\s+to\b/i, label: 'be about to', meaning: '即将；正要', note: '后接动词原形', example: 'We were about to start.' },
    { re: /\bmight\s+as\s+well\b/i, label: 'might as well', meaning: '不妨；还不如', note: '后接动词原形', example: 'We might as well walk there.' },
    { re: /\bchances?\s+are\b/i, label: 'chances are', meaning: '很可能', note: '后接从句', example: 'Chances are he already knows.' },
    { re: /\bthe\s+last\s+thing\b/i, label: 'the last thing ...', meaning: '最不想要的/最不该做的事', note: '强调否定倾向', example: 'That is the last thing I need today.' },
    { re: /\bkeep\s+\w+\s+from\b/i, label: 'keep ... from ...-ing', meaning: '阻止…做…', note: '替换槽：keep sb/sth from doing', example: 'Nothing kept her from trying.' },
    { re: /\bwhat\s+\w+\s+means\s+is\b/i, label: 'what ... means is', meaning: '…意味着；也就是说', note: '解释性句式', example: 'What this means is we must wait.' },
    { re: /\bit\s+seems?\s+like\b/i, label: 'it seems like', meaning: '看起来好像', note: '后接从句或名词', example: 'It seems like a good idea.' }
  ];

  const COLLOCATIONS = [
    { re: /\bmake\s+a\s+decision\b/i, label: 'make a decision', meaning: '做决定' },
    { re: /\bmake\s+sense\b/i, label: 'make sense', meaning: '有道理；说得通' },
    { re: /\bmake\s+progress\b/i, label: 'make progress', meaning: '取得进展' },
    { re: /\bmake\s+fun\s+of\b/i, label: 'make fun of', meaning: '取笑' },
    { re: /\btake\s+a\s+look\b/i, label: 'take a look', meaning: '看一眼' },
    { re: /\btake\s+care\s+of\b/i, label: 'take care of', meaning: '照顾；处理' },
    { re: /\btake\s+advantage\s+of\b/i, label: 'take advantage of', meaning: '利用' },
    { re: /\btake\s+it\s+easy\b/i, label: 'take it easy', meaning: '放轻松' },
    { re: /\btake\s+place\b/i, label: 'take place', meaning: '发生；举行' },
    { re: /\bpay\s+attention\s+to\b/i, label: 'pay attention to', meaning: '注意' },
    { re: /\bkeep\s+in\s+touch\b/i, label: 'keep in touch', meaning: '保持联系' },
    { re: /\bkeep\s+an\s+eye\s+on\b/i, label: 'keep an eye on', meaning: '留意；照看' },
    { re: /\bkeep\s+up\s+with\b/i, label: 'keep up with', meaning: '跟上' },
    { re: /\bcatch\s+up\s+with\b/i, label: 'catch up with', meaning: '赶上' },
    { re: /\bget\s+rid\s+of\b/i, label: 'get rid of', meaning: '摆脱；处理掉' },
    { re: /\bget\s+along\s+with\b/i, label: 'get along with', meaning: '与…相处' },
    { re: /\brun\s+out\s+of\b/i, label: 'run out of', meaning: '用完；耗尽' },
    { re: /\bcome\s+up\s+with\b/i, label: 'come up with', meaning: '想出（办法）' },
    { re: /\bdeal\s+with\b/i, label: 'deal with', meaning: '处理；应对' },
    { re: /\bfigure\s+out\b/i, label: 'figure out', meaning: '弄明白；想清楚' },
    { re: /\bpoint\s+out\b/i, label: 'point out', meaning: '指出' },
    { re: /\bfind\s+out\b/i, label: 'find out', meaning: '查明；发现' },
    { re: /\bwork\s+out\b/i, label: 'work out', meaning: '解决；奏效' },
    { re: /\bput\s+off\b/i, label: 'put off', meaning: '推迟' },
    { re: /\bput\s+up\s+with\b/i, label: 'put up with', meaning: '忍受' },
    { re: /\bgive\s+it\s+a\s+(shot|try)\b/i, label: 'give it a shot', meaning: '试一试' },
    { re: /\blook\s+into\b/i, label: 'look into', meaning: '调查' },
    { re: /\bbring\s+up\b/i, label: 'bring up', meaning: '提出（话题）' },
    { re: /\bcarry\s+on\b/i, label: 'carry on', meaning: '继续' },
    { re: /\bset\s+up\b/i, label: 'set up', meaning: '建立；设置' },
    { re: /\bshow\s+up\b/i, label: 'show up', meaning: '出现；露面' },
    { re: /\bpick\s+up\b/i, label: 'pick up', meaning: '学会；接（人）' },
    { re: /\ba\s+couple\s+of\b/i, label: 'a couple of', meaning: '两三个；几个' },
    { re: /\ba\s+bunch\s+of\b/i, label: 'a bunch of', meaning: '一堆；许多' },
    { re: /\bbe\s+supposed\s+to\b/i, label: 'be supposed to', meaning: '应该；被期望' },
    { re: /\bbe\s+willing\s+to\b/i, label: 'be willing to', meaning: '愿意' },
    { re: /\bbe\s+aware\s+of\b/i, label: 'be aware of', meaning: '意识到' },
    { re: /\bbe\s+into\b/i, label: 'be into', meaning: '热衷于；喜欢' },
    { re: /\bkind\s+of\b/i, label: 'kind of', meaning: '有几分；稍微' },
    { re: /\bsort\s+of\b/i, label: 'sort of', meaning: '有几分；可以说' },
    { re: /\brely\s+on\b/i, label: 'rely on', meaning: '依靠' },
    { re: /\bfocus\s+on\b/i, label: 'focus on', meaning: '专注于' },
    { re: /\bremind\s+\w+\s+of\b/i, label: 'remind sb of', meaning: '使…想起' },
    { re: /\bworth\s+it\b/i, label: 'worth it', meaning: '值得' }
  ];

  const STOPWORDS = new Set(('a an the and or but so if then than that this these those there here it its is am are was were be been being do does did doing have has had having will would can could should shall may might must of in on at to for from by with about into over after before between during without within along across behind beyond plus except as while because until since although though however therefore also just only even ever never still already yet very really quite too much many more most less least some any all both each every either neither no not nor other another such own same so s t d ll m o re ve y ain aren couldn didn doesn hadn hasn haven isn ma mightn mustn needn shan shouldn wasn weren won wouldn don get got go goes going gone make makes made take takes took taken come comes came say says said see sees saw seen know knows knew known think thinks thought want wants wanted use used using find finds found give gives gave tells told tell work works worked call calls called need needs needed feel feels felt become becomes became leave leaves left put puts mean means meant keep keeps kept let begin begins began begins seems seem seemed help helps helped talk talked speaks spoken hear hears heard show shows shown').split(/\s+/));

  function guessPos(w) {
    if (/(tion|sion|ment|ness|ity|ship|hood)$/.test(w)) return 'n. 名词';
    if (/(ous|ful|ive|able|ible|al|less)$/.test(w)) return 'adj. 形容词';
    if (/ly$/.test(w)) return 'adv. 副词';
    if (/(ize|ise|fy)$/.test(w)) return 'v. 动词';
    return '';
  }

  function findSentence(sentences, test) {
    for (const s of sentences) { if (test(s.text)) return s; }
    return null;
  }

  function countMatches(sentences, word) {
    const re = new RegExp('\\b' + word.replace(/[^a-z']/g, '') + '\\b', 'gi');
    let n = 0;
    for (const s of sentences) n += (s.text.match(re) || []).length;
    return n;
  }

  // 提取表达卡
  // opt: { sentences, missedWords, rangeSeconds }
  function extract(opt) {
    const sentences = opt.sentences || [];
    const missed = opt.missedWords || [];
    const minutes = Math.max(1, Math.round((opt.rangeSeconds || 300) / 60));
    const maxCount = Math.min(12, Math.max(5, Math.round(minutes * 2)));
    const cards = [];
    const seen = new Set();
    const push = (c) => {
      const key = c.key || (c.category + '|' + c.expression.toLowerCase());
      if (seen.has(key)) return;
      seen.add(key);
      cards.push({ ...c, key });
    };

    // 1. 句式结构
    for (const p of PATTERNS) {
      if (cards.length >= maxCount) break;
      const s = findSentence(sentences, (t) => p.re.test(t));
      if (!s) continue;
      push({
        category: 'pattern', expression: p.label, meaning: p.meaning,
        sourceSentence: s.text, timestamp: s.start,
        usageNote: p.note, example: p.example, transferable: true
      });
    }

    // 2. 固定搭配
    for (const c of COLLOCATIONS) {
      if (cards.length >= maxCount) break;
      const s = findSentence(sentences, (t) => c.re.test(t));
      if (!s) continue;
      push({
        category: 'collocation', expression: c.label, meaning: c.meaning,
        sourceSentence: s.text, timestamp: s.start,
        usageNote: '口语高频搭配，注意整体记忆'
      });
    }

    // 3. 漏读词：按「难度 × 出现次数」排序，过滤功能词/过短词，最多展示 4 个
    const syllables = (w) => { const m = String(w).toLowerCase().match(/[aeiouy]+/g); return m ? m.length : 1; };
    const freq = new Map();
    (missed || []).forEach((w) => {
      const k = String(w || '').toLowerCase().replace(/[^a-z']/g, '');
      if (!k || k.length < 3 || STOPWORDS.has(k)) return;
      freq.set(k, (freq.get(k) || 0) + 1);
    });
    const missedRanked = [...freq.entries()]
      .map(([w, n]) => ({ w, n, score: w.length + syllables(w) * 2 + Math.min(n, 3) * 2 }))
      .sort((a, b) => b.score - a.score);
    let shownMissed = 0;
    for (const { w } of missedRanked) {
      if (cards.length >= maxCount || shownMissed >= 4) break;
      const s = findSentence(sentences, (t) => new RegExp('\\b' + w + '\\b', 'i').test(t));
      if (!s) continue;
      push({
        category: 'word', expression: w, meaning: '',
        pos: guessPos(w),
        sourceSentence: s.text, timestamp: s.start,
        usageNote: '完整跟读中的漏读词 · 建议复听原句模仿'
      });
      shownMissed++;
    }

    return { cards: cards.slice(0, maxCount), missedRanked: missedRanked.map((m) => m.w) };
  }

  return { extract, PATTERNS, COLLOCATIONS };
})();
