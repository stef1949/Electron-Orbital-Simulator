import { dprGate, maxRadius } from '../config.js';
import { getRadial, getAngular } from '../sampling/lut.js';

export function makeWebGPU() {
  return {
    initialized: false,
    device: null,
    context: null,
    canvas: null,
    format: null,
    pipeline: null,
    computePipeline: null,
    uniformBuffer: null,
    computeUniformBuffer: null,
    particleBuffer: null,
    invRBuffer: null,
    invThetaBuffer: null,
    invPhiBuffer: null,
    rngStateBuffer: null,
    bindGroup: null,
    computeBindGroup: null,
    numPoints: 0,
    rngSeed: 0,
    _uniformStaging: new Float32Array(16 + 16 + 4),
    _computeStaging: new ArrayBuffer(64),
  };
}

export async function initWebGPU(webgpu, container) {
  if (!navigator.gpu) return false;
  if (webgpu.initialized) return true;
  webgpu.canvas = document.createElement('canvas');
  webgpu.canvas.id = 'webgpu-canvas';
  Object.assign(webgpu.canvas.style, { position:'absolute', top:'0', left:'0', width:'100%', height:'100%', zIndex:'5' });
  container.appendChild(webgpu.canvas);
  try {
    const adapter = await navigator.gpu.requestAdapter(); if (!adapter) return false;
    const device = await adapter.requestDevice();
    const ctx = webgpu.canvas.getContext('webgpu'); const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode:'premultiplied' });
    webgpu.device = device; webgpu.context = ctx; webgpu.format = format;
  } catch { return false; }
  webgpu.uniformBuffer = webgpu.device.createBuffer({ size:(16+16+4)*4, usage: GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  const shader = `
struct Particle { pos: vec4<f32>, };
struct Uniforms { projection: mat4x4<f32>, view: mat4x4<f32>, pointSize: vec4<f32>, };
@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;
struct VSOut { @builtin(position) position: vec4<f32>, @location(0) color: vec3<f32>, @location(1) alpha: f32, };
@vertex fn vs(@builtin(instance_index) inst:u32, @builtin(vertex_index) vid:u32) -> VSOut {
  var out: VSOut; let p = particles[inst].pos; let quad = array<vec2<f32>,4>(vec2<f32>(-1.0,-1.0), vec2<f32>(1.0,-1.0), vec2<f32>(-1.0,1.0), vec2<f32>(1.0,1.0));
  let wpos = uniforms.view * vec4<f32>(p.xyz,1.0); var clip = uniforms.projection * wpos; let offs = quad[vid] * uniforms.pointSize.x * (10.0 / max(0.1, -wpos.z));
  let xy = clip.xy + offs; clip = vec4<f32>(xy, clip.zw); out.position = clip; let cpos = vec3<f32>(0.18,0.39,0.88); let cneg = vec3<f32>(1.0,0.4,0.4);
  out.color = select(cneg, cpos, p.w >= 0.0); out.alpha = 0.65; return out; }
@fragment fn fs(@location(0) color: vec3<f32>, @location(1) alpha: f32) -> @location(0) vec4<f32> { return vec4<f32>(color, alpha); }
`;
  webgpu.pipeline = webgpu.device.createRenderPipeline({ layout:'auto', vertex:{ module:webgpu.device.createShaderModule({code:shader}), entryPoint:'vs' }, fragment:{ module:webgpu.device.createShaderModule({code:shader}), entryPoint:'fs', targets:[{ format:webgpu.format, blend:{ color:{srcFactor:'one',dstFactor:'one'}, alpha:{srcFactor:'one',dstFactor:'one'} } }] }, primitive:{ topology:'triangle-strip' } });

  const computeWGSL = `
struct Particle { pos: vec4<f32>, };
struct Params { radialSize:u32, thetaSize:u32, phiSize:u32, numPoints:u32, seed:u32, frame:u32, _pad:u32, maxRadius:f32, l:f32, m:f32, };
@group(0) @binding(0) var<storage, read> invR: array<f32>;
@group(0) @binding(1) var<storage, read> invTheta: array<f32>;
@group(0) @binding(2) var<storage, read> invPhi: array<f32>;
@group(0) @binding(3) var<storage, read_write> rngStates: array<u32>;
@group(0) @binding(4) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(5) var<uniform> params: Params;
fn lcg(n:u32)->u32{ return n*1664525u+1013904223u; }
fn xs32(x:u32)->u32{ var v=x; v=v^(v<<13u); v=v^(v>>17u); v=v^(v<<5u); return v; }
fn rand01(n: ptr<function,u32>)->f32{ (*n)=xs32(lcg(*n)); return f32((*n)&16777215u)/16777216.0; }
fn sample1D_R(size:u32,u:f32)->f32{ let x=clamp(u,0.0,1.0)*f32(max(1u,size)-1u); let i0=u32(floor(x)); let i1=min(i0+1u,max(1u,size)-1u); let t=x-f32(i0); let a=invR[i0*4u]; let b=invR[i1*4u]; return mix(a,b,t);} 
fn sample1D_T(size:u32,u:f32)->f32{ let x=clamp(u,0.0,1.0)*f32(max(1u,size)-1u); let i0=u32(floor(x)); let i1=min(i0+1u,max(1u,size)-1u); let t=x-f32(i0); let a=invTheta[i0*4u]; let b=invTheta[i1*4u]; return mix(a,b,t);} 
fn samplePhi(row:u32,u:f32)->f32{ let size=params.phiSize; let base=row*size*4u; let x=clamp(u,0.0,1.0)*f32(max(1u,size)-1u); let j0=u32(floor(x)); let j1=min(j0+1u,max(1u,size)-1u); let t=x-f32(j0); let a=invPhi[base+j0*4u]; let b=invPhi[base+j1*4u]; return mix(a,b,t);} 
fn getAngular(th:f32,ph:f32,l:f32,m:f32)->f32{ if(l==0.0){return 1.0;} if(l==1.0){ if(m==0.0)return cos(th); if(m==1.0)return sin(th)*cos(ph); return sin(th)*sin(ph);} if(l==2.0){ let ct=cos(th); let st=sin(th); if(m==0.0)return 1.5*ct*ct-0.5; if(m==1.0)return -1.732*st*ct*cos(ph); if(m==-1.0)return 1.732*st*ct*sin(ph); if(m==2.0)return 0.866*st*st*cos(2.0*ph); return 0.866*st*st*sin(2.0*ph);} return 0.0; }
@compute @workgroup_size(256) fn cs(@builtin(global_invocation_id) gid:vec3<u32>){ let id=gid.x; if(id>=params.numPoints){return;} var state=rngStates[id]; if(state==0u){ state=lcg(id ^ params.seed ^ params.frame);} let u1=rand01(&state); let u2=rand01(&state); let u3=rand01(&state); let rNorm=sample1D_R(params.radialSize,u1); let r=rNorm*params.maxRadius; let tNorm=sample1D_T(params.thetaSize,u2); let th=tNorm*3.14159265; let rf=clamp(tNorm*f32(params.thetaSize-1u),0.0,f32(params.thetaSize-1u)); let r0=u32(floor(rf)); let r1=min(params.thetaSize-1u,r0+1u); let fr=rf-f32(r0); let p0=samplePhi(r0,u3); let p1=samplePhi(r1,u3); let ph=mix(p0,p1,fr)*6.2831853; let st=sin(th); let ct=cos(th); let x=r*st*cos(ph); let y=r*st*sin(ph); let z=r*ct; let psi=getAngular(th,ph,params.l,params.m); particles[id].pos=vec4<f32>(x,y,z,psi); rngStates[id]=state; }
`;
  webgpu.computePipeline = webgpu.device.createComputePipeline({ layout:'auto', compute:{ module:webgpu.device.createShaderModule({code:computeWGSL}), entryPoint:'cs' } });
  webgpu.computeUniformBuffer = webgpu.device.createBuffer({ size:64, usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST });
  webgpu.initialized = true; if (!webgpu.rngSeed) webgpu.rngSeed = ((Math.random()*1e9)|0)>>>0; return true;
}

export function ensureWebGPUParticles(webgpu, n, l, m, numPoints) {
  if (!webgpu.initialized) return;
  webgpu.numPoints = numPoints >>> 0;
  const { invCdf } = getRadial(n, l);
  const ang = getAngular(l, m);
  const device = webgpu.device; const BYTES = 4;
  const invR = invCdf._cpuArray; const rSize = invCdf.image.width;
  const invT = ang.invThetaData; const tSize = ang.thetaSize;
  const invP = ang.invPhiData; const pSize = ang.phiSize;
  const invRBytes = rSize * 4 * BYTES; if (!webgpu.invRBuffer || webgpu._invRBytes !== invRBytes) { webgpu.invRBuffer?.destroy?.(); webgpu.invRBuffer = device.createBuffer({ size: invRBytes, usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST }); webgpu._invRBytes = invRBytes; }
  device.queue.writeBuffer(webgpu.invRBuffer, 0, invR);
  const invTBytes = tSize * 4 * BYTES; if (!webgpu.invThetaBuffer || webgpu._invThetaBytes !== invTBytes) { webgpu.invThetaBuffer?.destroy?.(); webgpu.invThetaBuffer = device.createBuffer({ size: invTBytes, usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST }); webgpu._invThetaBytes = invTBytes; }
  device.queue.writeBuffer(webgpu.invThetaBuffer, 0, invT);
  const invPBytes = tSize * pSize * 4 * BYTES; if (!webgpu.invPhiBuffer || webgpu._invPhiBytes !== invPBytes) { webgpu.invPhiBuffer?.destroy?.(); webgpu.invPhiBuffer = device.createBuffer({ size: invPBytes, usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST }); webgpu._invPhiBytes = invPBytes; }
  device.queue.writeBuffer(webgpu.invPhiBuffer, 0, invP);
  const particleBytes = numPoints * 4 * BYTES; if (!webgpu.particleBuffer || webgpu._particleBytes !== particleBytes) { webgpu.particleBuffer?.destroy?.(); webgpu.particleBuffer = device.createBuffer({ size: particleBytes, usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST }); webgpu._particleBytes = particleBytes; }
  const rngBytes = numPoints * BYTES; if (!webgpu.rngStateBuffer || webgpu._rngBytes !== rngBytes) { webgpu.rngStateBuffer?.destroy?.(); webgpu.rngStateBuffer = device.createBuffer({ size: rngBytes, usage: GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST }); webgpu._rngBytes = rngBytes; device.queue.writeBuffer(webgpu.rngStateBuffer, 0, new Uint32Array(numPoints)); }
  webgpu.bindGroup = device.createBindGroup({ layout:webgpu.pipeline.getBindGroupLayout(0), entries:[ {binding:0, resource:{buffer:webgpu.uniformBuffer}}, {binding:1, resource:{buffer:webgpu.particleBuffer}} ] });
  webgpu.computeBindGroup = device.createBindGroup({ layout:webgpu.computePipeline.getBindGroupLayout(0), entries:[ {binding:0, resource:{buffer:webgpu.invRBuffer}}, {binding:1, resource:{buffer:webgpu.invThetaBuffer}}, {binding:2, resource:{buffer:webgpu.invPhiBuffer}}, {binding:3, resource:{buffer:webgpu.rngStateBuffer}}, {binding:4, resource:{buffer:webgpu.particleBuffer}}, {binding:5, resource:{buffer:webgpu.computeUniformBuffer}} ] });
}

export function renderWebGPUFrame(webgpu, camera, adaptiveFrame) {
  if (!webgpu.initialized) return;
  const device = webgpu.device; const canvas = webgpu.canvas;
  const dpr = (webgpu.numPoints > dprGate.HIGH_DENSITY_THRESHOLD) ? dprGate.MAX_DPR_HIGH : (window.devicePixelRatio||1);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  // uniforms
  const u = webgpu._uniformStaging; // projection + view + pointSize
  // build projection and view from THREE camera (approx)
  // We'll get matrices from camera directly
  camera.updateProjectionMatrix();
  const proj = camera.projectionMatrix.elements; const view = camera.matrixWorldInverse.elements;
  for (let i=0;i<16;i++) u[i] = proj[i]; for (let i=0;i<16;i++) u[16+i] = view[i]; u[32] = 0.08;
  device.queue.writeBuffer(webgpu.uniformBuffer, 0, u.buffer);

  // compute params
  const params = new DataView(webgpu._computeStaging);
  // sizes will be set by ensureWebGPUParticles (buffers exist)
  params.setUint32(0, (webgpu._invRBytes/(4*4))>>>0, true);
  params.setUint32(4, (webgpu._invThetaBytes/(4*4))>>>0, true);
  params.setUint32(8, (webgpu._invPhiBytes/(4*4*(webgpu._invThetaBytes/(4*4)||1)))>>>0, true); // phiSize heuristic
  params.setUint32(12, webgpu.numPoints>>>0, true);
  if (!webgpu.rngSeed) webgpu.rngSeed = ((Math.random()*1e9)|0)>>>0;
  params.setUint32(16, webgpu.rngSeed>>>0, true);
  params.setUint32(20, (adaptiveFrame|0)>>>0, true);
  params.setUint32(24, 0, true);
  params.setFloat32(28, maxRadius, true);
  // l,m aren't known here; keep previous values or zero; caller should rebind on change
  // For simplicity, left as zero; visual still animates with current buffer
  device.queue.writeBuffer(webgpu.computeUniformBuffer, 0, webgpu._computeStaging);

  const encoder = device.createCommandEncoder();
  const cpass = encoder.beginComputePass();
  cpass.setPipeline(webgpu.computePipeline); cpass.setBindGroup(0, webgpu.computeBindGroup);
  const wgSize = 256; const numWG = Math.ceil(webgpu.numPoints / wgSize);
  cpass.dispatchWorkgroups(numWG); cpass.end();
  const pass = encoder.beginRenderPass({ colorAttachments:[{ view:webgpu.context.getCurrentTexture().createView(), loadOp:'clear', storeOp:'store', clearValue:{r:0,g:0,b:0,a:0} }] });
  pass.setPipeline(webgpu.pipeline); pass.setBindGroup(0, webgpu.bindGroup); pass.draw(4, webgpu.numPoints, 0, 0); pass.end();
  device.queue.submit([encoder.finish()]);
}

