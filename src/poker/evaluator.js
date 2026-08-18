const RANK_VALUE = { "2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,J:11,Q:12,K:13,A:14 };

export function rankValue(rank) {
  return RANK_VALUE[rank] || 0;
}

export function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = Number(a[i] || 0);
    const bv = Number(b[i] || 0);
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

export function handName(score) {
  const category = Number(score[0]);
  const high = Number(score[1] || 0);
  if (category === 8 && high === 14) return "ROYAL FLUSH";
  if (category === 8) return "STRAIGHT FLUSH";
  if (category === 7) return "FOUR OF A KIND";
  if (category === 6) return "FULL HOUSE";
  if (category === 5) return "FLUSH";
  if (category === 4) return "STRAIGHT";
  if (category === 3) return "THREE OF A KIND";
  if (category === 2) return "TWO PAIR";
  if (category === 1) return "ONE PAIR";
  return "HIGH CARD";
}

export function scoreFive(cards) {
  if (!Array.isArray(cards) || cards.length !== 5) throw new Error("FIVE_CARDS_REQUIRED");
  const ranks = cards.map(c => rankValue(c.rank)).sort((a,b)=>b-a);
  const counts = new Map();
  for (const r of ranks) counts.set(r, (counts.get(r)||0)+1);

  const groups = [...counts.entries()]
    .map(([rank,count])=>({rank:Number(rank),count:Number(count)}))
    .sort((a,b)=> b.count-a.count || b.rank-a.rank);

  const flush = cards.every(c=>c.suit===cards[0].suit);
  const unique = [...new Set(ranks)].sort((a,b)=>b-a);
  let straightHigh = 0;

  if ([14,5,4,3,2].every(r=>unique.includes(r))) straightHigh = 5;
  for (let i=0;i<=unique.length-5;i++) {
    const slice = unique.slice(i,i+5);
    if (slice[0]-slice[4]===4) straightHigh = Math.max(straightHigh,slice[0]);
  }

  if (flush && straightHigh) return [8,straightHigh];
  if (groups[0].count===4) {
    const kicker = groups.find(g=>g.rank!==groups[0].rank).rank;
    return [7,groups[0].rank,kicker];
  }
  if (groups[0].count===3 && groups[1]?.count===2) return [6,groups[0].rank,groups[1].rank];
  if (flush) return [5,...ranks];
  if (straightHigh) return [4,straightHigh];
  if (groups[0].count===3) {
    const ks = groups.filter(g=>g.count===1).map(g=>g.rank).sort((a,b)=>b-a);
    return [3,groups[0].rank,...ks];
  }

  const pairs = groups.filter(g=>g.count===2).map(g=>g.rank).sort((a,b)=>b-a);
  if (pairs.length>=2) {
    const kicker = groups.filter(g=>g.rank!==pairs[0]&&g.rank!==pairs[1]).map(g=>g.rank).sort((a,b)=>b-a)[0];
    return [2,pairs[0],pairs[1],kicker];
  }
  if (pairs.length===1) {
    const ks = groups.filter(g=>g.rank!==pairs[0]).map(g=>g.rank).sort((a,b)=>b-a);
    return [1,pairs[0],...ks];
  }
  return [0,...ranks];
}

export function bestTexasHand(cards) {
  if (!Array.isArray(cards) || cards.length < 5) throw new Error("NOT_ENOUGH_CARDS");
  let bestScore = null;
  let bestCards = null;
  const n = cards.length;

  for (let a=0;a<n-4;a++)
  for (let b=a+1;b<n-3;b++)
  for (let c=b+1;c<n-2;c++)
  for (let d=c+1;d<n-1;d++)
  for (let e=d+1;e<n;e++) {
    const five = [cards[a],cards[b],cards[c],cards[d],cards[e]];
    const score = scoreFive(five);
    if (!bestScore || compareScores(score,bestScore)>0) {
      bestScore = score;
      bestCards = five;
    }
  }

  return {
    score: bestScore,
    name: handName(bestScore),
    cards: bestCards,
  };
}

export function cardsEqualSet(a,b) {
  const key = cards => cards.map(c=>`${c.rank}${c.suit}`).sort().join("|");
  return key(a)===key(b);
}
