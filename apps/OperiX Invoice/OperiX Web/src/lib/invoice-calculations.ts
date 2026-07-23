import type { InvoiceDraft } from "./models";

export function invoiceTotals(draft: Pick<InvoiceDraft,"items">) {
  const subtotal=draft.items.reduce((sum,item)=>sum+item.quantity*item.unit_price,0);
  const discount=draft.items.reduce((sum,item)=>sum+(item.quantity*item.unit_price)*(item.discount/100),0);
  const tax=draft.items.reduce((sum,item)=>{const net=item.quantity*item.unit_price*(1-item.discount/100);return sum+net*(item.tax_rate/100);},0);
  const total=subtotal-discount+tax;
  return {subtotal,discount,tax,total};
}
export function cashAllowed(total:number){return total<300;}
export function paymentState(total:number,received:number){return {paid:received>=total&&total>0,change:Math.max(0,received-total),due:Math.max(0,total-received)};}
