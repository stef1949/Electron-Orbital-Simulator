import { maxRadius } from '../config.js';
// Real-valued, simplified hydrogen-like wavefunction components
function fact(n) { let f = 1; for (let i = 2; i <= n; i++)
    f *= i; return f; }
function assocLegendre(l, m, x) {
    if (m < 0 || l < 0 || m > l)
        return 0;
    let pmm = 1;
    if (m > 0) {
        const somx2 = Math.sqrt(Math.max(0, 1 - x * x));
        let odd = 1;
        for (let i = 1; i <= m; i++)
            odd *= (2 * i - 1);
        pmm = ((m % 2) ? -1 : 1) * odd * Math.pow(somx2, m);
    }
    if (l === m)
        return pmm;
    let pmmp1 = x * (2 * m + 1) * pmm;
    if (l === m + 1)
        return pmmp1;
    let pmmPrev = pmm, pmml = pmmp1, pll = 0;
    for (let L = m + 2; L <= l; L++) {
        pll = ((2 * L - 1) * x * pmml - (L + m - 1) * pmmPrev) / (L - m);
        pmmPrev = pmml;
        pmml = pll;
    }
    return pmml;
}
function radialR(n, l, r) {
    if (n <= l)
        return 0;
    const rho = 2 * r / n;
    const p = n - l - 1;
    const alpha = 2 * l + 1;
    const N = (2 / (n * n)) * Math.sqrt(fact(n - l - 1) / fact(n + l));
    return N * Math.exp(-rho / 2) * Math.pow(rho, l) * assocLaguerre(p, alpha, rho);
}
// Stable associated Laguerre polynomial L_p^{(alpha)}(x) via recurrence
function assocLaguerre(p, alpha, x) {
    if (p === 0)
        return 1;
    if (p === 1)
        return -x + alpha + 1;
    let Lkm2 = 1;
    let Lkm1 = -x + alpha + 1;
    for (let k = 2; k <= p; k++) {
        const a = (2 * (k - 1) + alpha + 1 - x) * Lkm1;
        const b = ((k - 1) + alpha) * Lkm2;
        const Lk = (a - b) / k;
        Lkm2 = Lkm1;
        Lkm1 = Lk;
    }
    return Lkm1;
}
function realY(l, m, theta, phi) {
    const PI = Math.PI;
    const x = Math.cos(theta);
    const am = Math.abs(m);
    const Plm = assocLegendre(l, am, x);
    const norm = Math.sqrt((2 * l + 1) / (4 * PI) * fact(l - am) / Math.max(1, fact(l + am)));
    if (m === 0)
        return norm * Plm;
    const base = Math.SQRT2 * norm * Plm;
    return (m > 0) ? base * Math.cos(am * phi) : base * Math.sin(am * phi);
}
export function getWaveFunctionValue(n, l, m, r, theta, phi) { return radialR(n, l, r) * realY(l, m, theta, phi); }
export function estimateMaxPsi2(n, l, m, samples = 1000) {
    let maxPsi2 = 0;
    for (let i = 0; i < samples; i++) {
        const r = Math.random() * maxRadius;
        const theta = Math.acos(2 * Math.random() - 1);
        const phi = Math.random() * 2 * Math.PI;
        const psi = getWaveFunctionValue(n, l, m, r, theta, phi);
        const psi2 = psi * psi;
        if (psi2 > maxPsi2)
            maxPsi2 = psi2;
    }
    return Math.max(maxPsi2, 1e-6);
}
export function estimateMaxAngular2(l, m, samples = 2000) {
    let maxA2 = 0;
    for (let i = 0; i < samples; i++) {
        const u = Math.random();
        const v = Math.random();
        const theta = Math.acos(1 - 2 * u);
        const phi = 2 * Math.PI * v;
        const a = realY(l, m, theta, phi);
        maxA2 = Math.max(maxA2, a * a);
    }
    return Math.max(maxA2, 1e-6);
}
