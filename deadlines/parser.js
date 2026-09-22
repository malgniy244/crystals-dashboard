/* Production-schedule parser — runs in browser and Node.
   Input: raw text from a Word production schedule (mammoth extractRawText).
   Output: { auctions: [...], issues: [...] }
*/
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ScheduleParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  const MON_RE = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const SEASON_MONTH = { spring: 4, summer: 8, fall: 10, autumn: 10, winter: 1 };

  function monthIndex(word) {
    const w = word.toLowerCase().slice(0, 3);
    return MONTHS.findIndex(m => m.slice(0, 3) === w);
  }

  function clean(s) {
    return s.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Parse a single date string. Returns {m,d,y|null} or null.
  function parseDate(str) {
    if (!str) return null;
    let s = clean(str).replace(/\(.*?\)/g, '').replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, '$1').replace(/\^/g, '');
    let m;
    // 9/16/2026, 9/16/26, 6/30
    if ((m = s.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/))) {
      let y = m[3] ? parseInt(m[3], 10) : null;
      if (y !== null && y < 100) y += 2000;
      return { m: parseInt(m[1], 10), d: parseInt(m[2], 10), y };
    }
    // "September 11", "Sept 11, 2026", "Dec 7", "Thursday, October 1 @9AM", "Aug 31"
    const re = new RegExp('\\b(' + MON_RE + ')\\.?\\s+(\\d{1,2})(?:\\s*,?\\s*(\\d{4}))?', 'i');
    if ((m = s.match(re))) {
      return { m: monthIndex(m[1]) + 1, d: parseInt(m[2], 10), y: m[3] ? parseInt(m[3], 10) : null };
    }
    return null;
  }

  function toISO(dt) {
    return dt.y + '-' + String(dt.m).padStart(2, '0') + '-' + String(dt.d).padStart(2, '0');
  }
  function dayNum(dt) { return dt.y * 10000 + dt.m * 100 + dt.d; }

  // Does the line look like an auction heading?
  function isHeading(line) {
    const l = line.trim();
    if (l.length < 12 || l.length > 160) return false;
    if (/^(consignment|consignor|auction|contracts|imaging|cataloging|catalogue|sorting|zeus|send|post|catalogs|presale|preliminary|strong|how did|taxable|lot |venue|malca|reserves|finalize|processing|customs|final|us |hk |ny |costa|lots:|dates|est\.|show:|world (coins|paper):|ancient)/i.test(l)) return false;
    const startsWithPeriod = new RegExp('^(' + MON_RE + '|spring|summer|fall|autumn|winter|bruun)\\b', 'i').test(l);
    const hasKeyword = /auction|sale\b|collections? &|collectors choice|showcase|cco\b|cca\b|bruun/i.test(l);
    return startsWithPeriod && hasKeyword;
  }

  // From heading: base year and approximate auction month
  function headingContext(h) {
    const y = (h.match(/\b(20\d{2})\b/) || [])[1];
    let month = null;
    const mm = h.match(new RegExp('^(' + MON_RE + ')', 'i'));
    if (mm) month = monthIndex(mm[1]) + 1;
    else {
      const sm = h.match(/^(spring|summer|fall|autumn|winter)/i);
      if (sm) month = SEASON_MONTH[sm[1].toLowerCase()];
      else {
        const anyM = h.match(new RegExp('\\b(' + MON_RE + ')\\b', 'i'));
        if (anyM) month = monthIndex(anyM[1]) + 1;
      }
    }
    return { baseYear: y ? parseInt(y, 10) : null, auctionMonth: month };
  }

  const CONSIGN_RE = /consignment deadline|deadline for (coins|items) to be graded|consignment deadlines/i;
  const NON_CONSIGN_RE = /contracts|imaging|cataloging|catalogue|sorting|zeus|review|send to|post (sale|online)|catalogs mail|press release|lot (viewing|labeling|imaging)|malca|reserves|taxable|preliminary|consignor settlement|how did|finalize|processing|customs|sale list|mailing|translations|auction|show|venue|lot viewing|publish|racks|spreadsheet|scan|est\.|lots:|dates/i;

  function classify(label, ctx) {
    const l = label.toLowerCase();
    const isRaw = /to be graded/.test(l) && !/\(graded & ready/.test(l);
    const isTIB = /\btib\b/.test(l) && !/non-tib items sourced/.test(l.replace(/tib & non-tib/,'')); // "TIB & Non-TIB" counts as TIB
    const isHK = /hong kong|\bhk\b/.test(l) && !isTIB;
    let type = isRaw ? 'RAW' : isTIB ? 'TIB' : isHK ? 'HK' : 'STD';
    if (isRaw && isTIB) type = 'TIB'; // "including TIB coins, coins to be graded" -> TIB
    // category text
    let cat = '';
    let c = label
      .replace(/consignment deadlines?/ig, '')
      .replace(/deadline for (coins|items) to be graded/ig, '')
      .replace(/for (coins|items) to be graded/ig, '')
      .replace(/for items sourced from hong kong/ig, '')
      .replace(/for tib( & non-tib)? items( sourced)? from hong kong/ig, '')
      .replace(/for items sourced from us,? including z-lots & roll-?overs/ig, '')
      .replace(/,? ?including (tib coins, coins to be graded, )?z-? ?lots( & roll-?overs)?/ig, '')
      .replace(/\(graded & ready to catalog\)/ig, '(graded)')
      .replace(/^\s*for\s+/i, '')
      .replace(/\bto be graded\b/ig, '')
      .replace(/[:,\s]+$/g, '').replace(/^[\s,:-]+/, '');
    c = clean(c);
    if (ctx.section) cat = ctx.section + (c ? ' – ' + c : '');
    else cat = c;
    if (ctx.groupLabel && ctx.subLabel) cat = ctx.subLabel; // e.g. "World Coins" under "sourced from US" group
    return { type, cat };
  }

  function parse(text, sourceName) {
    const lines = text.split(/\r?\n/).map(clean).filter(l => l.length);
    const auctions = [];
    const issues = [];
    let cur = null;
    let ctx = { section: null, groupLabel: null, subLabel: null, inGroup: false };

    function newAuction(name) {
      const hc = headingContext(name);
      if (!hc.baseYear) {
        const prev = auctions.length ? auctions[auctions.length - 1].baseYear : null;
        hc.baseYear = prev;
        if (prev) issues.push({ auction: name, level: 'info', msg: 'Heading has no year — assumed ' + prev });
      }
      cur = { name, source: sourceName, baseYear: hc.baseYear, auctionMonth: hc.auctionMonth,
              auctionText: null, consignments: [], settlement: null, settlementText: null, notes: [] };
      auctions.push(cur);
      ctx = { section: null, groupLabel: null, subLabel: null, inGroup: false };
    }

    function addConsign(label, dateStr, extraCat) {
      const dt = parseDate(dateStr);
      const cls = classify(label, ctx);
      const cat = extraCat !== undefined ? (ctx.section ? ctx.section + ' – ' + extraCat : extraCat) : cls.cat;
      if (!dt) {
        if (/tbd/i.test(dateStr)) cur.notes.push('Consignment deadline TBD: ' + label);
        else issues.push({ auction: cur.name, level: 'warn', msg: 'Could not read date for "' + label + ': ' + dateStr + '"' });
        return;
      }
      cur.consignments.push({ label, cat, type: cls.type, raw: dt, dateText: dateStr });
    }

    for (const line of lines) {
      if (isHeading(line)) { newAuction(line); continue; }
      if (!cur) continue;
      const ci = line.indexOf(':');
      if (ci < 0) {
        // no colon: could be a group sub-line w/o value or a note
        if (/tentative|tbd/i.test(line)) cur.notes.push(line);
        continue;
      }
      const label = clean(line.slice(0, ci));
      const value = clean(line.slice(ci + 1));
      const isConsignLabel = CONSIGN_RE.test(label);

      if (isConsignLabel) {
        ctx.inGroup = false; ctx.subLabel = null;
        if (!value) { ctx.inGroup = true; ctx.groupLabel = label; continue; }
        // inline multi: "Coins: July 6; Paper: July 27"
        if (/;/.test(value) && /:/.test(value)) {
          value.split(';').forEach(part => {
            const pi = part.indexOf(':');
            if (pi > 0) addConsign(label, clean(part.slice(pi + 1)), clean(part.slice(0, pi)));
          });
          continue;
        }
        // "World Coins: July 20" style handled elsewhere; here plain
        addConsign(label, value);
        continue;
      }

      if (/consignor settlement/i.test(label)) {
        const dt = parseDate(value);
        if (dt) { cur.settlement = dt; cur.settlementText = value; }
        else issues.push({ auction: cur.name, level: 'warn', msg: 'Could not read settlement date: "' + value + '"' });
        ctx.inGroup = false; continue;
      }

      if (/^auction( ends)?$/i.test(label) || /auction$/i.test(label) && !/lot viewing/i.test(label)) {
        if (!cur.auctionText) cur.auctionText = value;
        const dt = parseDate(value);
        if (dt && !cur.auctionDate) cur.auctionDate = dt;
        ctx.inGroup = false; continue;
      }

      if (!value) {
        // section header like "World Coins:" / "US Coins & Currency:" / "Lot Viewing:"
        ctx.inGroup = false; ctx.subLabel = null;
        if (NON_CONSIGN_RE.test(label)) { ctx.section = null; }
        else ctx.section = label;
        continue;
      }

      // group sub-lines: "Ancient & World Coins: June 22", "World Paper: July 27"
      if (ctx.inGroup && !NON_CONSIGN_RE.test(label) && parseDate(value)) {
        ctx.subLabel = label;
        addConsign(ctx.groupLabel, value, label);
        ctx.subLabel = null;
        continue;
      }
      // any other recognised production line ends group mode
      if (NON_CONSIGN_RE.test(label)) ctx.inGroup = false;
    }

    // ---- post-process: resolve years, flag latest, dedupe, issues ----
    for (const a of auctions) {
      const by = a.baseYear || new Date().getFullYear();
      const am = a.auctionMonth || 6;
      const anchor = a.auctionDate && a.auctionDate.y ? a.auctionDate
                   : { y: by, m: a.auctionDate ? a.auctionDate.m : am, d: a.auctionDate ? a.auctionDate.d : 15 };
      const anchorNum = dayNum(anchor);

      function resolve(dt, kind) {
        if (dt.y) {
          if (dt.y !== by && Math.abs(dt.y - by) > 1) issues.push({ auction: a.name, level: 'error', msg: 'Date year ' + dt.y + ' does not match auction year ' + by + ' (' + toISO(dt) + ') — stale copy?' });
          else if (dt.y < by && kind === 'consign' && (by - dt.y) === 1 && dt.m < 10) issues.push({ auction: a.name, level: 'error', msg: 'Consignment date ' + toISO(dt) + ' is a year before the auction — stale copy?' });
          return dt;
        }
        let y = by;
        if (kind === 'consign') {
          // consignment must be before auction; if it lands after, it belongs to previous year
          if (dayNum({ y, m: dt.m, d: dt.d }) > anchorNum + 40) y = by - 1;
        } else {
          if (dayNum({ y, m: dt.m, d: dt.d }) < anchorNum - 5) y = by + 1;
        }
        return { y, m: dt.m, d: dt.d };
      }

      a.consignments.forEach(c => { c.date = resolve(c.raw, 'consign'); c.iso = toISO(c.date); });
      if (a.settlement) { a.settlement = resolve(a.settlement, 'settle'); a.settlementISO = toISO(a.settlement); }

      // latest per category (non-RAW). If category-specific entries exist, general ("") entries are not "latest".
      const nonRaw = a.consignments.filter(c => c.type !== 'RAW');
      const cats = [...new Set(nonRaw.map(c => c.cat))];
      const specific = cats.filter(c => c !== '');
      // overall latest
      if (nonRaw.length) {
        const max = Math.max(...nonRaw.map(c => dayNum(c.date)));
        nonRaw.forEach(c => { if (dayNum(c.date) === max) c.overallLatest = true; });
      }
      for (const cat of cats) {
        const inCat = nonRaw.filter(c => c.cat === cat);
        if (cat === '' && specific.length) { inCat.forEach(c => { if (c.overallLatest) c.latest = true; }); continue; }
        const max = Math.max(...inCat.map(c => dayNum(c.date)));
        inCat.forEach(c => { if (dayNum(c.date) === max) c.latest = true; });
      }
      // dedupe by iso + type: merge categories
      const seen = new Map();
      const merged = [];
      for (const c of a.consignments) {
        const k = c.iso + '|' + c.type;
        if (seen.has(k)) {
          const p = seen.get(k);
          if (c.cat && !p.cat.split(' / ').includes(c.cat)) p.cat = p.cat ? p.cat + ' / ' + c.cat : c.cat;
          p.latest = p.latest || c.latest; p.overallLatest = p.overallLatest || c.overallLatest;
        } else { seen.set(k, c); merged.push(c); }
      }
      a.consignments = merged.sort((x, y) => dayNum(x.date) - dayNum(y.date));

      a.hkRelated = /hong kong/i.test(a.name) || a.consignments.some(c => c.type === 'TIB' || c.type === 'HK');
      a.hasTIB = a.consignments.some(c => c.type === 'TIB');

      // issues
      if (!a.consignments.length) issues.push({ auction: a.name, level: 'info', msg: 'No consignment deadline found (single-consignor / Bruun / TBD?)' });
      if (!a.settlement) issues.push({ auction: a.name, level: 'info', msg: 'No consignor settlement date found' });
      const wk = d => new Date(d.y, d.m - 1, d.d).getDay();
      if (a.settlement && (wk(a.settlement) === 0 || wk(a.settlement) === 6)) issues.push({ auction: a.name, level: 'warn', msg: 'Settlement ' + a.settlementISO + ' falls on a weekend' });
      a.consignments.forEach(c => { if (wk(c.date) === 0 || wk(c.date) === 6) issues.push({ auction: a.name, level: 'warn', msg: 'Consignment deadline ' + c.iso + ' (' + (c.cat || c.type) + ') falls on a weekend' }); });
      const tib = a.consignments.find(c => c.type === 'TIB');
      const raw = a.consignments.find(c => c.type === 'RAW');
      if (tib && raw && dayNum(tib.date) < dayNum(raw.date)) issues.push({ auction: a.name, level: 'warn', msg: 'TIB deadline (' + tib.iso + ') is earlier than the to-be-graded deadline (' + raw.iso + ') — check' });
      if (a.notes.some(n => /tentative/i.test(n))) issues.push({ auction: a.name, level: 'info', msg: 'Dates marked tentative' });
      a.notes.filter(n => /tbd/i.test(n)).forEach(n => issues.push({ auction: a.name, level: 'info', msg: n }));
    }

    // duplicate auction names across files
    const names = {};
    auctions.forEach(a => { names[a.name] = (names[a.name] || 0) + 1; });
    Object.entries(names).filter(([, n]) => n > 1).forEach(([n]) => issues.push({ auction: n, level: 'warn', msg: 'Auction heading appears more than once' }));

    return { auctions, issues };
  }

  return { parse, parseDate, isHeading };
});
