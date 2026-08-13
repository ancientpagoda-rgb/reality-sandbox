import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanetEnvironment } from '../src/core/environment.js';
import { createPhysicalChemicalKernel, REACTIONS, SPECIES } from '../src/core/physical-chemical-kernel.js';

function balance(side){const out={};for(const[n,k]of Object.entries(side))for(const[e,c]of Object.entries(SPECIES[n].formula))out[e]=(out[e]??0)+c*k;return out}

test('all reactions are element-balanced',()=>{for(const r of REACTIONS){const a=balance(r.reactants),b=balance(r.products);assert.deepEqual(a,b,r.id)}});

test('deterministic chemistry conserves represented matter',()=>{const g=createPlanetEnvironment({columns:12,rows:6,seed:777,planet:{waterFraction:.34,atmosphereRetention:.63}});const k=createPhysicalChemicalKernel({columns:12,rows:6,seed:123,star:{metallicity:-.03},disk:{carbonToOxygen:.54},planet:{composition:'silicate-rocky',waterFraction:.34,atmosphereRetention:.63,equilibriumTemperature:286},environment:g.environment});for(let i=0;i<200;i++)k.step(.35);const m=k.getMetrics();assert.ok(Number.isFinite(m.organics));assert.ok(m.maxElementDrift<1e-8,`drift=${m.maxElementDrift}`)});
