export class MockBonfiresClient {
  constructor(){ this.searchCalls=[]; this.captureCalls=[]; this.shouldThrowSearch=false; }
  async search(req){ this.searchCalls.push(req); if(this.shouldThrowSearch) throw new Error('mock search error'); const n=Math.max(1, req.limit||1); return {results:Array.from({length:n}).map((_,i)=>({summary:`Mock memory ${i+1} for: ${req.query.slice(0,40)}`,source:`mock://bonfires/${i+1}`,score:Math.max(0,1-i*0.1)}))}; }
  async capture(req){ this.captureCalls.push(req); return {accepted:req.messages.length}; }
}
