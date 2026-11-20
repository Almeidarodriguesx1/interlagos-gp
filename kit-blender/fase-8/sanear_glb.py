"""Repair zero-length tangents at degenerate UV poles after Blender GLB export.
Geometry, UVs and named nodes are preserved. Uses only Python standard library.
"""
import json,struct,math
from pathlib import Path

def repair_tangents(path):
 path=Path(path);raw=bytearray(path.read_bytes());json_size=struct.unpack_from('<I',raw,12)[0];doc=json.loads(raw[20:20+json_size]);binary_start=28+json_size;fixed=0
 def accessor(index):
  a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']];return a,v,binary_start+v.get('byteOffset',0)+a.get('byteOffset',0)
 seen=set()
 for mesh in doc['meshes']:
  for primitive in mesh['primitives']:
   attrs=primitive['attributes'];index=attrs.get('TANGENT')
   if index is None or index in seen:continue
   seen.add(index);ta,tv,to=accessor(index);na,nv,no=accessor(attrs['NORMAL']);ts=tv.get('byteStride',16);ns=nv.get('byteStride',12)
   for i in range(ta['count']):
    x,y,z,w=struct.unpack_from('<4f',raw,to+i*ts)
    if x*x+y*y+z*z>1e-10:continue
    nx,ny,nz=struct.unpack_from('<3f',raw,no+i*ns);axis=(1,0,0) if abs(nx)<.9 else (0,1,0);dot=nx*axis[0]+ny*axis[1]+nz*axis[2];t=(axis[0]-nx*dot,axis[1]-ny*dot,axis[2]-nz*dot);length=math.sqrt(sum(v*v for v in t))
    struct.pack_into('<4f',raw,to+i*ts,t[0]/length,t[1]/length,t[2]/length,1 if w>=0 else -1);fixed+=1
 path.write_bytes(raw);return fixed
if __name__=='__main__':
 import sys
 print({'repairedTangents':repair_tangents(sys.argv[1])})
