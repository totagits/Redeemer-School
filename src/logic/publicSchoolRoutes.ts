export function schoolNavigationHref(slug:string):string {
 if(slug==='apply-online')return '/apply';
 if(slug==='student-portal'||slug==='guardian-portal')return '/portal';
 return '/school/'+slug;
}

export function isOperationsPath(pathname:string):boolean {
 return pathname==='/staff'||pathname==='/portal';
}
