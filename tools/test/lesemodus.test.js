// Node-only safety test; isolated synthetic server, never production data.
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { createHash } = require('node:crypto');
if (process.env.BASE && !['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.BASE).hostname)) throw new Error('localhost only');
(async () => {
  const { startOldServer } = await import('../../varde/tools/parity/old-server.mjs');
  const fixture = (name) => readFileSync(join(__dirname,'../../varde/tools/parity/fixtures',name),'utf8');
  const files = {svar:fixture('svar.synthetic.jsonl'),runde1:fixture('runde1.synthetic.js'),tilgang:fixture('tilgang.json'),kundar:fixture('kundar.json')};
  for (const readOnly of [true,false]) {
    const old = await startOldServer(files,{readOnly});
    try {
      const hash = (file) => existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'absent';
      const paths=['svar.jsonl','framdrift.json'].map((p)=>join(old.root,'data',p));
      const before=paths.map(hash);
      const post = (path,body,headers={})=>fetch(old.base+path,{method:'POST',headers:{'Content-Type':'application/json',Origin:old.base,...headers},body,redirect:'manual'});
      const svar={skjema:'tryggleik',versjon:'2026-10-13',k:'daco',t:JSON.parse(files.tilgang).daco,lang:'nn',svar:{F1:'ZZTEST',F2:'kontor',F12:'ja'},fri:{},leiardel:false,sekund:60};
      assert.equal((await post('/api/svar',JSON.stringify(svar))).status,readOnly?410:201);
      assert.equal((await post('/api/framdrift','{}')).status,readOnly?410:204);
      if(readOnly) {
        assert.equal((await post('/api/svar','not json')).status,410);
        assert.equal((await post('/api/framdrift','not json')).status,410);
        assert.equal((await fetch(old.base+'/api/sjekk?k=invalid&t=invalid')).status,410);
        assert.deepEqual(paths.map(hash),before);
      }
      const login=await post('/logg-inn',new URLSearchParams({epost:old.epost,passord:old.password}).toString(),{'Content-Type':'application/x-www-form-urlencoded'});
      const cookie=login.headers.get('set-cookie').split(';')[0];
      assert.equal((await post('/api/admin/kunde',JSON.stringify({k:'daco',open:true}),{Cookie:cookie})).status,readOnly?409:200);
      if(readOnly) for(const open of [1,'true']) assert.equal((await post('/api/admin/kunde',JSON.stringify({k:'daco',open}),{Cookie:cookie})).status,409);
      console.log('ok lesemodus='+Number(readOnly));
    }finally{await old.stop();}
  }
})().catch((e)=>{console.error(e);process.exitCode=1;});
