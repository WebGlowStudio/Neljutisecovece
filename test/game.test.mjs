import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLORS, SPOS, createGame, legalMoves, landOk, applyMove, resolveRoll,
  nextTurn, playSequence, absOf, occAt, special, seatOffsets, aiPick, noneOnTrack
} from '../game.js';

function p(state, i){ return state.players[i]; }
function setPieces(pl, arr){ pl.pieces = arr.slice(); }

test('sedenje: 2 igrača naspram, 3 preskaču jednu boju, 4 svi', () => {
  assert.deepEqual(seatOffsets(2), [0,2]);
  assert.deepEqual(seatOffsets(3), [0,1,3]);
  assert.deepEqual(seatOffsets(4), [0,1,2,3]);
  const g2 = createGame({color:0, count:2, modes:['human','bot']});
  assert.equal(g2.players.length, 2);
  assert.equal(g2.players[0].c, 0);
  assert.equal(g2.players[1].c, 2);
  const g3 = createGame({color:1, count:3});
  assert.deepEqual(g3.players.map(x=>x.c), [1,2,0]);
});

test('iz kućice se izlazi samo sa 6', () => {
  const g = createGame({color:0, count:2, specials:[]});
  const me = p(g,0);
  assert.equal(legalMoves(g, me, 1).length, 0);
  assert.equal(legalMoves(g, me, 5).length, 0);
  const ms = legalMoves(g, me, 6);
  assert.equal(ms.length, 4); // sve 4 figure mogu da izađu
  assert.ok(ms.every(m=>m.from===-1 && m.to===0 && m.fin===0));
});

test('tri pokušaja kad niko nije na stazi, pa predaja poteza', () => {
  const g = createGame({color:0, count:2, specials:[]});
  g.tries = 0;
  let r = resolveRoll(g, 3);
  assert.equal(r.kind, 'retry');
  assert.equal(g.tries, 1);
  r = resolveRoll(g, 2);
  assert.equal(r.kind, 'retry');
  assert.equal(g.tries, 2);
  r = resolveRoll(g, 4);
  assert.equal(r.kind, 'pass');
  assert.equal(g.tries, 3);
});

test('šestica u kućici daje izlaz, ne retry', () => {
  const g = createGame({color:0, count:2, specials:[]});
  const r = resolveRoll(g, 6);
  assert.equal(r.kind, 'play');
  assert.equal(r.moves.length, 4);
});

test('kretanje po stazi za tačan broj', () => {
  const g = createGame({color:0, count:2, specials:[]});
  setPieces(p(g,0), [4,-1,-1,-1]);
  const ms = legalMoves(g, p(g,0), 3);
  assert.deepEqual(ms, [{i:0, from:4, to:7, fin:7, boosted:false}]);
});

test('ne smeš da staneš na sopstvenu figuru', () => {
  const g = createGame({color:0, count:2, specials:[]});
  setPieces(p(g,0), [0,3,-1,-1]);
  const ms = legalMoves(g, p(g,0), 3); // figura 0 bi pala na 3
  assert.ok(!ms.some(m=>m.i===0));
  assert.ok(ms.some(m=>m.i===1 && m.to===6));
});

test('jedenje: staneš na protivnika, vraća se u kućicu', () => {
  const g = createGame({color:0, count:2, specials:[]});
  // crveni start 0, zeleni start 20. Crveni na 10 (abs 10), zeleni na 30? (20+30)%40=10. Use abs.
  // Simpler: crveni ide na 0 gde već stoji zeleni.
  // zeleni abs 0: (20 + p)%40 = 0 => p=20
  setPieces(p(g,0), [5,-1,-1,-1]);
  setPieces(p(g,1), [20,-1,-1,-1]);
  assert.equal(absOf(p(g,1), 20), 0);
  // Wait, crveni is at 5, needs to land on zeleni's abs. zeleni at 20 is abs 0, crveni's start.
  // Better: both on same abs. crveni at 10 is abs 10. zeleni: (20+p)%40=10 => p=30
  setPieces(p(g,0), [8,-1,-1,-1]);
  setPieces(p(g,1), [30,-1,-1,-1]);
  assert.equal(absOf(p(g,0), 10), 10);
  assert.equal(absOf(p(g,1), 30), 10);
  setPieces(p(g,0), [8,-1,-1,-1]);
  const ms = legalMoves(g, p(g,0), 2);
  const m = ms.find(x=>x.i===0);
  assert.ok(m && m.fin===10);
  g.dice = 2;
  const out = applyMove(g, m);
  assert.equal(out.captured.length, 1);
  assert.equal(p(g,1).pieces[0], -1);
  assert.equal(p(g,0).pieces[0], 10);
});

test('štit: ne možeš da jedeš figuru na štitu', () => {
  const g = createGame({color:0, count:2, specials:['shield']});
  // shield at abs 8,18,28,38. crveni relative = abs since start 0.
  setPieces(p(g,1), [28,-1,-1,-1]); // zeleni start 20: (20+28)%40=8, on shield
  assert.equal(absOf(p(g,1), 28), 8);
  assert.equal(special(g, 8), 'shield');
  setPieces(p(g,0), [5,-1,-1,-1]);
  const ms = legalMoves(g, p(g,0), 3); // would land on 8
  assert.ok(!ms.some(m=>m.i===0));
});

test('zvezda daje još jedan bacaj', () => {
  const g = createGame({color:0, count:2, specials:['star']});
  setPieces(p(g,0), [4,-1,-1,-1]); // star at 6
  assert.equal(special(g, 6), 'star');
  g.dice = 2;
  const out = applyMove(g, {i:0, from:4, to:6, fin:6, boosted:false});
  assert.equal(out.star, true);
  assert.equal(out.rollAgain, true);
});

test('šestica daje još jedan bacaj', () => {
  const g = createGame({color:0, count:2, specials:[]});
  setPieces(p(g,0), [1,-1,-1,-1]);
  g.dice = 6;
  const out = applyMove(g, {i:0, from:1, to:7, fin:7, boosted:false});
  assert.equal(out.rollAgain, true);
  assert.equal(out.star, false);
});

test('turbo: sletiš na boost, ideš još 3 ako je slobodno', () => {
  const g = createGame({color:0, count:2, specials:['boost']});
  setPieces(p(g,0), [1,-1,-1,-1]); // boost at 3
  const ms = legalMoves(g, p(g,0), 2);
  const m = ms.find(x=>x.i===0);
  assert.ok(m.boosted);
  assert.equal(m.to, 3);
  assert.equal(m.fin, 6);
  g.dice = 2;
  const out = applyMove(g, m);
  assert.equal(p(g,0).pieces[0], 6);
  assert.equal(out.boosted, true);
});

test('turbo hvata i na boost polju i na odredištu', () => {
  const g = createGame({color:0, count:2, specials:['boost']});
  setPieces(p(g,0), [1,-1,-1,-1]);
  // protivnik na abs 3 (boost) — zeleni: (20+p)%40=3 => p=23
  setPieces(p(g,1), [23,-1,-1,-1]);
  const m = legalMoves(g, p(g,0), 2).find(x=>x.i===0);
  g.dice = 2;
  const out = applyMove(g, m);
  assert.ok(out.captured.some(c=>c.pl===p(g,1)));
  assert.equal(p(g,1).pieces[0], -1);
});

test('ulazak u cilj tačnim brojem', () => {
  const g = createGame({color:0, count:2, specials:[]});
  setPieces(p(g,0), [38,-1,-1,-1]); // 38+2=40, prvo polje cilja
  const ms = legalMoves(g, p(g,0), 2);
  assert.ok(ms.some(m=>m.i===0 && m.fin===40));
  setPieces(p(g,0), [39,-1,-1,-1]);
  // 39+6=45 prelazi cilj — ta figura ne sme, ali ostale u kućici mogu da izađu na 6
  assert.ok(!legalMoves(g, p(g,0), 6).some(m=>m.i===0));
  assert.ok(legalMoves(g, p(g,0), 4).some(m=>m.i===0 && m.fin===43));
});

test('u cilju se ne preskaču sopstvene figure', () => {
  const g = createGame({color:0, count:2, specials:[]});
  setPieces(p(g,0), [39, 41, -1, -1]);
  // sa 39, bacaj 3 bi išao na 42, ali 41 je na putu
  assert.ok(!legalMoves(g, p(g,0), 3).some(m=>m.i===0));
  // bacaj 1 ide na 40, slobodno
  assert.ok(legalMoves(g, p(g,0), 1).some(m=>m.i===0 && m.fin===40));
});

test('pobeda kad su sve 4 figure u cilju', () => {
  const g = createGame({color:0, count:2, specials:[]});
  // Figure u cilju ne smeju da se preskaču, zato prve tri idu na dno (43,42,41)
  setPieces(p(g,0), [43, 42, 41, 39]);
  g.dice = 1;
  const m = legalMoves(g, p(g,0), 1).find(x=>x.i===3);
  assert.ok(m && m.fin===40);
  const out = applyMove(g, m);
  assert.equal(out.won, true);
  assert.equal(out.home, true);
  assert.equal(out.rollAgain, false);
  assert.ok(p(g,0).pieces.every(x=>x>=40));
});

test('ceo tok igre: izlazak na 6, jedenje, cilj, pobednik', () => {
  const g = createGame({color:0, count:2, specials:[], difficulty:'easy'});
  // Ručno vodimo crvenog do pobede, zeleni će ponekad igrati ako dobije 6.
  // Koristimo pick koji za crvenog bira planirano, za zelenog prvi potez.
  // Jednostavniji pristup: igramo samo crvenog tako što zelenom dajemo bacanja bez 6 dok je u kućici.
  // Sekvenca za crvenog:
  // 4 figure napolje: 6,6,6,6 (svaka šestica izvede jednu i da još jedan bacaj)
  // Posle 4. šestice ima još bacaj. Zatim pomeramo figure do cilja.
  //
  // Posle 4 izlaska, figure su na 0,0? NE — druga ne može na 0 jer je prva tu.
  // Prva 6: figura 0 na 0, extra roll.
  // Druga 6: figura 0 ide na 6 (jedina legalna? figure 1,2,3 mogu na 0? 0 je zauzet sopstvenom!).
  // Samo figura 0 može (0+6=6). Ostale ne mogu izaći.
  // Treba pomeriti prvu sa starta pre nego što izađe druga.
  //
  // Plan (samo crveni, zeleni nikad ne dobije 6):
  // 6 → izlaz F0 na 0, extra
  // 1 → F0 na 1, kraj poteza. Zeleni: 1 (retry), 2, 3 pass.
  // 6 → F1 na 0, extra
  // 1 → F1 na 1? F0 je na 1! F0 na 7 umesto? legal: F0 1+6=7, F1 0+6=6, F2/3 izlaz na 0 zauzet? 0 je F1... posle izlaza F1 je na 0, extra 1:
  //   F0 (1+1=2), F1 (0+1=1) — F0 je na 1, pa F1 ne može na 1. F0 ide na 2.
  // Ovo postaje zamršeno. Bolje: koristimo playSequence i biramo poteze ciljano,
  // ili ručno applyMove u testu za "full game feel", PLUS jedan automatski meč bot vs bot.

  // 1) Ručni tok: izlaz, jedenje, cilj, pobeda
  const g2 = createGame({color:0, count:2, specials:[]});
  // izlaz na 6
  let r = resolveRoll(g2, 6);
  assert.equal(r.kind, 'play');
  g2.dice = 6;
  let out = applyMove(g2, r.moves[0]);
  assert.equal(p(g2,0).pieces[0], 0);
  assert.equal(out.rollAgain, true);

  // pomeri se na 10, tu će kasnije doći protivnik... prvo protivnika stavimo ispred
  // Crveni ide sa 0 bacajem 4 na 4
  g2.dice = 4;
  r = resolveRoll(g2, 4);
  out = applyMove(g2, r.moves[0]);
  assert.equal(p(g2,0).pieces[0], 4);
  assert.equal(out.rollAgain, false);
  nextTurn(g2);
  assert.equal(g2.turn, 1);

  // Zeleni izlazi na 6
  g2.dice = 6;
  r = resolveRoll(g2, 6);
  out = applyMove(g2, r.moves[0]);
  assert.equal(p(g2,1).pieces[0], 0); // relativno 0 = abs 20
  assert.equal(out.rollAgain, true);

  // Zeleni ide do abs 4, gde stoji crveni: crveni na rel 4 = abs 4.
  // Zeleni start 20, abs 4 = rel 24. Trenutno je na 0, treba 24. predugo za ovaj korak.
  // Stavim zelenog na rel 22, bacaj 2 → rel 24 = abs 4, jede crvenog.
  setPieces(p(g2,1), [22,-1,-1,-1]);
  assert.equal(absOf(p(g2,1), 24), 4);
  g2.dice = 2;
  r = resolveRoll(g2, 2);
  out = applyMove(g2, r.moves.find(m=>m.i===0));
  assert.equal(out.captured.length, 1);
  assert.equal(p(g2,0).pieces[0], -1, 'crveni pojedena figura ide u kućicu');
  nextTurn(g2);
  assert.equal(g2.turn, 0);

  // Crveni ponovo izlazi, pa ide u cilj (postavimo ga skoro pa u cilj)
  g2.dice = 6;
  r = resolveRoll(g2, 6);
  out = applyMove(g2, r.moves[0]);
  assert.equal(p(g2,0).pieces[0], 0);
  setPieces(p(g2,0), [43,42,41,39]);
  g2.dice = 1;
  r = resolveRoll(g2, 1);
  assert.equal(r.kind, 'play');
  const homeMove = r.moves.find(m=>m.i===3);
  assert.ok(homeMove && homeMove.fin===40);
  out = applyMove(g2, homeMove);
  assert.equal(out.won, true);
  assert.ok(p(g2,0).pieces.every(x=>x>=40));
});

test('automatska partija bot vs bot se završava pobednikom', () => {
  // Fiksiran rng da je test stabilan; dovoljno bacanja.
  let seed = 20261125;
  const rng = ()=>{ seed = (seed*1664525+1013904223)>>>0; return seed/0x100000000; };
  const roll = ()=> 1+Math.floor(rng()*6);

  const g = createGame({color:0, count:4, modes:['bot','bot','bot','bot'], difficulty:'hard', specials:['star','shield','boost']});
  // createGame forsira modes[0]='human'. Popravimo za ovaj test:
  g.players.forEach(pl=>{ pl.human=false; pl.ai='hard'; });

  const rolls = Array.from({length:8000}, roll);
  const log = playSequence(g, rolls, (state, pl, moves)=>aiPick(state, pl, moves, rng));
  assert.ok(g.over, 'partija mora da se završi');
  assert.ok(g.winner, 'mora postojati pobednik');
  assert.ok(g.winner.pieces.every(x=>x>=40));
  assert.ok(log.some(e=>e.kind==='move' && e.move.from===-1), 'bilo je izlazaka na 6');
  const captures = log.filter(e=>e.out && e.out.captured && e.out.captured.length);
  // nije obavezno da bude jedenja, ali u 4 igrača na hard skoro uvek ima
  const homes = log.filter(e=>e.out && e.out.home);
  assert.ok(homes.length>=4, 'pobednik je uveo sve figure u cilj');
});

test('createGame pamti težinu i posebna polja', () => {
  const g = createGame({color:2, count:3, modes:['human','human','bot'], difficulty:'hard', specials:['star']});
  assert.equal(g.players[0].human, true);
  assert.equal(g.players[1].human, true);
  assert.equal(g.players[2].human, false);
  assert.equal(g.players[2].ai, 'hard');
  assert.ok(g.sp.has('star'));
  assert.ok(!g.sp.has('boost'));
  assert.equal(noneOnTrack(g.players[0]), true);
});
