import * as THREE from 'three';

export function createCounterLayouts(map){
 map.updateMatrixWorld(true);
 const bounds=name=>new THREE.Box3().setFromObject(map.getObjectByName(name));
 const footprint=box=>({minX:box.min.x,maxX:box.max.x,minZ:box.min.z,maxZ:box.max.z});
 const make=(table,props)=>{
  const box=bounds(table);
  return {...footprint(box),surfaceY:box.max.y,obstacles:props.map(name=>footprint(bounds(name)))};
 };
 // Condiments and the register are real occupied areas, not just points.
 return {
  blue:make('ITP_ob_table008',['ITP_hotdog_assets','ITP_hotdog_table_cash']),
  red:make('ITP_ob_table002',['ITP_hotdog_assets1','ITP_hotdog_table_cash1'])
 };
}
