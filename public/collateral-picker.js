/** Searchable lightweight asset picker. Shares the same catalog with server validation.
 * Inclusion in the catalog is NOT bank acceptance or valuation certification.
 */
import {BUILTIN_TYPES,GROUPS} from './collateral-catalog.js';

export const collateralCategories=GROUPS.map(({code,name})=>({code,name}));
export const collateralTypes=BUILTIN_TYPES;

export function groupForType(name) {
 const entry=collateralTypes.find(t=>t.name===name);
 return entry?.group||'PROPERTY';
}
export function typesInGroup(group) {
 return collateralTypes.filter(type=>type.group===group && type.enabled!==false && type.policy!=='BLOCKED');
}
const normalize=value=>String(value??'').toLocaleLowerCase('id-ID').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').trim();
export function searchCollateralTypes(query,limit=30) {
 const needle=normalize(query);
 if(needle.length<2)return [];
 const match=collateralTypes.filter(type=>(type.enabled!==false&&type.policy!=='BLOCKED')&&(
  normalize(type.name).includes(needle)||
  normalize(collateralCategories.find(g=>g.code===type.group)?.name).includes(needle)
 ));
 return match.slice(0,Math.max(0,Math.min(50,Number(limit)||30)));
}
