export async function collect(client) {
 const document=await client("/pose");
 return [{id:document.run+':'+document.epoch+':'+document.time,frame:document.frame,position:document.position,clock:document.clock,epoch:document.epoch}];
}
