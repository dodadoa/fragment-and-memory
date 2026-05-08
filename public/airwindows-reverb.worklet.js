/**
 * Airwindows "Reverb" algorithm ported to Web Audio AudioWorkletProcessor.
 * Original C++ by Chris Johnson (airwindows), MIT licence.
 * https://github.com/airwindows/airwindows/tree/master/plugins/WinVST/Reverb
 *
 * Architecture:
 *   predelay (M) → biquadA lowpass → sin saturation → 4 allpass stages (I-L)
 *   → 8 Householder feedback delay lines (A-H, 2 groups of 4)
 *   → mix → biquadB → clip → asin expand → biquadC → output
 *
 * Parameters:
 *   big  0-1  room size  (maps to delay lengths, filter cutoff, regen)
 *   wet  0-1  drive/saturation  (scales input into sin; higher = richer reverb)
 */

/**
 * Interpolated + blended read from a circular delay line.
 * Matches the original C++ exactly:
 *   interp = linear_lerp(floor, ceil, frac)
 *   output = lerp(interp, floor_value, blend)
 */
function rdBlend(buf, cnt, maxD, off, blend) {
  const offInt = off | 0; // Math.floor for non-negative
  const frac   = off - offInt;
  const w0     = cnt + offInt;
  const w1     = w0 + 1;
  const i0     = w0 > maxD ? w0 - maxD - 1 : w0;
  const i1     = w1 > maxD ? w1 - maxD - 1 : w1;
  const interp = buf[i0] * (1 - frac) + buf[i1] * frac;
  return interp * (1 - blend) + buf[i0] * blend;
}

class AirwindowsReverbProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'big', defaultValue: 0.5, minValue: 0.0, maxValue: 1.0, automationRate: 'k-rate' },
      { name: 'wet', defaultValue: 0.3, minValue: 0.0, maxValue: 0.8, automationRate: 'k-rate' },
    ];
  }

  constructor() {
    super();

    // Circular delay lines — sizes match the original header (+1 guard)
    this.aAL = new Float64Array(8112); this.aAR = new Float64Array(8112);
    this.aBL = new Float64Array(7512); this.aBR = new Float64Array(7512);
    this.aCL = new Float64Array(7312); this.aCR = new Float64Array(7312);
    this.aDL = new Float64Array(6912); this.aDR = new Float64Array(6912);
    this.aEL = new Float64Array(6312); this.aER = new Float64Array(6312);
    this.aFL = new Float64Array(6112); this.aFR = new Float64Array(6112);
    this.aGL = new Float64Array(5512); this.aGR = new Float64Array(5512);
    this.aHL = new Float64Array(4912); this.aHR = new Float64Array(4912);
    this.aIL = new Float64Array(4512); this.aIR = new Float64Array(4512);
    this.aJL = new Float64Array(4312); this.aJR = new Float64Array(4312);
    this.aKL = new Float64Array(3912); this.aKR = new Float64Array(3912);
    this.aLL = new Float64Array(3312); this.aLR = new Float64Array(3312);
    this.aML = new Float64Array(3112); this.aMR = new Float64Array(3112);

    // Write heads
    this.cA=0; this.cB=0; this.cC=0; this.cD=0;
    this.cE=0; this.cF=0; this.cG=0; this.cH=0;
    this.cI=0; this.cJ=0; this.cK=0; this.cL=0; this.cM=0;

    // Householder feedback state
    this.fbAL=0; this.fbBL=0; this.fbCL=0; this.fbDL=0;
    this.fbEL=0; this.fbFL=0; this.fbGL=0; this.fbHL=0;
    this.fbAR=0; this.fbBR=0; this.fbCR=0; this.fbDR=0;
    this.fbER=0; this.fbFR=0; this.fbGR=0; this.fbHR=0;

    // Vibrato LFO phases — start at random positions
    const r = () => Math.random() * Math.PI * 2;
    this.vAL=r(); this.vBL=r(); this.vCL=r(); this.vDL=r();
    this.vEL=r(); this.vFL=r(); this.vGL=r(); this.vHL=r();
    this.vAR=r(); this.vBR=r(); this.vCR=r(); this.vDR=r();
    this.vER=r(); this.vFR=r(); this.vGR=r(); this.vHR=r();

    // Per-tap vibrato speed — random small values → ~0.5–2 Hz at 44100 Hz
    const d = () => 0.0006 + Math.random() * 0.0014;
    this.dA=d(); this.dB=d(); this.dC=d(); this.dD=d();
    this.dE=d(); this.dF=d(); this.dG=d(); this.dH=d();

    // Biquad coefficient + state arrays (indices 0-6: coeff, 7-8: L state, 9-10: R state)
    this.bqA = new Float64Array(11);
    this.bqB = new Float64Array(11);
    this.bqC = new Float64Array(11);

    this._lastBig = -1;
    this._lastWet = -1;
  }

  /** Recompute biquad lowpass coefficients when parameters change. */
  _setupFilters(big, wet) {
    const cutoff = (10000.0 - big * wet * 3000.0) / sampleRate;

    const lp = (bq, Q) => {
      const K    = Math.tan(Math.PI * cutoff);
      const norm = 1.0 / (1.0 + K / Q + K * K);
      bq[2] = K * K * norm;
      bq[3] = 2.0 * bq[2];
      bq[4] = bq[2];
      bq[5] = 2.0 * (K * K - 1.0) * norm;
      bq[6] = (1.0 - K / Q + K * K) * norm;
    };

    lp(this.bqA, 1.618033988749895);  // golden ratio Q — widest
    lp(this.bqB, 0.618033988749895);  // inverse golden ratio Q
    lp(this.bqC, 0.5);                // Butterworth-ish Q — most damped

    this._lastBig = big;
    this._lastWet = wet;
  }

  process(inputs, outputs, parameters) {
    const inp = inputs[0];
    const out = outputs[0];
    if (!inp || !inp[0]) return true;

    const inL  = inp[0];
    const inR  = inp[1] || inp[0];
    const outL = out[0];
    const outR = out[1] || out[0];

    const big = parameters.big[0];
    const wet = parameters.wet[0];

    if (big !== this._lastBig || wet !== this._lastWet) {
      this._setupFilters(big, wet);
    }

    const size        = big * big * 75.0 + 25.0;
    const depthFactor = 1.0 - Math.pow(1.0 - (0.82 - ((1.0 - big) * 0.7 + size * 0.002)), 4);
    const blend       = 0.955 - size * 0.007;
    const regen       = depthFactor * 0.5;
    const VS          = 0.1;  // vibSpeed constant from original
    const VD          = 7.0;  // vibDepth constant from original

    const dA = (79 * size) | 0;
    const dB = (73 * size) | 0;
    const dC = (71 * size) | 0;
    const dD = (67 * size) | 0;
    const dE = (61 * size) | 0;
    const dF = (59 * size) | 0;
    const dG = (53 * size) | 0;
    const dH = (47 * size) | 0;
    const dI = (43 * size) | 0;
    const dJ = (41 * size) | 0;
    const dK = (37 * size) | 0;
    const dL = (31 * size) | 0;
    const dM = (29 * size) | 0;

    const bqA=this.bqA, bqB=this.bqB, bqC=this.bqC;
    const aAL=this.aAL, aAR=this.aAR;
    const aBL=this.aBL, aBR=this.aBR;
    const aCL=this.aCL, aCR=this.aCR;
    const aDL=this.aDL, aDR=this.aDR;
    const aEL=this.aEL, aER=this.aER;
    const aFL=this.aFL, aFR=this.aFR;
    const aGL=this.aGL, aGR=this.aGR;
    const aHL=this.aHL, aHR=this.aHR;
    const aIL=this.aIL, aIR=this.aIR;
    const aJL=this.aJL, aJR=this.aJR;
    const aKL=this.aKL, aKR=this.aKR;
    const aLL=this.aLL, aLR=this.aLR;
    const aML=this.aML, aMR=this.aMR;

    for (let n = 0; n < inL.length; n++) {
      let iL = inL[n] || 0;
      let iR = inR[n] || 0;

      // ── Predelay (line M) ────────────────────────────────────────────
      aML[this.cM] = iL;  aMR[this.cM] = iR;
      this.cM++; if (this.cM > dM) this.cM = 0;
      iL = aML[this.cM];  iR = aMR[this.cM];

      // ── biquadA lowpass ──────────────────────────────────────────────
      let tL = iL * bqA[2] + bqA[7];
      bqA[7]  = iL * bqA[3] - tL * bqA[5] + bqA[8];
      bqA[8]  = iL * bqA[4] - tL * bqA[6];
      iL = tL;
      let tR = iR * bqA[2] + bqA[9];
      bqA[9]  = iR * bqA[3] - tR * bqA[5] + bqA[10];
      bqA[10] = iR * bqA[4] - tR * bqA[6];
      iR = tR;

      iL *= wet;  iR *= wet;
      iL = Math.sin(iL);  iR = Math.sin(iR);

      // ── Four allpass sections (Schroeder, coefficient 0.5) ───────────
      // Pattern:  look_ahead = read(pos+1);  write(pos) = input - 0.5*look_ahead;
      //           advance;  output = 0.5*written + read(new_pos)

      let apIL=iL, apIR=iR, at;

      at = this.cI+1; if (at > dI) at = 0;
      apIL -= aIL[at]*0.5;  aIL[this.cI]=apIL;  apIL*=0.5;
      apIR -= aIR[at]*0.5;  aIR[this.cI]=apIR;  apIR*=0.5;
      this.cI++; if (this.cI > dI) this.cI = 0;
      apIL += aIL[this.cI];  apIR += aIR[this.cI];

      let apJL=iL, apJR=iR;
      at = this.cJ+1; if (at > dJ) at = 0;
      apJL -= aJL[at]*0.5;  aJL[this.cJ]=apJL;  apJL*=0.5;
      apJR -= aJR[at]*0.5;  aJR[this.cJ]=apJR;  apJR*=0.5;
      this.cJ++; if (this.cJ > dJ) this.cJ = 0;
      apJL += aJL[this.cJ];  apJR += aJR[this.cJ];

      let apKL=iL, apKR=iR;
      at = this.cK+1; if (at > dK) at = 0;
      apKL -= aKL[at]*0.5;  aKL[this.cK]=apKL;  apKL*=0.5;
      apKR -= aKR[at]*0.5;  aKR[this.cK]=apKR;  apKR*=0.5;
      this.cK++; if (this.cK > dK) this.cK = 0;
      apKL += aKL[this.cK];  apKR += aKR[this.cK];

      let apLL=iL, apLR=iR;
      at = this.cL+1; if (at > dL) at = 0;
      apLL -= aLL[at]*0.5;  aLL[this.cL]=apLL;  apLL*=0.5;
      apLR -= aLR[at]*0.5;  aLR[this.cL]=apLR;  apLR*=0.5;
      this.cL++; if (this.cL > dL) this.cL = 0;
      apLL += aLL[this.cL];  apLR += aLR[this.cL];

      // ── Write 8 main delay lines with Householder feedback ───────────
      aAL[this.cA] = apLL + this.fbAL;   aAR[this.cA] = apLR + this.fbAR;
      aBL[this.cB] = apKL + this.fbBL;   aBR[this.cB] = apKR + this.fbBR;
      aCL[this.cC] = apJL + this.fbCL;   aCR[this.cC] = apJR + this.fbCR;
      aDL[this.cD] = apIL + this.fbDL;   aDR[this.cD] = apIR + this.fbDR;
      aEL[this.cE] = apIL + this.fbEL;   aER[this.cE] = apIR + this.fbER;
      aFL[this.cF] = apJL + this.fbFL;   aFR[this.cF] = apJR + this.fbFR;
      aGL[this.cG] = apKL + this.fbGL;   aGR[this.cG] = apKR + this.fbGR;
      aHL[this.cH] = apLL + this.fbHL;   aHR[this.cH] = apLR + this.fbHR;

      this.cA++; if (this.cA > dA) this.cA = 0;
      this.cB++; if (this.cB > dB) this.cB = 0;
      this.cC++; if (this.cC > dC) this.cC = 0;
      this.cD++; if (this.cD > dD) this.cD = 0;
      this.cE++; if (this.cE > dE) this.cE = 0;
      this.cF++; if (this.cF > dF) this.cF = 0;
      this.cG++; if (this.cG > dG) this.cG = 0;
      this.cH++; if (this.cH > dH) this.cH = 0;

      // ── Advance vibrato LFO phases ───────────────────────────────────
      this.vAL += this.dA*VS;  this.vAR += this.dA*VS;
      this.vBL += this.dB*VS;  this.vBR += this.dB*VS;
      this.vCL += this.dC*VS;  this.vCR += this.dC*VS;
      this.vDL += this.dD*VS;  this.vDR += this.dD*VS;
      this.vEL += this.dE*VS;  this.vER += this.dE*VS;
      this.vFL += this.dF*VS;  this.vFR += this.dF*VS;
      this.vGL += this.dG*VS;  this.vGR += this.dG*VS;
      this.vHL += this.dH*VS;  this.vHR += this.dH*VS;

      const oAL=(Math.sin(this.vAL)+1)*VD; const oAR=(Math.sin(this.vAR)+1)*VD;
      const oBL=(Math.sin(this.vBL)+1)*VD; const oBR=(Math.sin(this.vBR)+1)*VD;
      const oCL=(Math.sin(this.vCL)+1)*VD; const oCR=(Math.sin(this.vCR)+1)*VD;
      const oDL=(Math.sin(this.vDL)+1)*VD; const oDR=(Math.sin(this.vDR)+1)*VD;
      const oEL=(Math.sin(this.vEL)+1)*VD; const oER=(Math.sin(this.vER)+1)*VD;
      const oFL=(Math.sin(this.vFL)+1)*VD; const oFR=(Math.sin(this.vFR)+1)*VD;
      const oGL=(Math.sin(this.vGL)+1)*VD; const oGR=(Math.sin(this.vGR)+1)*VD;
      const oHL=(Math.sin(this.vHL)+1)*VD; const oHR=(Math.sin(this.vHR)+1)*VD;

      // ── Modulated + blended reads ────────────────────────────────────
      const iAL=rdBlend(aAL,this.cA,dA,oAL,blend); const iAR=rdBlend(aAR,this.cA,dA,oAR,blend);
      const iBL=rdBlend(aBL,this.cB,dB,oBL,blend); const iBR=rdBlend(aBR,this.cB,dB,oBR,blend);
      const iCL=rdBlend(aCL,this.cC,dC,oCL,blend); const iCR=rdBlend(aCR,this.cC,dC,oCR,blend);
      const iDL=rdBlend(aDL,this.cD,dD,oDL,blend); const iDR=rdBlend(aDR,this.cD,dD,oDR,blend);
      const iEL=rdBlend(aEL,this.cE,dE,oEL,blend); const iER=rdBlend(aER,this.cE,dE,oER,blend);
      const iFL=rdBlend(aFL,this.cF,dF,oFL,blend); const iFR=rdBlend(aFR,this.cF,dF,oFR,blend);
      const iGL=rdBlend(aGL,this.cG,dG,oGL,blend); const iGR=rdBlend(aGR,this.cG,dG,oGR,blend);
      const iHL=rdBlend(aHL,this.cH,dH,oHL,blend); const iHR=rdBlend(aHR,this.cH,dH,oHR,blend);

      // ── Householder feedback matrix (2 × 4 groups) ──────────────────
      this.fbAL = (iAL - (iBL+iCL+iDL)) * regen;
      this.fbBL = (iBL - (iAL+iCL+iDL)) * regen;
      this.fbCL = (iCL - (iAL+iBL+iDL)) * regen;
      this.fbDL = (iDL - (iAL+iBL+iCL)) * regen;
      this.fbEL = (iEL - (iFL+iGL+iHL)) * regen;
      this.fbFL = (iFL - (iEL+iGL+iHL)) * regen;
      this.fbGL = (iGL - (iEL+iFL+iHL)) * regen;
      this.fbHL = (iHL - (iEL+iFL+iGL)) * regen;

      this.fbAR = (iAR - (iBR+iCR+iDR)) * regen;
      this.fbBR = (iBR - (iAR+iCR+iDR)) * regen;
      this.fbCR = (iCR - (iAR+iBR+iDR)) * regen;
      this.fbDR = (iDR - (iAR+iBR+iCR)) * regen;
      this.fbER = (iER - (iFR+iGR+iHR)) * regen;
      this.fbFR = (iFR - (iER+iGR+iHR)) * regen;
      this.fbGR = (iGR - (iER+iFR+iHR)) * regen;
      this.fbHR = (iHR - (iER+iFR+iGR)) * regen;

      // ── Mix 8 taps → biquadB → clip → asin → biquadC ────────────────
      iL = (iAL+iBL+iCL+iDL+iEL+iFL+iGL+iHL) / 8.0;
      iR = (iAR+iBR+iCR+iDR+iER+iFR+iGR+iHR) / 8.0;

      tL = iL * bqB[2] + bqB[7];
      bqB[7]  = iL * bqB[3] - tL * bqB[5] + bqB[8];
      bqB[8]  = iL * bqB[4] - tL * bqB[6];
      iL = tL;
      tR = iR * bqB[2] + bqB[9];
      bqB[9]  = iR * bqB[3] - tR * bqB[5] + bqB[10];
      bqB[10] = iR * bqB[4] - tR * bqB[6];
      iR = tR;

      if (iL >  1.0) iL =  1.0;  if (iL < -1.0) iL = -1.0;
      if (iR >  1.0) iR =  1.0;  if (iR < -1.0) iR = -1.0;

      iL = Math.asin(iL);  iR = Math.asin(iR);

      tL = iL * bqC[2] + bqC[7];
      bqC[7]  = iL * bqC[3] - tL * bqC[5] + bqC[8];
      bqC[8]  = iL * bqC[4] - tL * bqC[6];
      iL = tL;
      tR = iR * bqC[2] + bqC[9];
      bqC[9]  = iR * bqC[3] - tR * bqC[5] + bqC[10];
      bqC[10] = iR * bqC[4] - tR * bqC[6];
      iR = tR;

      outL[n] = iL;
      outR[n] = iR;
    }

    return true;
  }
}

registerProcessor('airwindows-reverb', AirwindowsReverbProcessor);
