import { getTHREE } from '../threeRef.js';
import { maxRadius } from '../config.js';
function fact(n) { let f = 1; for (let i = 2; i <= n; i++)
    f *= i; return f; }
function assocLaguerre(p, alpha, x) { if (p === 0)
    return 1; if (p === 1)
    return -x + alpha + 1; let Lkm2 = 1, Lkm1 = -x + alpha + 1; for (let k = 2; k <= p; k++) {
    const a = (2 * (k - 1) + alpha + 1 - x) * Lkm1;
    const b = ((k - 1) + alpha) * Lkm2;
    const Lk = (a - b) / k;
    Lkm2 = Lkm1;
    Lkm1 = Lk;
} return Lkm1; }
function radialR(n, l, r) { if (n <= l)
    return 0; const rho = 2 * r / n; const p = n - l - 1; const alpha = 2 * l + 1; const N = (2 / (n * n)) * Math.sqrt(fact(n - l - 1) / fact(n + l)); return N * Math.exp(-rho / 2) * Math.pow(rho, l) * assocLaguerre(p, alpha, rho); }
function assocLegendre(l, m, x) { if (m < 0 || l < 0 || m > l)
    return 0; let pmm = 1; if (m > 0) {
    const somx2 = Math.sqrt(Math.max(0, 1 - x * x));
    let odd = 1;
    for (let i = 1; i <= m; i++)
        odd *= (2 * i - 1);
    pmm = ((m % 2) ? -1 : 1) * odd * Math.pow(somx2, m);
} if (l === m)
    return pmm; let pmmp1 = x * (2 * m + 1) * pmm; if (l === m + 1)
    return pmmp1; let pmmPrev = pmm, pmml = pmmp1, pll = 0; for (let L = m + 2; L <= l; L++) {
    pll = ((2 * L - 1) * x * pmml - (L + m - 1) * pmmPrev) / (L - m);
    pmmPrev = pmml;
    pmml = pll;
} return pmml; }
function realY(l, m, theta, phi) { const PI = Math.PI; const x = Math.cos(theta); const am = Math.abs(m); const Plm = assocLegendre(l, am, x); const norm = Math.sqrt((2 * l + 1) / (4 * PI) * fact(l - am) / Math.max(1, fact(l + am))); if (m === 0)
    return norm * Plm; const base = Math.SQRT2 * norm * Plm; return (m > 0) ? base * Math.cos(am * phi) : base * Math.sin(am * phi); }
// Caches
export const radialCache = {}; // key: `${n}_${l}` -> { radial: DataTexture, invCdf: DataTexture }
export const angularCache = {}; // key: `${l}_${m}` -> { invThetaTex, invPhiTex, thetaSize, phiSize, invThetaData, invPhiData }
export function createRadialLUT(n, l, size = 1024) {
    const arr = new Float32Array(size * 4);
    for (let i = 0; i < size; i++) {
        const t = i / (size - 1);
        const r = t * maxRadius;
        const radial_part = radialR(n, l, r);
        arr[i * 4 + 0] = radial_part;
        arr[i * 4 + 1] = 0;
        arr[i * 4 + 2] = 0;
        arr[i * 4 + 3] = 1;
    }
    const T = getTHREE();
    const tex = new T.DataTexture(arr, size, 1, T.RGBAFormat, T.FloatType);
    tex.needsUpdate = true;
    tex.minFilter = T.LinearFilter;
    tex.magFilter = T.LinearFilter;
    tex.wrapS = T.ClampToEdgeWrapping;
    tex.wrapT = T.ClampToEdgeWrapping;
    return tex;
}
export function createRadialInvCDF(n, l, size = 1024) {
    const radial = new Float32Array(size);
    for (let i = 0; i < size; i++) {
        const t = i / (size - 1);
        const r = t * maxRadius;
        const R = radialR(n, l, r);
        radial[i] = R * R * (r * r);
    }
    const cdf = new Float32Array(size);
    let sum = 0;
    for (let i = 0; i < size; i++) {
        sum += radial[i];
        cdf[i] = sum;
    }
    if (sum > 1e-30)
        for (let i = 0; i < size; i++)
            cdf[i] /= sum;
    else
        for (let i = 0; i < size; i++)
            cdf[i] = i / (size - 1);
    const inv = new Float32Array(size * 4);
    let j = 0;
    for (let i = 0; i < size; i++) {
        const u = i / (size - 1);
        while (j < size - 1 && cdf[j] < u)
            j++;
        const j0 = Math.max(0, j - 1);
        const j1 = j;
        const c0 = cdf[j0];
        const c1 = cdf[j1];
        const t = c1 > c0 ? (u - c0) / (c1 - c0) : 0;
        const r0 = (j0 / (size - 1)) * maxRadius;
        const r1 = (j1 / (size - 1)) * maxRadius;
        const r = r0 + t * (r1 - r0);
        inv[i * 4 + 0] = r / maxRadius;
        inv[i * 4 + 1] = 0;
        inv[i * 4 + 2] = 0;
        inv[i * 4 + 3] = 1;
    }
    const T = getTHREE();
    const tex = new T.DataTexture(inv, size, 1, T.RGBAFormat, T.FloatType);
    tex.needsUpdate = true;
    tex.minFilter = T.LinearFilter;
    tex.magFilter = T.LinearFilter;
    tex.wrapS = T.ClampToEdgeWrapping;
    tex.wrapT = T.ClampToEdgeWrapping;
    tex._cpuArray = inv;
    return tex;
}
export function createAngularInvTables(l, m, thetaSize = 256, phiSize = 256) {
    const thetaPDF = new Float32Array(thetaSize);
    const rowPhiCDFs = new Array(thetaSize);
    const dTheta = Math.PI / (thetaSize - 1);
    const dPhi = (2 * Math.PI) / (phiSize - 1);
    for (let i = 0; i < thetaSize; i++) {
        const theta = i * dTheta;
        const st = Math.sin(theta);
        const rowPDF = new Float32Array(phiSize);
        let rowSum = 0;
        for (let j = 0; j < phiSize; j++) {
            const phi = j * dPhi;
            const a = realY(l, m, theta, phi);
            const w = a * a * st;
            rowPDF[j] = w;
            rowSum += w;
        }
        const rowCDF = new Float32Array(phiSize);
        if (rowSum <= 1e-20)
            for (let j = 0; j < phiSize; j++)
                rowCDF[j] = j / (phiSize - 1);
        else {
            let acc = 0;
            for (let j = 0; j < phiSize; j++) {
                acc += rowPDF[j];
                rowCDF[j] = acc / rowSum;
            }
        }
        rowPhiCDFs[i] = rowCDF;
        thetaPDF[i] = rowSum;
    }
    const thetaCDF = new Float32Array(thetaSize);
    let sumTheta = 0;
    for (let i = 0; i < thetaSize; i++) {
        sumTheta += thetaPDF[i];
        thetaCDF[i] = sumTheta;
    }
    if (sumTheta > 1e-30)
        for (let i = 0; i < thetaSize; i++)
            thetaCDF[i] /= sumTheta;
    else
        for (let i = 0; i < thetaSize; i++)
            thetaCDF[i] = i / (thetaSize - 1);
    const invThetaArr = new Float32Array(thetaSize * 4);
    let it = 0;
    for (let k = 0; k < thetaSize; k++) {
        const u = k / (thetaSize - 1);
        while (it < thetaSize - 1 && thetaCDF[it] < u)
            it++;
        const i0 = Math.max(0, it - 1), i1 = it;
        const c0 = thetaCDF[i0], c1 = thetaCDF[i1];
        const t = c1 > c0 ? (u - c0) / (c1 - c0) : 0;
        const th0 = i0 * dTheta, th1 = i1 * dTheta;
        const th = th0 + t * (th1 - th0);
        invThetaArr[k * 4 + 0] = th / Math.PI;
        invThetaArr[k * 4 + 1] = 0;
        invThetaArr[k * 4 + 2] = 0;
        invThetaArr[k * 4 + 3] = 1;
    }
    const T = getTHREE();
    const invThetaTex = new T.DataTexture(invThetaArr, thetaSize, 1, T.RGBAFormat, T.FloatType);
    invThetaTex.needsUpdate = true;
    invThetaTex.minFilter = T.LinearFilter;
    invThetaTex.magFilter = T.LinearFilter;
    invThetaTex.wrapS = T.ClampToEdgeWrapping;
    invThetaTex.wrapT = T.ClampToEdgeWrapping;
    const invPhiArr = new Float32Array(thetaSize * phiSize * 4);
    for (let i = 0; i < thetaSize; i++) {
        const rowCDF = rowPhiCDFs[i];
        let jp = 0;
        for (let j = 0; j < phiSize; j++) {
            const v = j / (phiSize - 1);
            while (jp < phiSize - 1 && rowCDF[jp] < v)
                jp++;
            const j0 = Math.max(0, jp - 1), j1 = jp;
            const c0 = rowCDF[j0], c1 = rowCDF[j1];
            const t = c1 > c0 ? (v - c0) / (c1 - c0) : 0;
            const ph0 = j0 * dPhi, ph1 = j1 * dPhi;
            const ph = ph0 + t * (ph1 - ph0);
            const idx = (i * phiSize + j) * 4;
            invPhiArr[idx + 0] = ph / (2 * Math.PI);
            invPhiArr[idx + 1] = 0;
            invPhiArr[idx + 2] = 0;
            invPhiArr[idx + 3] = 1;
        }
    }
    const invPhiTex = new T.DataTexture(invPhiArr, phiSize, thetaSize, T.RGBAFormat, T.FloatType);
    invPhiTex.needsUpdate = true;
    invPhiTex.minFilter = T.LinearFilter;
    invPhiTex.magFilter = T.LinearFilter;
    invPhiTex.wrapS = T.ClampToEdgeWrapping;
    invPhiTex.wrapT = T.ClampToEdgeWrapping;
    return { invThetaTex, invPhiTex, thetaSize, phiSize, invThetaData: invThetaArr, invPhiData: invPhiArr };
}
export function getRadial(n, l, size = 1024) {
    const key = `${n}_${l}`;
    if (!radialCache[key])
        radialCache[key] = { radial: createRadialLUT(n, l, size), invCdf: createRadialInvCDF(n, l, size) };
    return radialCache[key];
}
export function getAngular(l, m, thetaSize = 256, phiSize = 256) {
    const key = `${l}_${m}`;
    if (!angularCache[key])
        angularCache[key] = createAngularInvTables(l, m, thetaSize, phiSize);
    return angularCache[key];
}
