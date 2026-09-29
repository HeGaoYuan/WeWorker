import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { performApiReplayRequest, handleBackendRuntimeFetch } from '../bridge.js';
const servers=[];
afterEach(async()=>{await Promise.all(servers.splice(0).map(server=>new Promise(resolve=>server.close(resolve))))});
async function endpoint(handler){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);return `http://127.0.0.1:${server.address().port}/fixture`;}
describe('bounded binary backend responses',()=>{
  const bytes=Buffer.from([0,255,128,13,10,65]);
  it.each(['fetch','curl'])('preserves binary bytes through %s',async transport=>{
    const url=await endpoint((_,r)=>{r.setHeader('Content-Type','image/png');r.end(bytes)});
    const result=await performApiReplayRequest({url,responseEncoding:'base64',maxResponseBytes:100},transport==='curl'?{fetchImpl:async()=>{throw new Error('fixture transport failure')}}:{});
    expect(result.ok).toBe(true);expect(result.response.bodyEncoding).toBe('base64');expect(result.response.size).toBe(bytes.length);expect(Buffer.from(result.response.body,'base64')).toEqual(bytes);
  });
  it('propagates encoding through the runtime helper',async()=>{
    const url=await endpoint((_,r)=>r.end(bytes));const result=await handleBackendRuntimeFetch({url,options:{responseEncoding:'base64',maxResponseBytes:100}});
    expect(result).toMatchObject({bodyEncoding:'base64',size:6});expect(Buffer.from(result.body,'base64')).toEqual(bytes);
  });
  it('bounds chunked responses without a content-length and does not retry',async()=>{
    let requests=0;const url=await endpoint((_,r)=>{requests++;r.write(bytes);r.end(bytes)});
    const result=await performApiReplayRequest({url,responseEncoding:'base64',maxResponseBytes:8});expect(result.ok).toBe(false);expect(result.error).toContain('maxResponseBytes');expect(requests).toBe(1);
  });
  it('curl fallback also rejects oversized response bodies',async()=>{
    const url=await endpoint((_,r)=>r.end(bytes));const result=await performApiReplayRequest({url,responseEncoding:'base64',maxResponseBytes:2},{fetchImpl:async()=>{throw new Error('fixture transport failure')}});expect(result.ok).toBe(false);
  });
  it.each([{responseEncoding:'hex'},{maxResponseBytes:0},{maxResponseBytes:52428801},{maxResponseBytes:'10'}])('rejects invalid options before network %j',async options=>{
    await expect(performApiReplayRequest({url:'https://example.com/',...options})).rejects.toThrow();
  });
  it('preserves manual redirect boundaries in binary mode',async()=>{
    const url=await endpoint((_,r)=>{r.writeHead(302,{Location:'https://example.com/'});r.end()});const result=await performApiReplayRequest({url,responseEncoding:'base64',redirect:'manual'});expect(result.response.status).toBe(302);expect(result.response.body).toBe('');expect(result.response.redirected).toBe(false);
  });
});
