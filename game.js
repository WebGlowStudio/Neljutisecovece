/* Ne ljuti se čoveče — čista pravila, bez DOM-a.
   Položaj figure: -1 kućica, 0–39 staza (relativno od starta boje), 40–43 cilj. */

export const PATH = [
  [0,4],[1,4],[2,4],[3,4],[4,4],[4,3],[4,2],[4,1],[4,0],[5,0],
  [6,0],[6,1],[6,2],[6,3],[6,4],[7,4],[8,4],[9,4],[10,4],[10,5],
  [10,6],[9,6],[8,6],[7,6],[6,6],[6,7],[6,8],[6,9],[6,10],[5,10],
  [4,10],[4,9],[4,8],[4,7],[4,6],[3,6],[2,6],[1,6],[0,6],[0,5]
];

export const COLORS = [
  {id:'red',    name:'Crveni',  v:'var(--red)',    hex:'#ff4d6d', start:0,  lane:[[1,5],[2,5],[3,5],[4,5]],   yard:[[0,0],[1,0],[0,1],[1,1]]},
  {id:'blue',   name:'Plavi',   v:'var(--blue)',   hex:'#4dabff', start:10, lane:[[5,1],[5,2],[5,3],[5,4]],   yard:[[9,0],[10,0],[9,1],[10,1]]},
  {id:'green',  name:'Zeleni',  v:'var(--green)',  hex:'#3ddc97', start:20, lane:[[9,5],[8,5],[7,5],[6,5]],   yard:[[9,9],[10,9],[9,10],[10,10]]},
  {id:'yellow', name:'Žuti',    v:'var(--yellow)', hex:'#ffc93f', start:30, lane:[[5,9],[5,8],[5,7],[5,6]],   yard:[[0,9],[1,9],[0,10],[1,10]]}
];

export const SPOS = {star:[6,16,26,36], shield:[8,18,28,38], boost:[3,13,23,33]};
export const ALL_SPECIALS = ['star','shield','boost'];
export const LVNAME = {easy:'lak', medium:'srednji', hard:'težak'};

/** Koje boje sede za 2, 3 ili 4 igrača, relativno od boje prvog igrača. */
export function seatOffsets(count){
  if(count===2) return [0,2];
  if(count===3) return [0,1,3];
  return [0,1,2,3];
}

export function absOf(pl, p){ return (COLORS[pl.c].start + p) % 40; }

export function coordsOf(pl, p, i){
  const C = COLORS[pl.c];
  if(p===-1) return C.yard[i];
  if(p<40) return PATH[absOf(pl, p)];
  return C.lane[p-40];
}

export function special(state, a){
  if(!state || a==null) return null;
  for(const t of state.sp){
    if(SPOS[t] && SPOS[t].includes(a)) return t;
  }
  return null;
}

export function occAt(state, a, except){
  for(const op of state.players){
    if(op===except) continue;
    for(let i=0;i<4;i++){
      const p = op.pieces[i];
      if(p>=0 && p<40 && absOf(op, p)===a) return {pl:op, i};
    }
  }
  return null;
}

export function landOk(state, pl, i, from, t){
  if(t>43) return false;
  if(t>=40){
    for(let k=Math.max(from+1,40); k<=t; k++){
      if(pl.pieces.some((q,j)=>j!==i && q===k)) return false;
    }
    return true;
  }
  if(pl.pieces.some((q,j)=>j!==i && q===t)) return false;
  const a = absOf(pl, t);
  if(special(state, a)==='shield' && occAt(state, a, pl)) return false;
  return true;
}

export function legalMoves(state, pl, r){
  const res = [];
  pl.pieces.forEach((p,i)=>{
    let t;
    if(p===-1){ if(r!==6) return; t=0; }
    else t = p+r;
    if(!landOk(state, pl, i, p, t)) return;
    let fin=t, boosted=false;
    if(t<40 && p!==-1 && special(state, absOf(pl,t))==='boost' && landOk(state, pl, i, t, t+3)){
      fin=t+3; boosted=true;
    }
    res.push({i, from:p, to:t, fin, boosted});
  });
  return res;
}

export function noneOnTrack(pl){
  return pl.pieces.every(p=>p===-1 || p>=40);
}

/** Šta se dešava posle bacanja, pre izbora figure. */
export function resolveRoll(state, roll){
  const pl = state.players[state.turn];
  const moves = legalMoves(state, pl, roll);
  if(moves.length) return {kind:'play', moves};
  state.tries = (state.tries||0)+1;
  if(noneOnTrack(pl) && roll!==6 && state.tries<3) return {kind:'retry'};
  return {kind:'pass'};
}

/**
 * primeni potez (bez animacije).
 * Hvata protivnika i na turbo polju (to) i na krajnjem (fin).
 */
export function applyMove(state, move){
  const pl = state.players[state.turn];
  const captured = [];
  const captureAt = (rel)=>{
    if(rel<0 || rel>=40) return;
    const a = absOf(pl, rel);
    const o = occAt(state, a, pl);
    if(o){ o.pl.pieces[o.i] = -1; captured.push({pl:o.pl, i:o.i, at:rel}); }
  };
  pl.pieces[move.i] = move.to;
  captureAt(move.to);
  if(move.boosted) pl.pieces[move.i] = move.fin;
  captureAt(move.fin);
  const f = pl.pieces[move.i];
  const star = f<40 && special(state, absOf(pl, f))==='star';
  const won = pl.pieces.every(p=>p>=40);
  const rollAgain = !won && (state.dice===6 || star);
  return {captured, boosted:!!move.boosted, star, won, rollAgain, home:f>=40};
}

export function nextTurn(state){
  state.turn = (state.turn+1) % state.players.length;
  state.tries = 0;
  state.dice = null;
}

export function danger(state, pl, a){
  if(special(state, a)==='shield') return 0;
  let n=0;
  for(const op of state.players){
    if(op===pl) continue;
    for(const p of op.pieces){
      if(p>=0 && p<40){
        const d = (a - absOf(op,p) + 40) % 40;
        if(d>=1 && d<=6 && p+d<40) n++;
      }
    }
    if(a===COLORS[op.c].start && op.pieces.includes(-1)) n+=.5;
  }
  return n;
}

export function scoreMove(state, pl, m, hard){
  let s=0;
  const f=m.fin;
  if(f<40){
    const a=absOf(pl,f), o=occAt(state,a,pl);
    if(o) s+=50+(hard?o.pl.pieces[o.i]*0.8:0);
    if(special(state,a)==='star') s+=15;
    if(hard){ s-=danger(state,pl,a)*(12+f*.6); if(special(state,a)==='shield') s+=6; }
  } else s+=30+(f-40)*8; // dublje u cilj, da ne zapuši ulaz
  if(m.from===-1) s+=35;
  if(m.boosted) s+=6;
  if(hard && m.from>=0 && m.from<40) s+=danger(state,pl,absOf(pl,m.from))*(10+m.from*.6);
  s+=(f-Math.max(m.from,0))*.5 + Math.max(m.from,0)*.1;
  return s;
}

export function aiPick(state, pl, ms, rng=Math.random){
  if(!ms.length) return null;
  if(pl.ai==='easy'){
    return rng()<.35
      ? ms.reduce((a,b)=>scoreMove(state,pl,b,false)>scoreMove(state,pl,a,false)?b:a)
      : ms[Math.floor(rng()*ms.length)];
  }
  const hard = pl.ai==='hard';
  let best=ms[0], bs=-1e9;
  for(const m of ms){
    const s=scoreMove(state,pl,m,hard)+rng()*(hard?1:6);
    if(s>bs){ bs=s; best=m; }
  }
  return best;
}

/**
 * Podešavanja: {color, count, modes, difficulty, specials}
 * modes[i] je 'human' ili 'bot' za i-tog igrača (modes[0] je uvek vlasnik table).
 */
export function createGame(opts){
  const color = ((opts.color??0)%4+4)%4;
  const count = Math.min(4, Math.max(2, opts.count||4));
  const offs = seatOffsets(count);
  const modes = offs.map((_,i)=> i===0 ? 'human' : (opts.modes && opts.modes[i]) || 'bot');
  const difficulty = ['easy','medium','hard'].includes(opts.difficulty) ? opts.difficulty : 'medium';
  const spList = Array.isArray(opts.specials) ? opts.specials.filter(t=>ALL_SPECIALS.includes(t)) : ALL_SPECIALS.slice();
  const players = offs.map((o,i)=>({
    c: (color+o)%4,
    human: modes[i]==='human',
    ai: modes[i]==='human' ? null : difficulty,
    pieces: [-1,-1,-1,-1]
  }));
  return {
    turn:0, tries:0, dice:null, over:false,
    sp: new Set(spList),
    players,
    count, difficulty, specials: spList
  };
}

/** Igraj od početka do pobednika sa nizom bacanja. pick bira potez. */
export function playSequence(state, rolls, pick){
  const log = [];
  let ri = 0;
  let guard = 0;
  while(!state.over && ri<rolls.length && guard++<10000){
    const pl = state.players[state.turn];
    const roll = rolls[ri++];
    state.dice = roll;
    const res = resolveRoll(state, roll);
    if(res.kind==='retry'){ log.push({roll, kind:'retry', c:pl.c}); continue; }
    if(res.kind==='pass'){ log.push({roll, kind:'pass', c:pl.c}); nextTurn(state); continue; }
    const move = pick ? pick(state, pl, res.moves, roll) : res.moves[0];
    if(!move){ log.push({roll, kind:'pass', c:pl.c}); nextTurn(state); continue; }
    const out = applyMove(state, move);
    log.push({roll, kind:'move', c:pl.c, move, out});
    if(out.won){ state.over=true; state.winner=pl; break; }
    if(out.rollAgain){ state.tries=0; continue; }
    nextTurn(state);
  }
  return log;
}
